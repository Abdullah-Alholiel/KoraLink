'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { io, Socket } from 'socket.io-client';
import { fetcher, FetchError } from '@/lib/fetcher';
import { env } from '@/env.mjs';
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

export function useDiscussions() {
  return useQuery<Discussion[], FetchError>({
    queryKey: ['user', 'me', 'discussions'],
    queryFn: async () => {
      const data = await fetcher<DiscussionsApiResponse>('/users/me/discussions');
      return adaptDiscussionList(data);
    },
    staleTime: 30_000,
  });
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

    // Read auth token for cross-origin WebSocket handshake (Tailscale/remote).
    const token = typeof window !== 'undefined'
      ? localStorage.getItem('koralink_token')
      : null;

    const socket: Socket = io(`${env.NEXT_PUBLIC_API_URL ?? ''}/lobby`, {
      path: '/socket.io',
      transports: ['websocket'],
      withCredentials: true,
      auth: token ? { token } : undefined,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

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

  return {
    ...historyQuery,
    messages,
    isConnected,
    sendMessage,
    retryMessage,
  };
}
