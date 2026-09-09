'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import type { Socket } from 'socket.io-client';
import { fetcher, FetchError } from '@/lib/fetcher';
import { createLobbySocket } from '@/lib/socket';
import { useAppStore, selectUser } from '@/store/useAppStore';
import { trackEvent, captureError } from '@/providers/ObservabilityProvider';
import type { MessageStatus } from '@/hooks/useMessages';
import type { Discussion } from '@/lib/discussion-adapter';

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
interface ConversationsApiResponse { conversations: ConversationApi[]; total: number; hasMore: boolean; }
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

/** Direct-message conversation list (Messages tab). */
export function useConversations() {
  return useQuery<ConversationSummary[], FetchError>({
    queryKey: ['conversations'],
    queryFn: async () => {
      const data = await fetcher<ConversationsApiResponse>('/conversations');
      return data.conversations.map(mapSummary);
    },
    staleTime: 30_000,
  });
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
 * query that renders an unread badge — the bottom-nav badge cache
 * (['conversations'], infinite pages) and the Messages list cache
 * (['user','me','discussions'], a plain array). Called when the user reads a
 * thread (incoming-while-open or on leaving), so the list never shows a stale
 * unread dot for messages they've seen. A following invalidation reconciles
 * with the server's authoritative counts.
 */
function zeroCachedUnread(queryClient: QueryClient, conversationId: string | null) {
  if (!conversationId) return;
  queryClient.setQueriesData<{ pages: { items: ConversationSummary[] }[] }>(
    { queryKey: ['conversations'] },
    (data) => {
      if (!data?.pages) return data;
      let changed = false;
      const pages = data.pages.map((page) => ({
        ...page,
        items: page.items.map((conv) => {
          if (conv.id !== conversationId || conv.unreadCount === 0) return conv;
          changed = true;
          return { ...conv, unreadCount: 0 };
        }),
      }));
      return changed ? { ...data, pages } : data;
    },
  );
  queryClient.setQueriesData<Discussion[]>({ queryKey: ['user', 'me', 'discussions'] }, (data) => {
    if (!data) return data;
    let changed = false;
    const next = data.map((d) => {
      if (d.id !== conversationId || d.unreadCount === 0) return d;
      changed = true;
      return { ...d, unreadCount: 0 };
    });
    return changed ? next : data;
  });
}

export function useConversationMessages(conversationId: string | null) {
  const queryClient = useQueryClient();
  const currentUser = useAppStore(selectUser);
  const [localMessages, setLocalMessages] = useState<PersonalMessage[]>([]);
  // Messages from the OTHER user that arrived while this thread is open —
  // cleared by emitting mark-read once the socket confirms delivery.
  const [unreadIncomingIds, setUnreadIncomingIds] = useState<Set<string>>(new Set());
  const socketRef = useRef<Socket | null>(null);
  const ackTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

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
    const socket = socketRef.current;
    if (!socket?.connected) return;
    socket.emit('mark-read', { conversationId });
    setUnreadIncomingIds(new Set());
    zeroCachedUnread(queryClient, conversationId);
    queryClient.invalidateQueries({ queryKey: ['conversations'] });
  }, [conversationId, unreadIncomingIds, queryClient]);

  // The user is leaving the thread — persist the final read cursor AND zero
  // the cached unread badge so the list doesn't show a stale dot for messages
  // they just saw (the common case: message was already in the history).
  const conversationIdRef = useRef<string | null>(conversationId);
  conversationIdRef.current = conversationId;
  useEffect(
    () => () => {
      const id = conversationIdRef.current;
      if (socketRef.current?.connected && id) {
        socketRef.current.emit('mark-read', { conversationId: id });
      }
      zeroCachedUnread(queryClient, id);
    },
    [queryClient],
  );

  useEffect(() => {
    if (!conversationId) return;
    const ackTimers = ackTimersRef.current;

    const socket: Socket = createLobbySocket(5);

    socket.on('connect', () => {
      socketRef.current = socket;
      socket.emit('join-conversation', { conversationId });
    });

    socket.on('new-dm', (message: MessageApi) => {
      reconcile(mapMessage(message));
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
      setLocalMessages([]);
      ackTimers.forEach(clearTimeout);
      ackTimers.clear();
    };
  }, [conversationId, reconcile]);

  const sendMessage = useMutation<
    PersonalMessage | undefined,
    Error,
    { content: string; clientMessageId: string }
  >({
    mutationFn: async ({ content, clientMessageId }) => {
      if (socketRef.current?.connected) {
        socketRef.current.emit('send-dm', { conversationId, content, clientMessageId });
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
      if (data && data.clientMessageId === clientMessageId) {
        reconcile(data);
      }
      queryClient.invalidateQueries({ queryKey: ['conversation', conversationId, 'messages'] });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
    onError: (_err, { clientMessageId }) => {
      captureError(_err, { scope: 'dmSend', conversationId, clientMessageId });
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

  const messages = mergePersonalMessages(historyQuery.data ?? [], localMessages);

  return { ...historyQuery, messages, sendMessage, retryMessage };
}
