'use client';

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useQuery, useInfiniteQuery, useMutation, useQueryClient, type QueryClient, type InfiniteData } from '@tanstack/react-query';
import { getRealtime } from '@/lib/realtime';
import { fetcher, FetchError } from '@/lib/fetcher';
import { listRefetchInterval, deepestPageParam } from '@/lib/query-schedule';
import { useAppStore, selectUser } from '@/store/useAppStore';
import { trackEvent, captureError } from '@/providers/ObservabilityProvider';
import {
  OfflineDmSendSignal,
  enqueueOfflineDm,
  discardOfflineDm,
  getQueuedDmsForConversation,
  getOfflineDmQueueCount,
  registerOfflineDmFlushListener,
  startOfflineDmQueueWatcher,
  type QueuedDmMessage,
} from '@/lib/offline-dm-queue';
import type { MessageStatus } from '@/hooks/useMessages';
import type { DiscussionsResponse } from '@/hooks/useMessages';

export interface ConversationSummary {
  id: string;
  otherParticipant: {
    id: string;
    fullName: string | null;
    handle: string | null;
    avatarUrl: string | null;
  };
  lastMessage: string | null;
  lastMessageAt: string | null;
  lastMessageSenderId: string | null;
  unreadCount: number;
}

export interface PersonalMessage {
  id: string;
  conversationId: string;
  sender: { id: string; fullName: string | null; handle: string | null; avatarUrl: string | null };
  content: string;
  createdAt: string;
  /** Client-generated idempotency key (present on optimistic + echoed messages). */
  clientMessageId?: string | null;
  /** Local-only delivery status. Absent on authoritative server messages. */
  status?: MessageStatus;
}

interface OtherParticipantApi {
  id: string;
  full_name: string | null;
  handle: string | null;
  avatar_url: string | null;
}
interface ConversationApi {
  id: string;
  otherParticipant: OtherParticipantApi;
  lastMessage: string | null;
  lastMessageAt: string | null;
  lastMessageSenderId: string | null;
  unreadCount: number;
}
interface MessageApi {
  id: string;
  conversation_id: string;
  sender: OtherParticipantApi;
  content: string;
  created_at: string;
  client_message_id?: string | null;
}
interface MessagesApiResponse { messages: MessageApi[]; total: number; hasMore: boolean; }

function mapSummary(r: ConversationApi): ConversationSummary {
  return {
    id: r.id,
    otherParticipant: {
      id: r.otherParticipant.id,
      fullName: r.otherParticipant.full_name,
      handle: r.otherParticipant.handle,
      avatarUrl: r.otherParticipant.avatar_url,
    },
    lastMessage: r.lastMessage,
    lastMessageAt: r.lastMessageAt,
    lastMessageSenderId: r.lastMessageSenderId,
    unreadCount: r.unreadCount,
  };
}

function mapMessage(r: MessageApi): PersonalMessage {
  return {
    id: r.id,
    conversationId: r.conversation_id,
    sender: {
      id: r.sender.id,
      fullName: r.sender.full_name,
      handle: r.sender.handle,
      avatarUrl: r.sender.avatar_url,
    },
    content: r.content,
    createdAt: r.created_at,
    clientMessageId: r.client_message_id ?? undefined,
  };
}

/** How long an optimistic message waits for the authoritative echo before failing. */
const ACK_TIMEOUT_MS = 10_000;

/** P2-224: navigator.onLine probe — SSR-safe default (online). */
function isNetworkOnline(): boolean {
  if (typeof navigator === 'undefined') return true;
  return navigator.onLine !== false;
}

function mergePersonalMessages(
  history: PersonalMessage[],
  local: PersonalMessage[],
): PersonalMessage[] {
  const historyIds = new Set(history.map((m) => m.id));
  const historyClientIds = new Set(
    history.map((m) => m.clientMessageId).filter((v): v is string => !!v),
  );
  const extra = local.filter((m) => {
    if (historyIds.has(m.id)) return false;
    if (m.clientMessageId && historyClientIds.has(m.clientMessageId)) return false;
    return true;
  });
  return [...history, ...extra];
}

/** Canonical envelope of GET /conversations. */
interface ConversationsResponse {
  conversations: ConversationApi[];
  total: number;
  hasMore: boolean;
}

const CONVERSATIONS_PAGE_SIZE = 50;

/**
 * Direct-message conversation list (Messages tab), paged (50 per page).
 * The API is paginated (?page=&perPage=) — conversation #51 is reachable via
 * fetchNextPage instead of being hard-capped. Consumers get a flat array via
 * `conversations` (all loaded pages concatenated); BadgeHydrator and the
 * thread header consume page-1 semantics and are unaffected by the shape.
 */
export function useConversations() {
  const query = useInfiniteQuery({
    queryKey: ['conversations', 'infinite'],
    initialPageParam: 1,
    queryFn: async ({ pageParam }): Promise<ConversationsResponse> => {
      const data = await fetcher<ConversationsResponse>(
        `/conversations?page=${pageParam}&perPage=${CONVERSATIONS_PAGE_SIZE}`,
      );
      return data;
    },
    getNextPageParam: (lastPage, allPages) =>
      lastPage.hasMore ? allPages.length + 1 : undefined,
    maxPages: 10,
    staleTime: 30_000,
    // Freshness poll — page-1 only (see listRefetchInterval / F4 fan-out).
    refetchInterval: ({ state }) =>
      listRefetchInterval({
        isFetching: state.fetchStatus === 'fetching',
        pageParam: deepestPageParam(state.data),
      }),
  });

  const conversations = useMemo(
    () => query.data?.pages.flatMap((page) => page.conversations.map(mapSummary)) ?? [],
    [query.data],
  );

  return {
    conversations,
    total: query.data?.pages[0]?.total,
    hasMore: Boolean(query.hasNextPage),
    fetchNextPage: () => {
      void query.fetchNextPage();
    },
    isFetchingNextPage: query.isFetchingNextPage,
    isLoading: query.isLoading,
    error: (query.error as FetchError | null) ?? null,
    refetch: () => {
      void query.refetch();
    },
  };
}

interface ConversationCreatedApi {
  id: string;
  participants: Array<{
    id: string;
    full_name: string | null;
    handle: string | null;
    avatar_url: string | null;
  }>;
  created_at: string;
}

/**
 * Find-or-create the 1:1 conversation with a target user (profile → Message).
 * The server dedupes per user pair (pair_key unique index + race recovery),
 * so repeated taps always converge on the same conversation id.
 */
export function useStartConversation() {
  const queryClient = useQueryClient();

  return useMutation<ConversationCreatedApi, FetchError, string>({
    mutationFn: (targetUserId: string) =>
      fetcher<ConversationCreatedApi>('/conversations', {
        method: 'POST',
        body: JSON.stringify({ userId: targetUserId }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      queryClient.invalidateQueries({ queryKey: ['discussions'] });
    },
  });
}

/**
 * Conversation history + real-time DM via the /lobby WebSocket.
 * Sends are optimistic (append `sending` → reconcile `sent` on `new-dm`,
 * or `failed` after ack timeout/error with retry). REST fallback on socket
 * disconnect, mirroring `useMatchChat`.
 */
/**
 * Optimistically zero the unread count for one conversation in EVERY cached
 * query that renders an unread badge:
 * - ['conversations', 'infinite'] — InfiniteData<{conversations: ConversationSummary[]}> (DM list)
 * - ['user','me','discussions']  — InfiniteData<{discussions: raw envelope}> (Messages screen, raw
 *   pre-adapter envelope; its discussion rows carry the camelCase unreadCount)
 * Called when the user reads a thread (incoming-while-open or on leaving), so
 * no list shows a stale unread dot for messages they've seen. A following
 * invalidation reconciles with the server's authoritative counts.
 *
 * (F2 fix, 2026-09-22: the old code wrote an infinite shape into a query that
 * held a flat array, so the ['conversations'] branch never matched — the badge
 * only cleared after the refetch. This walks the real cached shapes.)
 */
function zeroCachedUnread(queryClient: QueryClient, conversationId: string | null) {
  if (!conversationId) return;
  queryClient.setQueriesData<InfiniteData<ConversationsResponse>>(
    { queryKey: ['conversations'] },
    (data) => {
      if (!data?.pages) return data;
      let changed = false;
      const pages = data.pages.map((page) => ({
        ...page,
        conversations: page.conversations.map((conv) => {
          if (conv.id !== conversationId || conv.unreadCount === 0) return conv;
          changed = true;
          return { ...conv, unreadCount: 0 };
        }),
      }));
      return changed ? { ...data, pages } : data;
    },
  );
  queryClient.setQueriesData<InfiniteData<DiscussionsResponse>>(
    { queryKey: ['user', 'me', 'discussions'] },
    (data) => {
      if (!data?.pages) return data;
      let changed = false;
      const pages = data.pages.map((page) => ({
        ...page,
        discussions: page.discussions.map((d) => {
          if (d.id !== conversationId || d.unreadCount === 0) return d;
          changed = true;
          return { ...d, unreadCount: 0 };
        }),
      }));
      return changed ? { ...data, pages } : data;
    },
  );
}

export function useConversationMessages(conversationId: string | null) {
  const queryClient = useQueryClient();
  const currentUser = useAppStore(selectUser);
  const rt = getRealtime();
  const [localMessages, setLocalMessages] = useState<PersonalMessage[]>([]);
  // Messages from the OTHER user that arrived while this thread is open —
  // cleared by emitting mark-read once the socket confirms delivery.
  const [unreadIncomingIds, setUnreadIncomingIds] = useState<Set<string>>(new Set());
  const ackTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  // P2-225 (run #149): DM typing indicator — mirrors useMatchChat (P2-99).
  // Stateless: the peer's client re-emits every ~2.5s while typing; receivers
  // expire the signal after 4s of silence. WS-only, no REST fallback.
  const [typingUserIds, setTypingUserIds] = useState<Set<string>>(new Set());
  const typingTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const lastTypingSentRef = useRef(0);
  const TYPING_EMIT_INTERVAL_MS = 2_500;
  const TYPING_EXPIRE_MS = 4_000;
  // P2-224: fired when a send parks in the offline queue — the page shows the
  // queued-confirmation toast (same affordance as ChatSheet's P2-172 toast).
  const [queuedToast, setQueuedToast] = useState(false);
  const queuedToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onQueuedRef = useRef<(() => void) | null>(null);
  onQueuedRef.current = useCallback(() => {
    setQueuedToast(true);
    if (queuedToastTimerRef.current) clearTimeout(queuedToastTimerRef.current);
    queuedToastTimerRef.current = setTimeout(() => setQueuedToast(false), 4_000);
  }, []);
  // P2-224 (PR-Agent run #148 MINOR): the queued backfill reads
  // window.localStorage — gate it on mount so the first client render matches
  // the server markup (run #49 hydration-safety pattern); parked bubbles
  // appear immediately after hydration.
  const [isMounted, setIsMounted] = useState(false);
  useEffect(() => setIsMounted(true), []);

  const historyQuery = useQuery<PersonalMessage[], FetchError>({
    queryKey: ['conversation', conversationId, 'messages'],
    queryFn: async () => {
      const data = await fetcher<MessagesApiResponse>(`/conversations/${conversationId}/messages`);
      return data.messages.map(mapMessage);
    },
    enabled: !!conversationId,
    staleTime: 15_000,
  });

  const reconcile = useCallback(
    (message: PersonalMessage) => {
      if (message.clientMessageId) {
        const timer = ackTimersRef.current.get(message.clientMessageId);
        if (timer) {
          clearTimeout(timer);
          ackTimersRef.current.delete(message.clientMessageId);
        }
      }

      setLocalMessages((prev) => {
        const index = prev.findIndex(
          (m) => m.clientMessageId && m.clientMessageId === message.clientMessageId,
        );
        if (index >= 0) {
          // Our optimistic message got its authoritative echo/REST ack.
          if (message.sender.id === currentUser?.id) {
            trackEvent('dm_message_sent', { conversationId: message.conversationId });
          }
          const next = [...prev];
          next[index] = { ...message, status: 'sent' };
          return next;
        }
        if (prev.some((m) => m.id === message.id)) return prev; // dedup by server id
        // A message from the OTHER user arrived while the thread is open —
        // flag it so the mark-read effect advances the read cursor.
        if (message.sender.id !== currentUser?.id) {
          setUnreadIncomingIds((prevIds) => new Set(prevIds).add(message.id));
        }
        return [...prev, message];
      });

      // Keep the conversation list (last message + unread) in sync.
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
    [queryClient, currentUser?.id],
  );

  // ── Read receipts ─────────────────────────────────────────────────────────
  // Advance my own read cursor when: the thread opens, or a message from the
  // OTHER user lands while it's open (join-conversation only covers entry).
  useEffect(() => {
    if (!conversationId) return;
    if (unreadIncomingIds.size === 0) return;
    if (!rt.isConnected()) return;
    rt.emit('mark-read', { conversationId });
    setUnreadIncomingIds(new Set());
    zeroCachedUnread(queryClient, conversationId);
    queryClient.invalidateQueries({ queryKey: ['conversations'] });
  }, [conversationId, unreadIncomingIds, queryClient, rt]);

  // The user is leaving the thread — persist the final read cursor AND zero
  // the cached unread badge so the list doesn't show a stale dot for messages
  // they just saw (the common case: message was already in the history).
  const conversationIdRef = useRef<string | null>(conversationId);
  conversationIdRef.current = conversationId;
  useEffect(
    () => () => {
      const id = conversationIdRef.current;
      if (rt.isConnected() && id) {
        rt.emit('mark-read', { conversationId: id });
      }
      zeroCachedUnread(queryClient, id);
    },
    [queryClient, rt],
  );

  useEffect(() => {
    if (!conversationId) return;
    const ackTimers = ackTimersRef.current;

    rt.connect();
    rt.joinRoom('conversation', conversationId);

    const onNewDm = (payload: unknown) => {
      reconcile(mapMessage(payload as MessageApi));
    };
    const offNewDm = rt.on('new-dm', onNewDm);

    // P2-225: peer typing signals — add the userId, re-arm the 4s expiry on
    // every signal, ignore the own-user echo (server skips the sender;
    // belt+braces) and unknown payloads.
    const onConvTyping = (payload: { userId?: string }) => {
      const userId = payload?.userId;
      if (!userId || userId === currentUser?.id) return;
      setTypingUserIds((prev) => {
        if (prev.has(userId)) return prev;
        const next = new Set(prev);
        next.add(userId);
        return next;
      });
      const existing = typingTimersRef.current.get(userId);
      if (existing) clearTimeout(existing);
      typingTimersRef.current.set(
        userId,
        setTimeout(() => {
          typingTimersRef.current.delete(userId);
          setTypingUserIds((prev) => {
            if (!prev.has(userId)) return prev;
            const next = new Set(prev);
            next.delete(userId);
            return next;
          });
        }, TYPING_EXPIRE_MS),
      );
    };
    const offConvTyping = rt.on('conv-typing', onConvTyping);

    // NOTE: no manual 'join-conversation' emit here — joinRoom() above already
    // emits it (first ref) and socket.io buffers it until the socket connects.
    // A second emit double-fires the server's markRead-on-join (Slice 2 review).

    return () => {
      offNewDm();
      offConvTyping();
      rt.leaveRoom('conversation', conversationId);
      rt.disconnect();
      setLocalMessages([]);
      // P2-225: clear all typing expiry timers + state on unmount/switch
      // (no setState-after-unmount; a new thread starts signal-free).
      typingTimersRef.current.forEach(clearTimeout);
      typingTimersRef.current.clear();
      setTypingUserIds(new Set());
      ackTimers.forEach(clearTimeout);
      ackTimers.clear();
    };
  }, [conversationId, reconcile, rt, currentUser?.id]);

  const sendMessage = useMutation<
    PersonalMessage | undefined,
    Error,
    { content: string; clientMessageId: string }
  >({
    mutationFn: async ({ content, clientMessageId }) => {
      // P2-224: an offline send never reaches the wire — the onError branch
      // parks it in the persisted DM queue; flushOfflineDmQueue replays it
      // with the SAME clientMessageId on reconnect (server dedupes replays).
      if (!isNetworkOnline()) throw new OfflineDmSendSignal();
      if (rt.isConnected()) {
        rt.emit('send-dm', { conversationId, content, clientMessageId });
        // Authoritative message arrives via the `new-dm` echo.
        return undefined;
      }
      return fetcher<MessageApi>(`/conversations/${conversationId}/messages`, {
        method: 'POST',
        body: JSON.stringify({ content, clientMessageId }),
      }).then(mapMessage);
    },
    onMutate: ({ content, clientMessageId }) => {
      const optimistic: PersonalMessage = {
        id: `local-${clientMessageId}`,
        conversationId: conversationId ?? '',
        sender: {
          id: currentUser?.id ?? '',
          fullName: currentUser?.fullName ?? '',
          handle: currentUser?.handle ?? '',
          avatarUrl: currentUser?.avatarUrl ?? '',
        },
        content,
        createdAt: new Date().toISOString(),
        clientMessageId,
        status: 'sending',
      };

      setLocalMessages((prev) => {
        const existing = prev.find((m) => m.clientMessageId === clientMessageId);
        if (existing) {
          return prev.map((m) =>
            m.clientMessageId === clientMessageId ? { ...m, status: 'sending' } : m,
          );
        }
        return [...prev, optimistic];
      });

      const timer = setTimeout(() => {
        setLocalMessages((prev) =>
          prev.map((m) =>
            m.clientMessageId === clientMessageId ? { ...m, status: 'failed' } : m,
          ),
        );
        ackTimersRef.current.delete(clientMessageId);
      }, ACK_TIMEOUT_MS);
      ackTimersRef.current.set(clientMessageId, timer);
    },
    onSuccess: (data, { clientMessageId }) => {
      // P2-224: any successful delivery (including a manual retry of a
      // flush-failed message) retires the queue entry — retry is the
      // user-driven escape hatch from a failed flush.
      discardOfflineDm(clientMessageId);
      if (data && data.clientMessageId === clientMessageId) {
        reconcile(data);
      }
      queryClient.invalidateQueries({ queryKey: ['conversation', conversationId, 'messages'] });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
    onError: (err, { content, clientMessageId }) => {
      // P2-224: offline send — park the message in the persisted queue and
      // keep the bubble `queued` (no failure UX). The flusher replays it with
      // the SAME clientMessageId on reconnect.
      if (err instanceof OfflineDmSendSignal) {
        // Orphan guard (P2-172 parity): an entry parked with no owner can
        // never replay (the flusher bails without a user) nor backfill — it
        // would sit as a dead bubble forever. Fail LOUDLY instead.
        const currentUserId = currentUser?.id;
        if (!currentUserId) {
          setLocalMessages((prev) =>
            prev.map((m) =>
              m.clientMessageId === clientMessageId ? { ...m, status: 'failed' } : m,
            ),
          );
          const timer = ackTimersRef.current.get(clientMessageId);
          if (timer) {
            clearTimeout(timer);
            ackTimersRef.current.delete(clientMessageId);
          }
          return;
        }
        const entry: QueuedDmMessage = {
          conversationId: conversationId ?? '',
          content,
          clientMessageId,
          queuedAt: new Date().toISOString(),
          // Owner binding: entries replay only under the authoring session —
          // never under a different account.
          userId: currentUserId,
        };
        enqueueOfflineDm(entry);
        // Stand down the 10s ack timer: a parked bubble waits for RECONNECT,
        // not an echo — left running it silently flipped queued → failed
        // after 10s while the message was still safely queued (P2-172
        // run-#145 finding). The flusher owns queued → sent/failed from here.
        const queuedTimer = ackTimersRef.current.get(clientMessageId);
        if (queuedTimer) {
          clearTimeout(queuedTimer);
          ackTimersRef.current.delete(clientMessageId);
        }
        setLocalMessages((prev) =>
          prev.map((m) =>
            m.clientMessageId === clientMessageId ? { ...m, status: 'queued' } : m,
          ),
        );
        startOfflineDmQueueWatcher();
        onQueuedRef.current?.();
        return;
      }
      captureError(err, { scope: 'dmSend', conversationId, clientMessageId });
      setLocalMessages((prev) =>
        prev.map((m) =>
          m.clientMessageId === clientMessageId ? { ...m, status: 'failed' } : m,
        ),
      );
      const timer = ackTimersRef.current.get(clientMessageId);
      if (timer) {
        clearTimeout(timer);
        ackTimersRef.current.delete(clientMessageId);
      }
    },
  });

  const retryMessage = useCallback(
    (clientMessageId: string, content: string) => {
      sendMessage.mutate({ content, clientMessageId });
    },
    [sendMessage],
  );

  // ── P2-224: offline-queue backfill + flush reconciliation ────────────────
  // Queued DMs from a PREVIOUS session (page closed before reconnect)
  // backfill into the view as `queued` so they never vanish — filtered
  // against local + history clientMessageIds.
  const currentUserId = currentUser?.id;
  const queuedForConversation: PersonalMessage[] =
    isMounted && conversationId && currentUserId
      ? getQueuedDmsForConversation(conversationId, currentUserId)
          .filter(
            (q) =>
              !localMessages.some((m) => m.clientMessageId === q.clientMessageId) &&
              !(historyQuery.data ?? []).some(
                (m) => m.clientMessageId === q.clientMessageId,
              ),
          )
          .map((q) => ({
            id: `queued-${q.clientMessageId}`,
            conversationId: q.conversationId,
            sender: {
              id: currentUser?.id ?? '',
              fullName: currentUser?.fullName ?? null,
              handle: currentUser?.handle ?? null,
              avatarUrl: currentUser?.avatarUrl ?? null,
            },
            content: q.content,
            createdAt: q.queuedAt,
            clientMessageId: q.clientMessageId,
            status: 'queued' as const,
          }))
    : [];

  // While this thread is open, a flush delivery for ANY conversation
  // reconciles into the local view (dedup on clientMessageId); a delivery
  // for a backfilled entry is APPENDED — otherwise discarding the queue
  // entry would make the delivered bubble vanish. ONLY this conversation's
  // deliveries land in this view (the flusher fans out for every
  // conversation). A flush FAILURE flips the bubble to `failed`.
  const threadIdRef = useRef<string | null>(conversationId);
  threadIdRef.current = conversationId;
  useEffect(
    () =>
      registerOfflineDmFlushListener((delivery, failedEntry) => {
        if (delivery) {
          setLocalMessages((prev) => {
            const index = prev.findIndex(
              (m) => m.clientMessageId === delivery.clientMessageId,
            );
            if (index >= 0) {
              const next = [...prev];
              next[index] = { ...next[index], status: 'sent' };
              return next;
            }
            // Backfilled (previous-session) entry: persist the delivery with
            // its REAL content (carried by the delivery) — but ONLY for this
            // thread's conversation.
            if (delivery.conversationId === threadIdRef.current) {
              return [
                ...prev,
                {
                  id: `flushed-${delivery.clientMessageId}`,
                  conversationId: delivery.conversationId,
                  sender: {
                    id: currentUser?.id ?? '',
                    fullName: currentUser?.fullName ?? null,
                    handle: currentUser?.handle ?? null,
                    avatarUrl: currentUser?.avatarUrl ?? null,
                  },
                  content: delivery.content,
                  createdAt: delivery.queuedAt,
                  clientMessageId: delivery.clientMessageId,
                  status: 'sent' as const,
                },
              ];
            }
            return prev;
          });
          queryClient.invalidateQueries({ queryKey: ['conversation', threadIdRef.current, 'messages'] });
          return;
        }
        if (failedEntry) {
          setLocalMessages((prev) => {
            const index = prev.findIndex(
              (m) => m.clientMessageId === failedEntry.clientMessageId,
            );
            if (index >= 0) {
              return prev.map((m) =>
                m.clientMessageId === failedEntry.clientMessageId
                  ? { ...m, status: 'failed' }
                  : m,
              );
            }
            // A backfilled (previous-session) entry that fails its flush is
            // NOT in localMessages (it renders via queuedForConversation) —
            // append the failed bubble so it never stays a stuck spinner.
            // It shadows the queued backfill via the clientMessageId filter.
            if (failedEntry.conversationId === threadIdRef.current) {
              return [
                ...prev,
                {
                  id: `flushed-${failedEntry.clientMessageId}`,
                  conversationId: failedEntry.conversationId,
                  sender: {
                    id: currentUser?.id ?? '',
                    fullName: currentUser?.fullName ?? null,
                    handle: currentUser?.handle ?? null,
                    avatarUrl: currentUser?.avatarUrl ?? null,
                  },
                  content: failedEntry.content,
                  createdAt: failedEntry.queuedAt,
                  clientMessageId: failedEntry.clientMessageId,
                  status: 'failed' as const,
                },
              ];
            }
            return prev;
          });
        }
      }),
    [currentUser?.id, queryClient],
  );

  // Arm the module flusher once per session (idempotent).
  useEffect(() => {
    startOfflineDmQueueWatcher();
  }, []);

  // ── Typing emitter (P2-225) ────────────────────────────────────────────────
  // Throttled: at most one WS emit per 2.5s while the user keeps typing. The
  // server relays to everyone except the typer; receivers expire the signal
  // after 4s of silence. WS-only: typing is ephemeral presence — silently
  // dropped when offline. Sent even before history resolves (typing is
  // presence, not data).
  const emitTyping = useCallback(() => {
    if (!rt.isConnected() || !conversationId) return;
    const now = Date.now();
    if (now - lastTypingSentRef.current < TYPING_EMIT_INTERVAL_MS) return;
    lastTypingSentRef.current = now;
    rt.emit('conv-typing', { conversationId });
  }, [conversationId, rt]);

  const messages = mergePersonalMessages(historyQuery.data ?? [], [
    ...localMessages,
    ...queuedForConversation,
  ]);

  return {
    ...historyQuery,
    messages,
    sendMessage,
    retryMessage,
    // P2-224 offline-queue surface: queued toast flag + THIS user's entries
    // still parked for THIS conversation (the authoritative retry backlog).
    queuedToast,
    queuedCount:
      conversationId && currentUserId
        ? getOfflineDmQueueCount(conversationId, currentUserId)
        : 0,
    // P2-225 typing surface: peer userIds typing now + throttled emit fn.
    typingUserIds,
    emitTyping,
  };
}
