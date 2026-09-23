import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import enMessages from '@/messages/en.json';
import ReportsPage from '@/app/[locale]/(main)/reports/page';

// ── P2-63 (run #51): the reports error state must show CLASSIFIED copy
// (errors.* what/why/next — Reviewer B run #51: it rendered a flat "Error").

vi.mock('@/hooks/useReports', () => ({
  useMyReports: (...args: unknown[]) => mockUseMyReports(...args),
}));

// The page reads the locale from usePathname.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ back: vi.fn(), push: vi.fn() }),
  usePathname: () => '/en/reports',
}));

vi.mock('@/hooks/useOnlineStatus', () => ({
  useOnlineStatus: () => true,
}));

const mockUseMyReports = vi.fn();

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <NextIntlClientProvider messages={enMessages} locale="en">
        <ReportsPage />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe('ReportsPage — classified error state (P2-63, run #51)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseMyReports.mockReturnValue({
      reports: [],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
      hasMore: false,
      fetchNextPage: vi.fn(),
      isFetchingNextPage: false,
    });
  });

  it('RPT-1: a network failure renders errors.network copy + working retry (never a flat "Error")', async () => {
    const refetch = vi.fn();
    mockUseMyReports.mockReturnValue({
      reports: [],
      isLoading: false,
      error: Object.assign(new Error('Failed to fetch'), { status: 0 }),
      refetch,
      hasMore: false,
      fetchNextPage: vi.fn(),
      isFetchingNextPage: false,
    });

    renderPage();

    expect(
      screen.getByText('Connection problem — check your internet and try again.'),
    ).toBeTruthy();
    expect(screen.queryByText('Error')).toBeNull();

    fireEvent.click(screen.getByText('Try again'));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('RPT-2: a 5xx failure renders errors.server copy', () => {
    mockUseMyReports.mockReturnValue({
      reports: [],
      isLoading: false,
      error: Object.assign(new Error('boom'), { status: 502 }),
      refetch: vi.fn(),
      hasMore: false,
      fetchNextPage: vi.fn(),
      isFetchingNextPage: false,
    });

    renderPage();

    expect(
      screen.getByText('Our servers hit a snag — your data is safe. Try again in a moment.'),
    ).toBeTruthy();
  });
});
