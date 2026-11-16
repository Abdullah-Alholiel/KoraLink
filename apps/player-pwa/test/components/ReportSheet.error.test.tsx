import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NextIntlClientProvider } from 'next-intl';
import enMessages from '@/messages/en.json';
import { FetchError } from '@/lib/fetcher';

// P2-372: ReportSheet must render localized error copy (errors.* namespace),
// never the raw backend message string.

const RAW_BACKEND_MESSAGE = 'Internal server error: duplicate key value violates constraint reports_pkey';

const mutationState: { isError: boolean; error: FetchError | null } = {
  isError: false,
  error: null,
};

vi.mock('@/hooks/useReports', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/useReports')>();
  return {
    ...actual,
    useReport: () => ({
      mutate: vi.fn(),
      isPending: false,
      isError: mutationState.isError,
      error: mutationState.error,
    }),
  };
});

import ReportSheet from '@/components/matches/ReportSheet';

function renderSheet() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <NextIntlClientProvider messages={enMessages} locale="en">
        <ReportSheet
          open
          onClose={vi.fn()}
          subjectType="user"
          subjectId="u-1"
          subjectLabel="Sara"
        />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

function setError(status: number, message = RAW_BACKEND_MESSAGE) {
  mutationState.isError = true;
  mutationState.error = new FetchError(message, status, '/reports');
}

describe('ReportSheet — localized error copy (P2-372)', () => {
  beforeEach(() => {
    mutationState.isError = false;
    mutationState.error = null;
  });

  it('renders errors.server copy for a 500 FetchError, not the raw backend message', () => {
    setError(500);
    renderSheet();
    expect(screen.getByText(enMessages.errors.server)).toBeInTheDocument();
    expect(screen.queryByText(RAW_BACKEND_MESSAGE)).toBeNull();
  });

  it('renders errors.validation copy for a 400 FetchError', () => {
    setError(400, 'reason must be shorter than or equal to 1000 characters');
    renderSheet();
    expect(screen.getByText(enMessages.errors.validation)).toBeInTheDocument();
    expect(
      screen.queryByText('reason must be shorter than or equal to 1000 characters'),
    ).toBeNull();
  });

  it('never renders the literal backend message anywhere in the sheet', () => {
    for (const status of [400, 401, 403, 404, 409, 429, 500, 503]) {
      setError(status);
      const { container, unmount } = renderSheet();
      expect(container.ownerDocument.body.textContent ?? '').not.toContain(
        RAW_BACKEND_MESSAGE,
      );
      unmount();
    }
  });

  it('renders no error block when the mutation is not in error', () => {
    renderSheet();
    expect(screen.queryByText(enMessages.errors.server)).toBeNull();
  });
});
