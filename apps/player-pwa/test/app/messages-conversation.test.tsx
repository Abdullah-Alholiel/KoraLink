import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Suspense } from 'react';
import { NextIntlClientProvider } from 'next-intl';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import enMessages from '@/messages/en.json';
import ConversationPage from '@/app/[locale]/messages/[id]/page';
import { fetcher } from '@/lib/fetcher';
import { useAppStore } from '@/store/useAppStore';

vi.mock('@/lib/fetcher', () => ({
  fetcher: vi.fn(),
  FetchError: class FetchError extends Error {},
}));

vi.mock('@/providers/ObservabilityProvider', () => ({
  captureError: vi.fn(),
  trackEvent: vi.fn(),
  addBreadcrumb: vi.fn(),
}));

// Page reads the :id route param via next/navigation's use().
const pushMock = vi.fn();
const replaceMock = vi.fn();
const routeParams = { id: 'conv-1', locale: 'en' };
// React's use() requires a STABLE promise — a fresh Promise per render would
// suspend the component on every pass and never settle in jsdom.
const STABLE_PARAMS = Promise.resolve(routeParams);
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, replace: replaceMock, back: vi.fn() }),
  usePathname: () => '/en/messages/conv-1',
}));

vi.mock('@/hooks/useConversations', () => ({
  useConversations: () => ({
    data: [
      {
        id: 'conv-1',
        otherParticipant: {
          id: 'user-sultan',
          fullName: 'Sultan Al-Dossari',
          handle: 'sultan',
          avatarUrl: '',
        },
        lastMessage: 'hey',
        lastMessageAt: null,
        lastMessageSenderId: 'user-sultan',
        unreadCount: 0,
      },
    ],
  }),
  useConversationMessages: () => ({
    messages: [
      {
        id: 'pm-1',
        conversationId: 'conv-1',
        sender: { id: 'user-me', fullName: 'Me', handle: 'me', avatarUrl: '' },
        content: 'hey test test',
        createdAt: new Date().toISOString(),
      },
      {
        id: 'pm-2',
        conversationId: 'conv-1',
        sender: {
          id: 'user-sultan',
          fullName: 'Sultan Al-Dossari',
          handle: 'sultan',
          avatarUrl: '',
        },
        content: 'welcome 👋',
        createdAt: new Date().toISOString(),
      },
    ],
    isLoading: false,
    error: null,
    sendMessage: { mutate: vi.fn() },
    retryMessage: vi.fn(),
  }),
  useStartConversation: () => ({
    mutate: vi.fn(),
    isPending: false,
    isSuccess: false,
    data: undefined,
    reset: vi.fn(),
  }),
}));

const ME = {
  id: 'user-me',
  fullName: 'Me',
  handle: 'me',
  avatarUrl: '',
  phone: '+966500000002',
  preferredLocation: '',
  preferredPosition: '',
  locale: 'en' as const,
};

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <NextIntlClientProvider messages={enMessages} locale="en">
        <Suspense fallback={null}>
          <ConversationPage params={STABLE_PARAMS} />
        </Suspense>
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe('ConversationPage — DM chat rendering (ChatSheet parity)', () => {
  beforeEach(() => {
    vi.mocked(fetcher).mockReset();
    // usePublicProfile + useFollow inside PlayerProfileSheet.
    vi.mocked(fetcher).mockImplementation((() =>
      Promise.resolve({
        handle: 'sultan',
        isFollowing: false,
        followersCount: 0,
        followingCount: 0,
      })) as unknown as typeof fetcher);
    useAppStore.setState({ user: ME });
  });

  it('renders every bubble inside a full-width row (definite width — no letter stacking)', async () => {
    // First render warms React's use() status-tracking on the params promise
    // (it suspends once, then the tracked promise is fulfilled for re-mounts).
    renderPage();
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    // Second render resolves use(params) synchronously — real DOM to assert on.
    const utils = renderPage();
    await waitFor(() => {
      expect(utils.getAllByTestId('dm-bubble').length).toBe(2);
    });
    for (const bubble of utils.getAllByTestId('dm-bubble')) {
      const row = bubble.parentElement as HTMLElement;
      // ChatSheet anatomy: the row is a full-width flex container with
      // horizontal padding — NOT a fit-content flex-col wrapper.
      expect(row.className).toContain('px-4');
      expect(row.className).toContain('flex');
      expect(row.className).not.toContain('flex-col');
    }
    // Text renders horizontally (not one char per node).
    expect(utils.getByText('hey test test')).toBeInTheDocument();
    expect(utils.getByText('welcome 👋')).toBeInTheDocument();
  });

  it('shows date dividers and per-message time like ChatSheet', () => {
    const { container } = renderPage();
    expect(screen.getByText('Today')).toBeInTheDocument();
    expect(screen.getAllByText(/\d{1,2}:\d{2}\s?(AM|PM)?/).length).toBeGreaterThan(0);
  });

  it('opens the player profile sheet from a received message avatar', async () => {
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => {
      expect(screen.getAllByTestId('dm-bubble').length).toBe(2);
    });
    // The avatar button on the received message (aria-label from i18n).
    const avatarButtons = screen.getAllByRole('button', { name: 'Player Profile' });
    await user.click(avatarButtons[0]);
    // PlayerProfileSheet renders with the other participant's name — the
    // header span AND the sheet h3 both show it (≥2 matches = sheet open).
    await waitFor(() => {
      expect(screen.getAllByText('Sultan Al-Dossari').length).toBeGreaterThanOrEqual(2);
    });
  });

  it('opens the player profile sheet from the header', async () => {
    const user = userEvent.setup();
    renderPage();
    const headerBtn = screen.getAllByRole('button', { name: 'Player Profile' })[0];
    await user.click(headerBtn);
    await waitFor(() => {
      expect(screen.getAllByText('Sultan Al-Dossari').length).toBeGreaterThanOrEqual(2);
    });
  });
});
