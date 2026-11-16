import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Suspense } from 'react';
import { NextIntlClientProvider } from 'next-intl';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import enMessages from '@/messages/en.json';
import MatchChatPage from '@/app/[locale]/match/[id]/chat/page';

// ── P2-321 (run #196): the chat page crashed on EVERY render — SSR 500 +
// client crash — because it called use(useParams()) on a plain object, which
// React 19 rejects ("An unsupported type was passed to use()"; live digest
// 2159266065). The fix takes Next 15's params as a REAL Promise prop, like
// the two working siblings (match/[id], messages/[id]). This suite pins:
//   1. the page renders through a genuine params Promise (root-cause pin —
//      a revert to useParams()+use() throws the React error again),
//   2. loading fallback on the header while the match query warms,
//   3. a failed match fetch renders the shared classified ErrorState + retry
//      instead of a header stuck on "Loading…" (the original P2-321 gap).

vi.mock('@/providers/ObservabilityProvider', () => ({
  captureError: vi.fn(),
  trackEvent: vi.fn(),
  addBreadcrumb: vi.fn(),
}));

const backMock = vi.fn();
vi.mock('next/navigation', () => ({
  // NOTE: useParams is deliberately ABSENT — the page must consume the
  // params PROP. Any revert to useParams() fails loudly here.
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: backMock }),
  usePathname: () => '/en/match/match-77/chat',
}));

// useMatch under contract — per-test override via the hoisted state bag.
const matchHookState = vi.hoisted(() => ({
  impl: null as null | (() => unknown),
}));
vi.mock('@/hooks/useMatches', () => ({
  useMatch: (() => {
    if (matchHookState.impl) return matchHookState.impl();
    return { data: undefined, error: null, refetch: vi.fn() };
  }) as unknown as typeof import('@/hooks/useMatches').useMatch,
}));

// MatchChat is the shared chat surface (covered by ChatSheet specs) — stub
// it so this suite pins the PAGE contract: shell render + title plumbing +
// the page-level error/retry behavior.
vi.mock('@/components/matches/MatchChat', () => ({
  default: ({ matchTitle }: { matchTitle: string }) => (
    <div data-testid="match-chat-stub">thread:{matchTitle}</div>
  ),
}));

// React's use() requires a STABLE promise — a fresh Promise per render would
// suspend the component on every pass and never settle in jsdom.
const STABLE_PARAMS = Promise.resolve({ id: 'match-77', locale: 'en' });

async function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  // The params promise resolves INSIDE the first render (React 19 use()), so
  // the initial mount suspends; the follow-up act tick drains the microtask
  // queue so the resumed render commits before assertions run.
  const utils = render(
    <QueryClientProvider client={queryClient}>
      <NextIntlClientProvider messages={enMessages} locale="en">
        <Suspense fallback={null}>
          <MatchChatPage params={STABLE_PARAMS} />
        </Suspense>
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
  await act(async () => {});
  return utils;
}

describe('MatchChatPage — params-prop contract + page-level error state (P2-321)', () => {
  // PRIME RENDER (order contract, proven empirically run #196): the FIRST
  // render in a jsdom test file never resumes from a use()-suspension
  // (React 19 scheduler quirk — whichever test goes first fails, regardless
  // of content), while every later render in the same file resumes fine.
  // This throwaway render+unmount absorbs that first slot so every actual
  // test asserts against a resumed tree.
  beforeAll(async () => {
    matchHookState.impl = null;
    const { unmount } = await renderPage();
    unmount();
  });

  beforeEach(() => {
    matchHookState.impl = null;
  });

  it('renders the thread shell from a REAL params Promise with the cached match title', async () => {
    // The root-cause pin: use() on a non-thenable throws in React 19 — this
    // test only passes when the page consumes the Promise prop.
    matchHookState.impl = () => ({
      data: { title: 'Sunset 7v7 Rooftop' },
      error: null,
      refetch: vi.fn(),
    });
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('match-chat-stub')).toHaveTextContent(
        'thread:Sunset 7v7 Rooftop',
      );
    });
  });

  it('falls back to the loading string on the header while the match query warms (legit loading, not a stuck error)', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('match-chat-stub')).toHaveTextContent(
        'thread:Loading…',
      );
    });
  });

  it('renders the classified ErrorState + retry on a failed match fetch — never a thread stuck on "Loading…"', async () => {
    const refetch = vi.fn();
    matchHookState.impl = () => ({
      data: undefined,
      // classifyError({ status: 500 }) → 'server' → errors.server.
      error: { status: 500, message: 'boom', name: 'FetchError' },
      refetch,
    });
    renderPage();
    await waitFor(() => {
      expect(
        screen.getByText(
          'Our servers hit a snag — your data is safe. Try again in a moment.',
        ),
      ).toBeTruthy();
    });
    expect(screen.queryByTestId('match-chat-stub')).toBeNull();
    // ErrorState's live region (UI standards §6.3).
    expect(screen.getByRole('status')).toBeTruthy();

    await userEvent.click(screen.getByRole('button', { name: 'Try Again' }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });
});
