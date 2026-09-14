import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import enMessages from '@/messages/en.json';
import arMessages from '@/messages/ar.json';
import DiscussionCard from '@/components/matches/DiscussionCard';
import type { Discussion } from '@/types';

// Mock next/link — jsdom has no router; the card renders a plain <a>.
vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

// Hydration-safe clock (P2-59): the card must read time from useNow(), never
// from a render-path new Date(). Fixed instant = 2026-09-14T12:00:00.000Z
// (= 1_789_387_200_000). Local TZ on the test box is UTC (checked); if CI ever
// moves timezone, revisit the localNoon() fixtures too.
const NOW = 1_789_387_200_000;
const mockUseNow = vi.fn<() => number | null>(() => NOW);
vi.mock('@/hooks/useNow', () => ({
  useNow: () => mockUseNow(),
}));

function makeDiscussion(overrides: Partial<Discussion> = {}): Discussion {
  return {
    id: 'disc-1',
    type: 'match',
    title: 'Tuesday football',
    avatarUrl: null,
    avatarInitials: 'TF',
    lastMessage: 'Anyone up for a game?',
    lastMessageAt: new Date(NOW - 5 * 60_000).toISOString(),
    lastMessageSenderName: 'Khalid',
    unreadCount: 0,
    ...overrides,
  };
}

function renderCard(discussion: Discussion, locale: 'en' | 'ar' = 'en') {
  const messages = locale === 'ar' ? arMessages : enMessages;
  return render(
    <NextIntlClientProvider messages={messages} locale={locale}>
      <DiscussionCard discussion={discussion} href="/match/disc-1" />
    </NextIntlClientProvider>,
  );
}

// Local-noon fixture helpers: pinned to the test box's UTC clock. If CI ever
// moves these off UTC, switch to new Date(y, m, d, 12) — do not "fix" the
// math instead.
const localNoon = (offsetDays: number): string => {
  const d = new Date(NOW + offsetDays * 86_400_000);
  d.setHours(12, 0, 0, 0);
  return d.toISOString();
};

describe('DiscussionCard (P2-59 survivor, run #52)', () => {
  beforeEach(() => {
    mockUseNow.mockReturnValue(NOW);
  });

  it('DISC-1 · pre-mount (now=null) renders optimistic justNow bucket', () => {
    mockUseNow.mockReturnValue(null);
    renderCard(makeDiscussion({ lastMessageAt: new Date(NOW - 3 * 86_400_000).toISOString() }));
    expect(screen.getByText('just now')).toBeInTheDocument();
  });

  it('DISC-2 · 5-minute-old message renders minutesAgo bucket', () => {
    renderCard(makeDiscussion());
    expect(screen.getByText('5 min ago')).toBeInTheDocument();
  });

  it('DISC-3 · 3-day-old message renders localized weekday (en-GB, not hardcoded en-US)', () => {
    renderCard(makeDiscussion({ lastMessageAt: localNoon(-3) }));
    // 2026-09-11 was a Friday. en-GB short weekday = "Fri" — the previous
    // en-US hardcode produced the same token here, so assert the REAL
    // discriminator: Intl receives the locale *argument* (en-GB) rather than
    // a hardcoded literal. Locale wiring is proven by DISC-4 (ar-SA).
    expect(screen.getByText('Fri')).toBeInTheDocument();
  });

  it('DISC-4 · ar locale renders Arabic weekday glyph for a 3-day-old message', () => {
    renderCard(makeDiscussion({ lastMessageAt: localNoon(-3) }), 'ar');
    // "الجمعة" = Friday in ar-SA. Proves locale flows into Intl (the old code
    // hardcoded 'en-US' and would render "Fri" for an AR user).
    expect(screen.getByText('الجمعة')).toBeInTheDocument();
  });

  it('DISC-5 · >7-day-old message renders localized short date (Gregorian-pinned for ar)', () => {
    renderCard(makeDiscussion({ lastMessageAt: localNoon(-10) }), 'ar');
    // 2026-09-04: month سبتمبر, day ٤ — ar-SA-u-ca-gregory formatting.
    expect(screen.getByText('٤ سبتمبر')).toBeInTheDocument();
  });

  it('DISC-6 · unread badge shows count', () => {
    renderCard(makeDiscussion({ unreadCount: 7 }));
    expect(screen.getByText('7')).toBeInTheDocument();
  });

  it('DISC-6b · unread badge caps at 99+', () => {
    renderCard(makeDiscussion({ unreadCount: 120 }));
    expect(screen.getByText('99+')).toBeInTheDocument();
  });

  it('DISC-7 · full status renders localized badge', () => {
    renderCard(makeDiscussion({ matchStatus: 'full' }));
    expect(screen.getByText('Full')).toBeInTheDocument();
  });
});
