import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { Match } from '@/types';
import { NextIntlClientProvider } from 'next-intl';
import enMessages from '@/messages/en.json';

// P2-312 (run #191): waitlist position chip on My Games / Play feed cards.

vi.mock('next/navigation', () => ({
  usePathname: () => '/en/play',
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), refresh: vi.fn() }),
}));

vi.mock('next/link', () => ({
  default: function MockLink({ href, children, ...props }: Record<string, unknown> & { href: string; children: React.ReactNode }) {
    return <a href={href} {...props}>{children}</a>;
  },
}));

import MatchCard from '@/components/matches/MatchCard';

function renderWithProviders(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider messages={enMessages} locale="en">
      {ui}
    </NextIntlClientProvider>
  );
}

const fullMatch: Match = {
  id: 'match-wl',
  hostId: 'h1',
  title: 'Full House Friday',
  organizer: { name: 'Khalid FC', handle: '@khalidfc', avatarUrl: '' },
  date: '2026-11-20',
  time: '9:00 PM',
  endTime: '10:30 PM',
  location: 'Riyadh',
  venueName: 'Green Field Stadium',
  format: '7v7',
  surface: 'Grass',
  gender: 'men',
  intensity: 'Casual',
  price: 37,
  currency: 'SAR',
  totalSpots: 14,
  filledSpots: 14,
  status: 'full',
  imageUrl: '',
  roster: [],
  comments: [],
  waitlistCount: 4,
  isJoined: false,
  isUserHost: false,
};

describe('MatchCard — waitlist position chip (P2-312)', () => {
  it('renders the queue position when the viewer is waiting', () => {
    renderWithProviders(
      <MatchCard match={{ ...fullMatch, yourWaitlistPosition: 3 }} currentUserId="viewer" />,
    );
    const chip = screen.getByTestId('match-card-queued-chip');
    expect(chip).toHaveTextContent("You're #3 in line");
  });

  it('does not render when the viewer is not queued', () => {
    renderWithProviders(
      <MatchCard match={{ ...fullMatch, yourWaitlistPosition: null }} currentUserId="viewer" />,
    );
    expect(screen.queryByTestId('match-card-queued-chip')).not.toBeInTheDocument();
    expect(screen.queryByText(/in line/)).not.toBeInTheDocument();
  });

  it('does not render when the viewer already joined the match', () => {
    renderWithProviders(
      <MatchCard match={{ ...fullMatch, yourWaitlistPosition: 3, isJoined: true }} currentUserId="viewer" />,
    );
    expect(screen.queryByTestId('match-card-queued-chip')).not.toBeInTheDocument();
  });
});
