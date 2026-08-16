import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { Match } from '@/types';
import { NextIntlClientProvider } from 'next-intl';
import enMessages from '@/messages/en.json';
import { formatDateSection } from '@/lib/format';

// Mock next/navigation (MatchCard uses usePathname)
vi.mock('next/navigation', () => ({
  usePathname: () => '/en/play',
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), refresh: vi.fn() }),
}));

// Mock next/link to a plain anchor for jsdom
vi.mock('next/link', () => ({
  default: function MockLink({ href, children, ...props }: Record<string, unknown> & { href: string; children: React.ReactNode }) {
    return <a href={href} {...props}>{children}</a>;
  },
}));

// Import after mocks are set up
import MatchDateSections from '@/components/matches/MatchDateSections';

function renderWithProviders(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider messages={enMessages} locale="en">
      {ui}
    </NextIntlClientProvider>
  );
}

function makeMatch(id: string, date: string, title: string): Match {
  return {
    id,
    hostId: 'h1',
    title,
    organizer: { name: 'Khalid FC', handle: '@khalidfc', avatarUrl: '' },
    date,
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
    rules: [],
    roster: [],
    comments: [],
  };
}

describe('MatchDateSections', () => {
  it('groups matches by day and renders a date breaker per day', () => {
    const matches: Match[] = [
      makeMatch('m1', '2026-08-14', 'Friday Kickoff'),
      makeMatch('m2', '2026-08-14', 'Friday Evening'),
      makeMatch('m3', '2026-08-16', 'Sunday Match'),
    ];

    renderWithProviders(<MatchDateSections matches={matches} locale="en" />);

    // Two date breakers, one per distinct day.
    expect(screen.getByText(formatDateSection('2026-08-14', 'en'))).toBeInTheDocument();
    expect(screen.getByText(formatDateSection('2026-08-16', 'en'))).toBeInTheDocument();
    // All three match titles render.
    expect(screen.getByText('Friday Kickoff')).toBeInTheDocument();
    expect(screen.getByText('Friday Evening')).toBeInTheDocument();
    expect(screen.getByText('Sunday Match')).toBeInTheDocument();
  });

  it('orders day buckets chronologically (soonest first)', () => {
    const matches: Match[] = [
      makeMatch('m-late', '2026-08-20', 'Late Match'),
      makeMatch('m-early', '2026-08-14', 'Early Match'),
    ];

    const { container } = renderWithProviders(
      <MatchDateSections matches={matches} locale="en" />
    );

    const breakers = container.querySelectorAll('p.text-brand-green');
    const labels = Array.from(breakers).map((el) => el.textContent);
    expect(labels[0]).toBe(formatDateSection('2026-08-14', 'en'));
    expect(labels[1]).toBe(formatDateSection('2026-08-20', 'en'));
  });

  it('renders a single breaker when all matches share one day', () => {
    const matches: Match[] = [
      makeMatch('m1', '2026-08-14', 'A'),
      makeMatch('m2', '2026-08-14', 'B'),
    ];

    renderWithProviders(<MatchDateSections matches={matches} locale="en" />);

    expect(screen.getByText(formatDateSection('2026-08-14', 'en'))).toBeInTheDocument();
    // No second breaker for the same day.
    expect(screen.queryByText(formatDateSection('2026-08-16', 'en'))).not.toBeInTheDocument();
  });

  it('passes currentUserId through to each MatchCard (host state)', () => {
    const matches: Match[] = [
      { ...makeMatch('m1', '2026-08-14', 'My Own Match'), hostId: 'me' },
    ];

    renderWithProviders(
      <MatchDateSections matches={matches} currentUserId="me" locale="en" />
    );

    // Host card shows "Your Match" (badge + button) instead of the default "Join".
    expect(screen.getAllByText('Your Match').length).toBeGreaterThan(0);
    expect(screen.queryByText('Join Match')).not.toBeInTheDocument();
  });
});
