import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import enMessages from '@/messages/en.json';
import ClubPage from '@/app/[locale]/clubs/[id]/page';

// ── P1-46 (run #51): a failed match-list fetch must render the classified
// error state + retry — never the "no matches scheduled" empty state. ──

vi.mock('@/lib/fetcher', () => ({
  fetcher: vi.fn(),
  FetchError: class FetchError extends Error {
    status: number;
    url: string;
    constructor(msg: string, status: number, url: string) {
      super(msg);
      this.name = 'FetchError';
      this.status = status;
      this.url = url;
    }
  },
}));

vi.mock('@/providers/ObservabilityProvider', () => ({
  captureError: vi.fn(),
  trackEvent: vi.fn(),
  addBreadcrumb: vi.fn(),
}));

const pushMock = vi.fn();
vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'club-1' }),
  usePathname: () => '/en/clubs/club-1',
  useRouter: () => ({ push: pushMock, replace: vi.fn(), back: vi.fn() }),
}));

// useVenue: healthy venue (the case under test is the MATCHES list error).
vi.mock('@/hooks/useVenues', () => ({
  useVenue: () => ({
    data: {
      id: 'club-1',
      name: 'Riyadh Padel Club',
      city: 'Riyadh',
      address: 'King Fahd Rd',
      rating: 4.5,
      imageUrl: '',
      images: [],
      openHour: 8,
      closeHour: 23,
      amenities: [],
      latitude: 24.7,
      longitude: 46.6,
      pricePerHour: 120,
    },
    isLoading: false,
    error: null,
  }),
}));

// useMatches: the hook under contract — controllable per test via mockState.
const mockState: {
  matches: unknown[];
  isLoading: boolean;
  error: { status: number; message: string } | null;
  refetch: ReturnType<typeof vi.fn>;
} = {
  matches: [],
  isLoading: false,
  error: null,
  refetch: vi.fn(),
};
vi.mock('@/hooks/useMatches', () => ({
  useMatches: () => ({
    matches: mockState.matches,
    total: mockState.matches.length,
    hasMore: false,
    fetchNextPage: vi.fn(),
    isFetchingNextPage: false,
    isLoading: mockState.isLoading,
    error: mockState.error,
    refetch: mockState.refetch,
    isSuccess: !mockState.error,
    isError: Boolean(mockState.error),
  }),
}));

// Socket layer is irrelevant here — ChatSheet is only opened by user action.
vi.mock('socket.io-client', () => ({ io: vi.fn(() => ({ connected: false, on: vi.fn(), emit: vi.fn(), disconnect: vi.fn() })) }));

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <NextIntlClientProvider locale="en" messages={enMessages} now={new Date('2026-09-13T12:00:00Z')}>
        <ClubPage />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockState.matches = [];
  mockState.isLoading = false;
  mockState.error = null;
});

describe('ClubPage match-list error state (P1-46, run #51)', () => {
  it('CDE-1: server failure renders the classified error copy, NOT the empty state', async () => {
    mockState.error = { status: 500, message: 'boom' };

    renderPage();

    await waitFor(() => {
      expect(
        screen.getByText('Our servers hit a snag — your data is safe. Try again in a moment.'),
      ).toBeInTheDocument();
    });
    expect(screen.queryByText('No matches scheduled')).not.toBeInTheDocument();
    expect(screen.queryByText('No matches on this date')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try Again' })).toBeInTheDocument();
  });

  it('CDE-2: network failure classifies to errors.network and Retry calls refetch', async () => {
    mockState.error = { status: 0, message: 'Failed to fetch' };

    renderPage();

    await waitFor(() => {
      expect(
        screen.getByText('Connection problem — check your internet and try again.'),
      ).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole('button', { name: 'Try Again' }));
    expect(mockState.refetch).toHaveBeenCalledTimes(1);
  });

  it('CDE-3: success path is untouched — matches render, no error branch', async () => {
    mockState.matches = [
      {
        id: 'm1',
        title: 'Friday football',
        matchType: 'Casual',
        format: '7v7',
        genderRule: 'men',
        status: 'Open',
        date: '2026-09-20',
        scheduledAt: new Date('2026-09-20T18:00:00Z').toISOString(),
        durationMins: 90,
        pricePerPlayer: 37,
        filledSpots: 3,
        maxPlayers: 14,
        host: { id: 'h1', name: 'Host', avatar: '' },
        venue: { id: 'club-1', name: 'Riyadh Padel Club', city: 'Riyadh' },
        roster: [
          { id: 'u1', name: 'Host', avatar: '', isHost: true },
          { id: 'u2', name: 'Player Two', avatar: '', isHost: false },
        ],
        isJoined: false,
        isHost: false,
      },
    ];

    renderPage();

    await waitFor(() => {
      expect(screen.getByText(/Friday football/)).toBeInTheDocument();
    });
    expect(screen.queryByRole('button', { name: 'Try Again' })).not.toBeInTheDocument();
  });

  it('CDE-4: loading state wins over a stale error (initial mount with isLoading true)', async () => {
    mockState.isLoading = true;
    mockState.error = { status: 500, message: 'stale' };

    renderPage();

    // Spinner renders (no error copy, no empty state, no retry button).
    expect(
      screen.queryByText('Our servers hit a snag — your data is safe. Try again in a moment.'),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Try Again' })).not.toBeInTheDocument();
    expect(screen.queryByText('No matches scheduled')).not.toBeInTheDocument();
  });
});
