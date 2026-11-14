import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NextIntlClientProvider } from 'next-intl';
import enMessages from '@/messages/en.json';

// jsdom: BottomSheet uses scrollIntoView via its open/close effects.
Element.prototype.scrollIntoView = Element.prototype.scrollIntoView || (() => {});

const mockFetcher = vi.fn();
vi.mock('@/lib/fetcher', () => ({
  fetcher: (...args: unknown[]) => mockFetcher(...args),
}));

vi.mock('@/providers/ObservabilityProvider', () => ({
  trackEvent: vi.fn(),
}));

import NotificationSheet from '@/components/layout/NotificationSheet';

function makeItem(id: string, name: string) {
  return {
    id,
    verb: 'followed',
    actor: { id: `u-${id}`, name, handle: null, avatarUrl: null },
    match: null,
    subjectUserId: 'me',
    isRead: true,
    createdAt: '2026-10-01T09:00:00.000Z',
  };
}

type Page = { items: ReturnType<typeof makeItem>[]; total: number; hasMore: boolean };

/**
 * URL-routed fetcher mock (run-#118 lesson): route by path + ?page= so the
 * sheet-open refetch and any re-fetches stay deterministic.
 */
function routeFetcher(pages: Record<number, Page | Error>) {
  mockFetcher.mockImplementation((url: string) => {
    if (url.startsWith('/users/me/notifications/unread-count')) {
      return Promise.resolve({ unreadCount: 0 });
    }
    if (url.startsWith('/users/me/notifications')) {
      const page = Number(new URL(url, 'http://x').searchParams.get('page') ?? '1');
      const res = pages[page];
      if (!res) return Promise.reject(new Error(`unexpected page ${page}`));
      return res instanceof Error ? Promise.reject(res) : Promise.resolve(res);
    }
    return Promise.reject(new Error(`unexpected url ${url}`));
  });
}

function renderSheet() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <NextIntlClientProvider messages={enMessages} locale="en">
        <NotificationSheet open onClose={vi.fn()} />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

const PAGE_1: Page = {
  items: [makeItem('n1', 'Sara'), makeItem('n2', 'Omar')],
  total: 3,
  hasMore: true,
};
const PAGE_2: Page = { items: [makeItem('n3', 'Layla')], total: 3, hasMore: false };

describe('NotificationSheet — Load more pagination (P2-352)', () => {
  beforeEach(() => {
    mockFetcher.mockReset();
  });

  it('renders the first page and requests it with page/perPage params', async () => {
    routeFetcher({ 1: PAGE_1 });
    renderSheet();
    expect(await screen.findByText(/Sara/)).toBeInTheDocument();
    expect(screen.getByText(/Omar/)).toBeInTheDocument();
    expect(mockFetcher).toHaveBeenCalledWith('/users/me/notifications?page=1&perPage=20');
  });

  it('shows the Load more button only when the server reports hasMore', async () => {
    routeFetcher({ 1: { ...PAGE_1, hasMore: false } });
    renderSheet();
    await screen.findByText(/Sara/);
    expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument();
  });

  it('fetches the next page on click and appends its items to the flattened list', async () => {
    routeFetcher({ 1: PAGE_1, 2: PAGE_2 });
    renderSheet();
    const button = await screen.findByRole('button', { name: 'Load more' });
    expect(screen.queryByText(/Layla/)).not.toBeInTheDocument();

    await userEvent.click(button);

    expect(await screen.findByText(/Layla/)).toBeInTheDocument();
    // Earlier pages stay rendered.
    expect(screen.getByText(/Sara/)).toBeInTheDocument();
    expect(mockFetcher).toHaveBeenCalledWith('/users/me/notifications?page=2&perPage=20');
    // Last page reached → button gone.
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument(),
    );
  });

  it('keeps loaded rows and shows localized retry copy when Load more fails', async () => {
    routeFetcher({ 1: PAGE_1, 2: new Error('network down') });
    renderSheet();
    await userEvent.click(await screen.findByRole('button', { name: 'Load more' }));

    expect(
      await screen.findByText(enMessages.notifications.loadMoreFailed),
    ).toBeInTheDocument();
    // Not the full-screen error state — page 1 rows are still there.
    expect(screen.getByText(/Sara/)).toBeInTheDocument();
    const retry = screen.getByRole('button', { name: enMessages.common.retry });

    // Retry succeeds and appends page 2.
    routeFetcher({ 1: PAGE_1, 2: PAGE_2 });
    await userEvent.click(retry);
    expect(await screen.findByText(/Layla/)).toBeInTheDocument();
    expect(screen.queryByText(enMessages.notifications.loadMoreFailed)).not.toBeInTheDocument();
  });
});
