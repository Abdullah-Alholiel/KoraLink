'use client';

import { useEffect, useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { io, Socket } from 'socket.io-client';
import { fetcher, FetchError } from '@/lib/fetcher';
import { env } from '@/env.mjs';
import {
  adaptDiscussionList,
  type DiscussionsApiResponse,
} from '@/lib/discussion-adapter';
import type { Discussion } from '@/types';

// ─── Types ────────────────────────────────────────────

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
 * Fetches chat history via REST and subscribes to the /lobby WebSocket
 * gateway for live `new-message` events. Messages array is maintained
 * in local state so real-time events append without refetching.
 */
export function useMatchChat(matchId: string | null) {
  const queryClient = useQueryClient();
  const [liveMessages, setLiveMessages] = useState<MatchMessage[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const socketRef = useRef<Socket | null>(null);

  // REST history query
  const historyQuery = useQuery<MatchMessage[], FetchError>({
    queryKey: ['match', matchId, 'messages'],
    queryFn: () => fetcher<MatchMessage[]>(`/matches/${matchId}/messages`),
    enabled: !!matchId,
  });

  // Socket.IO subscription (real-time)
  useEffect(() => {
    if (!matchId) return;

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
      setLiveMessages((prev) => [...prev, message]);
    });

    return () => {
      socket.disconnect();
      setLiveMessages([]);
    };
  }, [matchId]);

  // ── Send message ────────────────────────────────────
  const sendMessage = useMutation<
    void,
    Error,
    { content: string }
  >({
    mutationFn: async ({ content }) => {
      // Reuse the subscription socket instead of creating a new one per message
      if (socketRef.current?.connected) {
        socketRef.current.emit('send-message', { matchId, content });
      } else {
        throw new Error('Not connected to match lobby. Wait for connection.');
      }
    },
    onSuccess: () => {
      // The socket will deliver the authoritative message via new-message;
      // also invalidate history for consistency.
      queryClient.invalidateQueries({ queryKey: ['match', matchId, 'messages'] });
    },
  });

  const messages = [...(historyQuery.data ?? []), ...liveMessages];

  return {
    ...historyQuery,
    messages,
    isConnected,
    sendMessage,
  };
}
