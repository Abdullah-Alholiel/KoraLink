'use client';

import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { io, Socket } from 'socket.io-client';
import { fetcher, FetchError } from '@/lib/fetcher';
import { env } from '@/env.mjs';

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

  // REST history query
  const historyQuery = useQuery<MatchMessage[], FetchError>({
    queryKey: ['match', matchId, 'messages'],
    queryFn: () => fetcher<MatchMessage[]>(`/matches/${matchId}/messages`),
    enabled: !!matchId,
  });

  // Socket.IO subscription (real-time)
  useEffect(() => {
    if (!matchId) return;

    const socket: Socket = io(`${env.NEXT_PUBLIC_API_URL ?? ''}/lobby`, {
      path: '/socket.io',
      transports: ['websocket'],
      withCredentials: true,
    });

    socket.on('connect', () => {
      setIsConnected(true);
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
      // Emit via the gateway — it persists the message and broadcasts
      // `new-message` to the room, which our socket listener appends.
      const socket: Socket = io(`${env.NEXT_PUBLIC_API_URL ?? ''}/lobby`, {
        path: '/socket.io',
        transports: ['websocket'],
        withCredentials: true,
      });
      await new Promise<void>((resolve) => socket.on('connect', () => resolve()));
      socket.emit('send-message', { matchId, content });
      socket.disconnect();
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
