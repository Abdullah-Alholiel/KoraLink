import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { Match } from '@/types';
import { NextIntlClientProvider } from 'next-intl';
import enMessages from '@/messages/en.json';

// Mock next/navigation
vi.mock('next/navigation', () => ({
  usePathname: () => '/ar/play',
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), refresh: vi.fn() }),
}));

// We import the component — since it's 'use client' and uses Link,
// we need to mock next/link to avoid routing errors in jsdom.
vi.mock('next/link', () => ({
  default: function MockLink({ href, children, ...props }: Record<string, unknown> & { href: string; children: React.ReactNode }) {
    return <a href={href} {...props}>{children}</a>;
  },
}));

// Import after mocks are set up
import MatchCard from '@/components/matches/MatchCard';

// Wrapper with NextIntlClientProvider for i18n
function renderWithProviders(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider messages={enMessages} locale="en">
      {ui}
    </NextIntlClientProvider>
  );
}

const baseMatch: Match = {
  id: 'match-1',
  hostId: 'h1',
  title: 'Friday Night Kickoff',
  organizer: {
    name: 'Khalid FC',
    handle: '@khalidfc',
    avatarUrl: '',
  },
  date: '2026-08-15',
  time: '9:00 PM',
  endTime: '10:30 PM',
  location: 'Riyadh',
  venueName: 'Green Field Stadium',
  lat: 24.7136,
  lng: 46.6753,
  format: '7v7',
  surface: 'Grass',
  gender: 'men',
  intensity: 'High Intensity',
  price: 37,
  currency: 'SAR',
  totalSpots: 14,
  filledSpots: 8,
  status: 'open',
  imageUrl: '/images/stadium-bg.png',
  rules: ['No slide tackles'],
  roster: [
    { id: 'p1', userId: 'p1', name: 'Ahmed', avatarUrl: '', team: 'Home', isHost: true },
    { id: 'p2', userId: 'p2', name: 'Sara', avatarUrl: '', team: 'Away', isHost: false },
    { id: 'p3', userId: 'p3', name: 'Omar', avatarUrl: '', team: 'Away', isHost: false },
  ],
  comments: [
    { id: 'c1', userId: 'p1', userName: 'Ahmed', userAvatar: '', text: 'See you there!', createdAt: '2026-08-15T18:00:00Z' },
  ],
};

describe('MatchCard', () => {
  it('renders match title', () => {
    renderWithProviders(<MatchCard match={baseMatch} />);
    expect(screen.getByText('Friday Night Kickoff')).toBeInTheDocument();
  });

  it('renders organizer name', () => {
    renderWithProviders(<MatchCard match={baseMatch} />);
    expect(screen.getByText('Khalid FC')).toBeInTheDocument();
  });

  it('renders price with SAR', () => {
    renderWithProviders(<MatchCard match={baseMatch} />);
    expect(screen.getByText('37 SAR')).toBeInTheDocument();
  });

  it('renders spot count', () => {
    renderWithProviders(<MatchCard match={baseMatch} />);
    expect(screen.getByText(/8\s*\/\s*14/)).toBeInTheDocument();
  });

  it('renders location', () => {
    renderWithProviders(<MatchCard match={baseMatch} />);
    expect(screen.getByText('Riyadh')).toBeInTheDocument();
  });

  it('renders format and surface as separate pills', () => {
    renderWithProviders(<MatchCard match={baseMatch} />);

    expect(screen.getByText('7v7')).toBeInTheDocument();
    expect(screen.getByText('Grass')).toBeInTheDocument();
  });

  it('renders card link with correct locale path', () => {
    renderWithProviders(<MatchCard match={baseMatch} />);
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', '/ar/match/match-1');
  });

  it('shows CLOSING SOON badge when status is closing_soon', () => {
    renderWithProviders(<MatchCard match={{ ...baseMatch, status: 'closing_soon' }} />);
    expect(screen.getByText('CLOSING SOON')).toBeInTheDocument();
  });

  it('shows 1 SPOT LEFT when only 1 spot remaining', () => {
    renderWithProviders(<MatchCard match={{ ...baseMatch, filledSpots: 13, totalSpots: 14 }} />);
    expect(screen.getByText('1 SPOT LEFT')).toBeInTheDocument();
  });

  it('renders organizer avatar initial', () => {
    renderWithProviders(<MatchCard match={baseMatch} />);
    expect(screen.getByText('K')).toBeInTheDocument();
  });

  // ── POTM (Player of the Match) button states ─────────────────────────────

  // A match that ended ~2h ago (90 min duration) — voting window open.
  const playedRecently: Match = {
    ...baseMatch,
    status: 'completed',
    scheduledAt: new Date(Date.now() - 3.5 * 60 * 60 * 1000).toISOString(),
    isJoined: true,
  };

  it('shows short "Vote POTM" pill on a recently-played match when not yet voted', () => {
    renderWithProviders(<MatchCard match={playedRecently} currentUserId="p2" />);
    expect(screen.getByText('Vote POTM')).toBeInTheDocument();
    expect(screen.getByText('POTM')).toBeInTheDocument();
    // Long label must NOT be rendered anywhere on the card
    expect(screen.queryByText('Vote for Player of the Match')).not.toBeInTheDocument();
  });

  it('shows voted state (View Details + POTM voted badge) when hasVotedPotm is true', () => {
    renderWithProviders(
      <MatchCard match={{ ...playedRecently, hasVotedPotm: true }} currentUserId="p2" />
    );
    expect(screen.getByText('View Details')).toBeInTheDocument();
    expect(screen.getByText('POTM voted')).toBeInTheDocument();
    expect(screen.queryByText('Vote POTM')).not.toBeInTheDocument();
  });

  it('shows plain View Details once the 24h voting window has closed', () => {
    renderWithProviders(
      <MatchCard
        match={{
          ...baseMatch,
          status: 'completed',
          scheduledAt: new Date(Date.now() - 30 * 60 * 60 * 1000).toISOString(), // ended >24h ago
          isJoined: true,
        }}
        currentUserId="p2"
      />
    );
    expect(screen.getByText('View Details')).toBeInTheDocument();
    expect(screen.queryByText('Vote POTM')).not.toBeInTheDocument();
    expect(screen.queryByText('POTM voted')).not.toBeInTheDocument();
  });

  it('keeps a match played yesterday visible across midnight while voting is open', () => {
    // Ended at 23:30 yesterday (30 min ago crossed midnight): voting still open
    const acrossMidnight = {
      ...baseMatch,
      status: 'completed' as const,
      scheduledAt: new Date(Date.now() - 30 * 60 * 1000 - 60 * 60 * 1000).toISOString(),
      isJoined: true,
    };
    renderWithProviders(<MatchCard match={acrossMidnight} currentUserId="p2" />);
    expect(screen.getByText('Vote POTM')).toBeInTheDocument();
  });
});
