import type { Match } from '@/types';

// ── Discussion (Messages screen) ────────────────────

export interface DiscussionApi {
  id: string;
  type: 'match' | 'personal';
  title: string;
  matchStatus?: string;
  scheduledAt?: string;
  hostName?: string | null;
  hostAvatar?: string | null;
  participantCount?: number;
  lastMessage?: string | null;
  lastMessageAt?: string | null;
  lastMessageSenderName?: string | null;
  unreadCount: number;
}

export interface Discussion {
  id: string;
  type: 'match' | 'personal';
  title: string;
  avatarUrl: string | null;
  avatarInitials: string;
  lastMessage: string | null;
  lastMessageAt: string | null;
  lastMessageSenderName: string | null;
  unreadCount: number;
  matchStatus?: Match['status'];
  participantCount?: number;
  isOnline?: boolean;
}

// ── Discussion List API Response ────────────────────

export interface DiscussionsApiResponse {
  discussions: DiscussionApi[];
  total: number;
  hasMore: boolean;
}

// ── Adapter ─────────────────────────────────────────

export function adaptDiscussion(d: DiscussionApi): Discussion {
  const title = d.title || 'Untitled';
  const initials = title
    .split(' ')
    .map((w) => w.charAt(0))
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return {
    id: d.id,
    type: d.type,
    title: d.title || 'Untitled',
    avatarUrl: d.hostAvatar ?? null,
    avatarInitials: initials || title.charAt(0).toUpperCase(),
    lastMessage: d.lastMessage ?? null,
    lastMessageAt: d.lastMessageAt ?? null,
    lastMessageSenderName: d.lastMessageSenderName ?? null,
    unreadCount: d.unreadCount ?? 0,
    matchStatus: (d.matchStatus as Match['status']) ?? 'open',
    participantCount: d.participantCount,
    isOnline: false,
  };
}

export function adaptDiscussionList(
  response: DiscussionsApiResponse,
): Discussion[] {
  return (response.discussions ?? []).map(adaptDiscussion);
}
