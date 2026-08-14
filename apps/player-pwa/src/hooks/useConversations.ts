'use client';

import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { io, type Socket } from 'socket.io-client';
import { fetcher, FetchError } from '@/lib/fetcher';
import { env } from '@/env.mjs';

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
  };
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

/**
 * Conversation history + real-time DM via the /lobby WebSocket.
 * Mirrors `useMatchChat`: REST history + WS `new-dm` events append locally.
 */
export function useConversationMessages(conversationId: string | null) {
  const queryClient = useQueryClient();
  const [liveMessages, setLiveMessages] = useState<PersonalMessage[]>([]);
  const socketRef = useRef<Socket | null>(null);

  const historyQuery = useQuery<PersonalMessage[], FetchError>({
    queryKey: ['conversation', conversationId, 'messages'],
    queryFn: async () => {
      const data = await fetcher<MessagesApiResponse>(`/conversations/${conversationId}/messages`);
      return data.messages.map(mapMessage);
    },
    enabled: !!conversationId,
    staleTime: 15_000,
  });

  useEffect(() => {
    if (!conversationId) return;

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
      socketRef.current = socket;
      socket.emit('join-conversation', { conversationId });
    });

    socket.on('new-dm', (message: MessageApi) => {
      setLiveMessages((prev) => [...prev, mapMessage(message)]);
    });

    return () => {
      socket.disconnect();
      setLiveMessages([]);
    };
  }, [conversationId]);

  const sendMessage = (content: string): Promise<void> => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('send-dm', { conversationId, content });
      queryClient.invalidateQueries({ queryKey: ['conversation', conversationId, 'messages'] });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      return Promise.resolve();
    }
    // REST fallback when WS is not connected.
    return fetcher(`/conversations/${conversationId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ content }),
    }).then(() => {
      queryClient.invalidateQueries({ queryKey: ['conversation', conversationId, 'messages'] });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    });
  };

  const messages = [...(historyQuery.data ?? []), ...liveMessages];

  return { ...historyQuery, messages, sendMessage };
}
