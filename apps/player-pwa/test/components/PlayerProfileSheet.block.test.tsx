import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import enMessages from '@/messages/en.json';
import PlayerProfileSheet from '@/components/matches/PlayerProfileSheet';
import { fetcher, FetchError } from '@/lib/fetcher';
import { useAppStore } from '@/store/useAppStore';

// P1-53 (run #100): block/unblock action on the player profile sheet.
// The sheet reads block state via GET /users/me/blocks/status/:userId and
// POSTs /users/me/blocks (two-tap confirm) / DELETEs on unblock.

vi.mock('@/lib/fetcher', () => ({
  fetcher: vi.fn(),
  FetchError: class FetchError extends Error {},
}));

vi.mock('@/providers/ObservabilityProvider', () => ({
  captureError: vi.fn(),
  trackEvent: vi.fn(),
  addBreadcrumb: vi.fn(),
}));

Element.prototype.scrollIntoView = Element.prototype.scrollIntoView || (() => {});

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

// Superset consumed by usePublicProfile + useFollow (['user','public',id]).
const PROFILE = {
  id: OTHER.userId,
  full_name: 'Salem',
  handle: 'salem',
  avatar_url: null,
  preferred_position: null,
  isFollowing: false,
  followersCount: 0,
  followingCount: 0,
};

function mockFetch(routes: Record<string, unknown>) {
  vi.mocked(fetcher).mockImplementation(((path: string, _opts?: unknown) => {
    if (path in routes) {
      const v = routes[path];
      if (v instanceof Error) return Promise.reject(v);
      return Promise.resolve(v);
    }
    return Promise.reject(new FetchError(`unmocked ${path}`, 0, path));
  }) as unknown as typeof fetcher);
}

function renderSheet() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <NextIntlClientProvider messages={enMessages} locale="en">
        <PlayerProfileSheet player={OTHER} onClose={() => {}} />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe('PlayerProfileSheet — block/unblock (P1-53)', () => {
  let showToastSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    useAppStore.setState({ user: ME as never });
    showToastSpy = vi.fn();
    useAppStore.setState({ showToast: showToastSpy as never });
    mockFetch({
      [`/users/${OTHER.userId}`]: PROFILE,
      [`/users/me/blocks/status/${OTHER.userId}`]: { blocked: false },
    });
  });

  it('shows the Block action for a non-blocked, non-self player', async () => {
    renderSheet();
    expect(await screen.findByRole('button', { name: 'Block' })).toBeInTheDocument();
    // Self never sees the block action — sheet renders for OTHER only here.
  });

  it('two-tap confirm: first tap arms, second tap POSTs the block', async () => {
    const user = userEvent.setup();
    mockFetch({
      [`/users/${OTHER.userId}`]: PROFILE,
      [`/users/me/blocks/status/${OTHER.userId}`]: { blocked: false },
      '/users/me/blocks': { blockedId: OTHER.userId, createdAt: new Date().toISOString() },
    });
    renderSheet();
    const btn = await screen.findByRole('button', { name: 'Block' });
    await user.click(btn);
    expect(screen.getByRole('button', { name: 'Tap again to confirm block' })).toBeInTheDocument();
    expect(fetcher).not.toHaveBeenCalledWith('/users/me/blocks', expect.anything());
    await user.click(screen.getByRole('button', { name: 'Tap again to confirm block' }));
    await waitFor(() => {
      expect(fetcher).toHaveBeenCalledWith('/users/me/blocks', {
        method: 'POST',
        body: JSON.stringify({ blockedId: OTHER.userId }),
      });
    });
    // Success toast (what happened) — localized, never raw backend text.
    // (Spy on the store's showToast — ToastHost isn't mounted in tests.)
    await waitFor(() => {
      expect(showToastSpy).toHaveBeenCalledWith('User blocked', 'success');
    });
  });

  it('blocked state flips the action to Unblock and DELETEs on tap', async () => {
    const user = userEvent.setup();
    mockFetch({
      [`/users/${OTHER.userId}`]: PROFILE,
      [`/users/me/blocks/status/${OTHER.userId}`]: { blocked: true },
      [`/users/me/blocks/${OTHER.userId}`]: { blocked: false },
    });
    renderSheet();
    const btn = await screen.findByRole('button', { name: 'Unblock' });
    await user.click(btn);
    await waitFor(() => {
      expect(fetcher).toHaveBeenCalledWith(`/users/me/blocks/${OTHER.userId}`, { method: 'DELETE' });
    });
    await waitFor(() => {
      expect(showToastSpy).toHaveBeenCalledWith('User unblocked', 'success');
    });
  });

  it('failed block shows the localized what/why/next error toast', async () => {
    const user = userEvent.setup();
    mockFetch({
      [`/users/${OTHER.userId}`]: PROFILE,
      [`/users/me/blocks/status/${OTHER.userId}`]: { blocked: false },
      '/users/me/blocks': new FetchError('network down', 0, '/users/me/blocks'),
    });
    renderSheet();
    const btn = await screen.findByRole('button', { name: 'Block' });
    await user.click(btn);
    await user.click(screen.getByRole('button', { name: 'Tap again to confirm block' }));
    await waitFor(() => {
      expect(showToastSpy).toHaveBeenCalledWith(
        "Couldn't block this user. Check your connection and try again.",
        'error',
      );
    });
  });

  it('close button carries an accessible name (a11y regression pin)', async () => {
    renderSheet();
    await screen.findByRole('button', { name: 'Block' });
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
  });
});
