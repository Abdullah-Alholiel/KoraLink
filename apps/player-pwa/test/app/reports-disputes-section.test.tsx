import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import enMessages from '@/messages/en.json';
import ReportsPage from '@/app/[locale]/(main)/reports/page';

/**
 * P2-195 residual (run #172): the Reports page gains a "My Disputes" section
 * backed by GET /matches/my-disputes (useMyDisputes). Pins the section's
 * loading / error / empty / loaded states and the reports-list independence
 * (a disputes fetch failure never masks the reports list).
 */

// next/navigation
vi.mock('next/navigation', () => ({
  useRouter: () => ({ back: vi.fn(), push: vi.fn() }),
  usePathname: () => '/en/reports',
}));

// URL-routed fetcher mock (module mocked wholesale; route by URL per test).
vi.mock('@/lib/fetcher', () => ({
  fetcher: vi.fn(),
  FetchError: class FetchError extends Error {
    status: number;
    constructor(msg: string, status = 0) {
      super(msg);
      this.status = status;
    }
  },
}));

import { fetcher } from '@/lib/fetcher';
const fetcherMock = vi.mocked(fetcher);

// URL-routed mockImplementation (vitest trap: Once-consumers race with
// re-renders — route by URL and return fresh promises per call).
function routeReportsPage({ reports, disputes, reportsFail, disputesFail }: {
  reports?: unknown[];
  disputes?: unknown[];
  reportsFail?: boolean;
  disputesFail?: boolean;
}) {
  fetcherMock.mockImplementation((url: string) => {
    if (typeof url === 'string' && url.startsWith('/matches/my-disputes')) {
      if (disputesFail) return Promise.reject(new Error('dispute fetch failed'));
      return Promise.resolve(disputes ?? []);
    }
    // /reports mine-list
    if (reportsFail) return Promise.reject(new Error('report fetch failed'));
    return Promise.resolve({ reports: reports ?? [], total: (reports ?? []).length, hasMore: false });
  });
}

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <NextIntlClientProvider messages={enMessages} locale="en">
        <ReportsPage />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

const disputeRow = {
  id: 'd-1',
  type: 'no_show',
  status: 'resolved',
  decision: 'Refund approved',
  has_appealed: true,
  created_at: '2026-10-20T10:00:00Z',
  updated_at: '2026-10-21T10:00:00Z',
  match_title: 'Tuesday Padel',
  match_scheduled_at: '2026-10-19T18:00:00Z',
};

afterEach(() => {
  cleanup();
  fetcherMock.mockReset();
});

describe('Reports page — My Disputes section (P2-195 residual, run #172)', () => {
  it('renders the section title and a dispute row with category, match context and status', async () => {
    routeReportsPage({ reports: [], disputes: [disputeRow] });
    renderPage();

    // Section title (reports.disputesTitle)
    expect(await screen.findByText('My Disputes')).toBeTruthy();
    // Category label comes from the dispute ns (dispute.cat_no_show = 'Player marked as no-show')
    expect(await screen.findByText('Player marked as no-show')).toBeTruthy();
    // Match context + decision
    expect(screen.getByText(/Tuesday Padel/)).toBeTruthy();
    expect(screen.getByText('Refund approved')).toBeTruthy();
    // Lifecycle status chip (dispute.statusResolved)
    expect(screen.getByText('Resolved')).toBeTruthy();
  });

  it('shows the empty line when no disputes were filed', async () => {
    routeReportsPage({ reports: [], disputes: [] });
    renderPage();
    expect(await screen.findByText('No disputes filed')).toBeTruthy();
  });

  it('shows the localized error line when the disputes fetch fails — reports list unaffected', async () => {
    routeReportsPage({ reports: [{ id: 'r-1', subject_label: 'Bad pitch', subject_type: 'venue', reason: 'test', status: 'open', created_at: '2026-10-20T10:00:00Z' }], disputesFail: true });
    renderPage();
    // Reports list still renders (independence)
    expect(await screen.findByText('Bad pitch')).toBeTruthy();
    // Disputes section shows a classified error line — network failure maps to
    // the errors ns; assert it is NOT a raw backend message.
    await screen.findByText(/network|connection|internet|try again/i, { selector: 'p' });
    expect(screen.queryByText('dispute fetch failed')).toBeNull();
  });

  it('uses the deleted-match fallback label when match context is null', async () => {
    routeReportsPage({
      reports: [],
      disputes: [{ ...disputeRow, match_title: null, match_scheduled_at: null }],
    });
    renderPage();
    expect(await screen.findByText('Match no longer exists')).toBeTruthy();
  });
});
