import { describe, it, expect } from 'vitest';
import { adaptDiscussion, adaptDiscussionList } from '@/lib/discussion-adapter';

describe('discussion-adapter — unified discussions (match + personal)', () => {
  it('maps a personal conversation row (avatarUrl preferred, no match status)', () => {
    const d = adaptDiscussion({
      id: 'conv-1',
      type: 'personal',
      title: 'Salem Alharbi',
      matchStatus: null,
      hostName: 'Salem Alharbi',
      hostAvatar: null,
      avatarUrl: 'https://cdn.example/a.png',
      personal: true,
      participantCount: 2,
      lastMessage: 'noted 👍',
      lastMessageAt: '2026-09-09T10:00:00.000Z',
      lastMessageSenderName: 'Salem Alharbi',
      unreadCount: 2,
    });

    expect(d.type).toBe('personal');
    expect(d.avatarUrl).toBe('https://cdn.example/a.png');
    expect(d.matchStatus).toBeUndefined(); // no bogus 'open' badge on DM rows
    expect(d.unreadCount).toBe(2);
    expect(d.avatarInitials).toBe('SA');
  });

  it('falls back to hostAvatar and derives initials for match rows', () => {
    const d = adaptDiscussion({
      id: 'm-1',
      type: 'match',
      title: 'Friday 7v7',
      matchStatus: 'Open',
      hostAvatar: 'https://cdn.example/host.png',
      lastMessage: 'who is in?',
      unreadCount: 0,
    });

    expect(d.type).toBe('match');
    expect(d.avatarUrl).toBe('https://cdn.example/host.png');
    expect(d.matchStatus).toBe('Open');
    expect(d.avatarInitials).toBe('F7');
  });

  it('maps a full API response list', () => {
    const list = adaptDiscussionList({
      discussions: [
        { id: 'conv-1', type: 'personal', title: 'A', unreadCount: 1 },
        { id: 'm-1', type: 'match', title: 'B', unreadCount: 0 },
      ],
      total: 2,
      hasMore: false,
    });
    expect(list).toHaveLength(2);
    expect(list.map((d) => d.type)).toEqual(['personal', 'match']);
  });
});
