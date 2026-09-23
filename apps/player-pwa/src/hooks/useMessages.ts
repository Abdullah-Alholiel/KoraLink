'use client';

import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { Socket } from 'socket.io-client';
import { fetcher, FetchError } from '@/lib/fetcher';
import { createLobbySocket } from '@/lib/socket';
import { useAppStore, selectUser } from '@/store/useAppStore';
import {
  adaptDiscussionList,
  type DiscussionsApiResponse,
} from '@/lib/discussion-adapter';
import type { Discussion } from '@/types';

// ─── Types ────────────────────────────────────────────

export type MessageStatus = 'sending' | 'sent' | 'failed';

export interface MatchMessage {
  id: string;
  match_id: string;
  user_id: string;
  content: string;
  created_at: string;
  user: {
    id: string;
    full_name: string | null;
    handle: string | null;
    avatar_url: string | null;
  };
  /** Client-generated idempotency key (present on optimistic + echoed messages). */
  client_message_id?: string | null;
  /** Local-only delivery status. Absent on authoritative server messages. */
  status?: MessageStatus;
}

export interface MyJoinedMatch {
  id: string;
  title: string;
  status: string;
  scheduled_at: string;
  max_players: number;
  price_per_player: number;
  spots_filled: number;
  venue_name: string;
  venue_city: string;
}

/** How long an optimistic message waits for the authoritative echo before failing. */
const ACK_TIMEOUT_MS = 10_000;

// ─── My Joined Matches (Active Discussions list) ──────

export function useMyMatches() {
  return useQuery<MyJoinedMatch[], FetchError>({
    queryKey: ['user', 'me', 'matches'],
    queryFn: () => fetcher<MyJoinedMatch[]>('/users/me/matches'),
  });
}

// ─── Unified Discussions (Messages screen) ────────────

/** Canonical envelope of GET /users/me/discussions. */
export interface DiscussionsResponse {
  discussions: DiscussionsApiResponse['discussions'];
  total: number;
  hasMore: boolean;
}

const DISCUSSIONS_PAGE_SIZE = 30;

/**
 * Unified discussions, paged (30 per page). The API is paginated
 * (?page=&perPage=) — every joined match creates a discussion row, so the
 * list outgrows one page for active players. Consumers get a flat array via
 * `discussions` (all loaded pages concatenated); `hasMore`/`fetchNextPage`
 * drive the "Load more" affordance.
 */
export function useDiscussions() {
  const query = useInfiniteQuery({
    queryKey: ['user', 'me', 'discussions'],
    initialPageParam: 1,
    queryFn: async ({ pageParam }): Promise<DiscussionsResponse> => {
      const data = await fetcher<DiscussionsResponse>(
        `/users/me/discussions?page=${pageParam}&perPage=${DISCUSSIONS_PAGE_SIZE}`,
      );
      return data;
    },
    getNextPageParam: (lastPage, allPages) => {
      if (!lastPage.hasMore) return undefined;
      return allPages.length + 1;
    },
    maxPages: 10,
  });

  const discussions = useMemo(
    () =>
      (query.data?.pages.flatMap((page) => adaptDiscussionList(page)) ??
        []) as Discussion[],
    [query.data],
  );

  return {
    discussions,
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

// ─── Match Chat: REST history + WebSocket real-time ───

/**
 * Merge the authoritative REST history with locally-appended messages
 * (optimistic + real-time), deduplicating on server id and client id so a
 * history refetch never double-renders a message that is also held locally.
 */
function mergeMessages(
  history: MatchMessage[],
  local: MatchMessage[],
): MatchMessage[] {
  const historyIds = new Set(history.map((m) => m.id));
  const historyClientIds = new Set(
    history.map((m) => m.client_message_id).filter((v): v is string => !!v),
  );
  const extra = local.filter((m) => {
    if (historyIds.has(m.id)) return false;
    if (m.client_message_id && historyClientIds.has(m.client_message_id)) return false;
    return true;
  });
  return [...history, ...extra];
}

/**
 * Fetches chat history via REST and subscribes to the /lobby WebSocket
 * gateway for live `new-message` events. Sends are optimistic: the message
 * is appended immediately (status `sending`), cleared from the input, then
 * reconciled against the server echo (status `sent`) or marked `failed`
 * after an ack timeout / error so the user can retry without retyping.
 */
export function useMatchChat(matchId: string | null) {
  const queryClient = useQueryClient();
  const currentUser = useAppStore(selectUser);
  const [localMessages, setLocalMessages] = useState<MatchMessage[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  const ackTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  // REST history query
  const historyQuery = useQuery<MatchMessage[], FetchError>({
    queryKey: ['match', matchId, 'messages'],
    queryFn: () => fetcher<MatchMessage[]>(`/matches/${matchId}/messages`),
    enabled: !!matchId,
  });

  // Reconcile an authoritative message into local state (replace the matching
  // optimistic message in place, or append if it's a new/other-user message).
  const reconcile = useCallback(
    (message: MatchMessage) => {
      if (message.client_message_id) {
        const timer = ackTimersRef.current.get(message.client_message_id);
        if (timer) {
          clearTimeout(timer);
          ackTimersRef.current.delete(message.client_message_id);
        }
      }

      setLocalMessages((prev) => {
        const index = prev.findIndex(
          (m) => m.client_message_id && m.client_message_id === message.client_message_id,
        );
        if (index >= 0) {
          const next = [...prev];
          next[index] = { ...message, status: 'sent' };
          return next;
        }
        if (prev.some((m) => m.id === message.id)) return prev; // dedup by server id
        return [...prev, message];
      });

      // Keep the match-detail "Latest Discussion" preview in sync.
      queryClient.invalidateQueries({ queryKey: ['match', matchId] });
    },
    [queryClient, matchId],
  );

  // Socket.IO subscription (real-time)
  useEffect(() => {
    if (!matchId) return;
    const ackTimers = ackTimersRef.current;

    const socket: Socket = createLobbySocket(5);

    socket.on('connect', () => {
      setIsConnected(true);
      socketRef.current = socket;
      socket.emit('join-lobby', { matchId });
    });

    socket.on('disconnect', () => setIsConnected(false));

    socket.on('new-message', (message: MatchMessage) => {
      reconcile(message);
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
      setLocalMessages([]);
      ackTimers.forEach(clearTimeout);
      ackTimers.clear();
    };
  }, [matchId, reconcile]);

  // ── Read watermark (P2-58, run #50) ──────────────────────────────────────
  // While the sheet is open, advance the caller's match-chat read watermark
  // on open and on every newly-reconciled message, so the Messages list stops
  // counting the match as unread (parity with personal-conversation badges).
  const markChatRead = useCallback(
    () => {
      if (!matchId) return;
      if (socketRef.current?.connected) {
        socketRef.current.emit('mark-chat-read', { matchId });
        return;
      }
      // Socket down → REST fallback (same guard chain server-side).
      fetcher<{ ok: true }>(`/matches/${matchId}/messages/read`, {
        method: 'POST',
        body: JSON.stringify({}),
      }).catch(() => {
        // Best-effort: a missed watermark only leaves a stale badge.
      });
    },
    [matchId],
  );

  useEffect(() => {
    if (!matchId) return;
    // Open-mark fires UNCONDITIONALLY on matchId change (sheet open): WS when
    // connected, REST otherwise. Gating it on isConnected would leave chats
    // permanently unread whenever the sheet is opened while the socket is
    // down — history lives in the query cache, so no other path would fire.
    markChatRead();
    // On close/unmount: invalidate the discussions cache so the Messages
    // badge reflects the advanced watermark on back-navigation (staleTime
    // would otherwise serve a pre-read count for up to 30s).
    return () => {
      queryClient.invalidateQueries({ queryKey: ['user', 'me', 'discussions'] });
    };
  }, [matchId, markChatRead, queryClient]);

  // Track which server-ids we already marked read to avoid repeat writes
  // when reconcile replays the same authoritative message (dedup by id);
  // ONE watermark write per batch — never per message. Lives AFTER the
  // merged `messages` view is computed (see bottom of the hook).
  const markedReadIdsRef = useRef<Set<string>>(new Set());

  // Reset the dedup set on match switch (P2-62, run #51): the ref lives for
  // the hook's lifetime, so ids from a previous match would otherwise
  // accumulate unbounded within a session. Runs in the same pass as the
  // open-mark effect above — the new match's marks are never suppressed.
  useEffect(() => {
    markedReadIdsRef.current = new Set();
  }, [matchId]);

  // ── Send message (optimistic + WS primary, REST fallback) ──
  const sendMessage = useMutation<
    MatchMessage | undefined,
    Error,
    { content: string; clientMessageId: string }
  >({
    mutationFn: async ({ content, clientMessageId }) => {
      if (socketRef.current?.connected) {
        socketRef.current.emit('send-message', { matchId, content, clientMessageId });
        // Authoritative message arrives via the `new-message` echo.
        return undefined;
      }
      // REST fallback when the socket is not connected.
      return fetcher<MatchMessage>(`/matches/${matchId}/messages`, {
        method: 'POST',
        body: JSON.stringify({ content, clientMessageId }),
      });
    },
    onMutate: ({ content, clientMessageId }) => {
      const optimistic: MatchMessage = {
        id: `local-${clientMessageId}`,
        match_id: matchId ?? '',
        user_id: currentUser?.id ?? '',
        content,
        created_at: new Date().toISOString(),
        user: {
          id: currentUser?.id ?? '',
          full_name: currentUser?.fullName ?? '',
          handle: currentUser?.handle ?? '',
          avatar_url: currentUser?.avatarUrl ?? '',
        },
        client_message_id: clientMessageId,
        status: 'sending',
      };

      setLocalMessages((prev) => {
        // A retry reuses the same clientMessageId — flip the failed message
        // back to `sending` instead of appending a duplicate.
        const existing = prev.find((m) => m.client_message_id === clientMessageId);
        if (existing) {
          return prev.map((m) =>
            m.client_message_id === clientMessageId ? { ...m, status: 'sending' } : m,
          );
        }
        return [...prev, optimistic];
      });

      // If the echo never arrives (lost emit / dropped connection), surface a
      // failed state so the user can retry rather than seeing a stuck bubble.
      const timer = setTimeout(() => {
        setLocalMessages((prev) =>
          prev.map((m) =>
            m.client_message_id === clientMessageId ? { ...m, status: 'failed' } : m,
          ),
        );
        ackTimersRef.current.delete(clientMessageId);
      }, ACK_TIMEOUT_MS);
      ackTimersRef.current.set(clientMessageId, timer);
    },
    onSuccess: (data, { clientMessageId }) => {
      // REST fallback returns the created message directly → reconcile it.
      if (data && 'id' in data && data.client_message_id === clientMessageId) {
        reconcile(data);
      }
    },
    onError: (_err, { clientMessageId }) => {
      setLocalMessages((prev) =>
        prev.map((m) =>
          m.client_message_id === clientMessageId ? { ...m, status: 'failed' } : m,
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

  const messages = mergeMessages(historyQuery.data ?? [], localMessages);

  // Batched read-mark: any newly-seen message authored by someone else marks
  // the chat read (ONE watermark write per batch — never per message). Uses
  // the merged authoritative+local view so history loads also count as read;
  // declared after `messages` on purpose.
  useEffect(() => {
    if (!matchId) return;
    let sawNew = false;
    for (const m of messages) {
      if (m.id.startsWith('local-')) continue;
      if (m.user_id === currentUser?.id) continue; // own messages never count
      if (markedReadIdsRef.current.has(m.id)) continue;
      markedReadIdsRef.current.add(m.id);
      sawNew = true;
    }
    if (sawNew) markChatRead();
  }, [messages, matchId, markChatRead, currentUser?.id]);

  return {
    ...historyQuery,
    messages,
    isConnected,
    sendMessage,
    retryMessage,
  };
}
