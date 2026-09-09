import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import enMessages from '@/messages/en.json';
import PlayerProfileSheet from '@/components/matches/PlayerProfileSheet';
import { fetcher, FetchError } from '@/lib/fetcher';
import { useAppStore } from '@/store/useAppStore';

// The sheet POSTs /conversations through useStartConversation (React Query)
// and reads the signed-in user from the Zustand store.
vi.mock('@/lib/fetcher', () => ({
  fetcher: vi.fn(),
  FetchError: class FetchError extends Error {},
}));

// ObservabilityProvider needs Sentry/PostHog clients — no-op in tests.
vi.mock('@/providers/ObservabilityProvider', () => ({
  captureError: vi.fn(),
  trackEvent: vi.fn(),
  addBreadcrumb: vi.fn(),
}));

// jsdom: BottomSheet auto-scrolls on open/close.
Element.prototype.scrollIntoView = Element.prototype.scrollIntoView || (() => {});

// Router: navigation + pathname-derived locale ('/en/...').
const pushMock = vi.fn();
const replaceMock = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, replace: replaceMock, back: vi.fn() }),
  usePathname: () => '/en/play',
}));

const OTHER = {
  id: 'roster-row-1',
  userId: 'user-other-36-char-id-xxxxxxxxxxxxx',
  name: 'Salem',
  avatarUrl: '',
  isHost: false,
  team: 'Home' as const,
  noShow: false,
};

const ME = {
  id: 'user-me-36-char-id-xxxxxxxxxxxxxx',
  fullName: 'Me',
  handle: 'me',
  avatarUrl: '',
  phone: '+966500000001',
  preferredLocation: '',
  preferredPosition: '',
  locale: 'en' as const,
};

function renderSheet(props: Partial<Parameters<typeof PlayerProfileSheet>[0]> = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <NextIntlClientProvider messages={enMessages} locale="en">
        <PlayerProfileSheet
          player={OTHER}
          onClose={() => {}}
          {...props}
        />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

const CONV = {
  id: 'conv-42',
  participants: [],
  created_at: new Date().toISOString(),
};

// Superset for usePublicProfile + useFollow (query key ['user','public',id]).
const PUBLIC_PROFILE = {
  handle: 'salem',
  pom_count: 0,
  games_played: 0,
  no_show_count: 0,
  isFollowing: false,
  followersCount: 0,
  followingCount: 0,
};

function mockApi(conversationsImpl: () => Promise<unknown> = () => Promise.resolve(CONV)) {
  vi.mocked(fetcher).mockImplementation(((url: string) => {
    if (url === '/conversations') return conversationsImpl();
    return Promise.resolve(PUBLIC_PROFILE);
  }) as typeof fetcher);
}

describe('PlayerProfileSheet — Message button (profile → DM)', () => {
  beforeEach(() => {
    vi.mocked(fetcher).mockReset();
    mockApi();
    pushMock.mockReset();
    replaceMock.mockReset();
    // Signed-in user differs from the target by default.
    useAppStore.setState({ user: ME });
  });

  it('renders the Message button for another player', () => {
    renderSheet();
    expect(screen.getByTestId('profile-message-btn')).toBeInTheDocument();
    expect(screen.getByText('Message')).toBeInTheDocument();
  });

  it('hides the Message button on the viewer\'s own profile', () => {
    useAppStore.setState({ user: { ...ME, id: OTHER.userId } });
    renderSheet();
    expect(screen.queryByTestId('profile-message-btn')).not.toBeInTheDocument();
  });

  it('POSTs /conversations with the target userId on tap', async () => {
    const user = userEvent.setup();
    mockApi(() =>
      Promise.resolve({
        id: 'conv-1',
        participants: [],
        created_at: new Date().toISOString(),
      }),
    );
    renderSheet();
    await user.click(screen.getByTestId('profile-message-btn'));
    await waitFor(() => {
      expect(fetcher).toHaveBeenCalledWith(
        '/conversations',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ userId: OTHER.userId }),
        }),
      );
    });
  });

  it('navigates to the conversation on success and closes the sheet', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderSheet({ onClose });
    await user.click(screen.getByTestId('profile-message-btn'));
    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalledWith('/en/messages/conv-42');
    });
    expect(onClose).toHaveBeenCalled();
  });

  it('shows a localized error via the toast store and keeps the button retryable on failure', async () => {
    const user = userEvent.setup();
    const showToast = vi.fn<(message: string, type: string, meta?: unknown) => void>();
    useAppStore.setState({ showToast: showToast as never });
    mockApi(() => Promise.reject(new FetchError('network down', 0, '/conversations')));
    renderSheet();
    await user.click(screen.getByTestId('profile-message-btn'));
    await waitFor(() => {
      expect(showToast).toHaveBeenCalledWith(
        "Couldn't start the chat. Check your connection and try again.",
        'error',
      );
    });
    // Retry enabled — button is not permanently disabled after a failure.
    await waitFor(() => {
      expect(screen.getByTestId('profile-message-btn')).toBeEnabled();
    });
  });
});
