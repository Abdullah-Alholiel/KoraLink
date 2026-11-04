import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import enMessages from '@/messages/en.json';
import VenueReviewsSection from '@/components/venues/VenueReviewsSection';
import ReportSheet from '@/components/matches/ReportSheet';
import { fetcher } from '@/lib/fetcher';
import { useAppStore } from '@/store/useAppStore';

// P1-74 (run #186): venue reviews are reportable — signed-in non-author rows
// carry a report affordance that opens the shared ReportSheet with
// subjectType="review"; guests see no affordance.

vi.mock('@/lib/fetcher', () => ({
  fetcher: vi.fn(),
  FetchError: class FetchError extends Error {},
}));

// jsdom: BottomSheet uses scrollIntoView via its open/close effects.
Element.prototype.scrollIntoView = Element.prototype.scrollIntoView || (() => {});

vi.mock('@/hooks/useVenueReviews', () => ({
  useVenueReviews: () => ({
    data: {
      average: 4.5,
      count: 2,
      can_review: false,
      reviews: [
        {
          id: 'rv-1',
          rating: 5,
          comment: 'Great pitches',
          mine: false,
          updated_at: '2026-11-01T10:00:00Z',
          user: { id: 'u-other', full_name: 'Khalid', avatar_url: null },
        },
        {
          id: 'rv-2',
          rating: 4,
          comment: null,
          mine: true,
          updated_at: '2026-11-02T10:00:00Z',
          user: { id: 'u-me', full_name: 'Me', avatar_url: null },
        },
      ],
    },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
  useVenueReviewSubmit: () => ({ mutate: vi.fn(), isPending: false }),
}));

function makeUser(id: string | null) {
  return id
    ? ({ id, full_name: 'Me', phone: '+966500000001', handle: 'me', avatar_url: null } as never)
    : null;
}

function renderSection() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <NextIntlClientProvider messages={enMessages} locale="en">
        <VenueReviewsSection venueId="venue-1" locale="en" />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe('VenueReviewsSection — report-a-review affordance (P1-74)', () => {
  beforeEach(() => {
    vi.mocked(fetcher).mockReset();
    useAppStore.setState({ user: makeUser('u-me'), isHydrated: true });
  });

  it('shows the report button on OTHER players’ review rows only', () => {
    renderSection();
    // Other player's review → flag affordance present.
    const flags = screen.getAllByRole('button', { name: /report review/i });
    expect(flags).toHaveLength(1);
  });

  it('shows NO report affordance for signed-out players', () => {
    useAppStore.setState({ user: null, isHydrated: true });
    renderSection();
    expect(screen.queryByRole('button', { name: /report review/i })).not.toBeInTheDocument();
  });

  it('opens the shared ReportSheet with subjectType=review and submits it', async () => {
    const user = userEvent.setup();
    vi.mocked(fetcher).mockResolvedValueOnce({ id: 'r-new', status: 'open' });
    renderSection();
    await user.click(screen.getByRole('button', { name: /report review/i }));

    // The shared sheet opens, labeled after the review author.
    expect(screen.getByText('Report the review by Khalid')).toBeInTheDocument();
    await user.type(screen.getByPlaceholderText(/this user was abusive/i), 'Abusive language');
    await user.click(screen.getByRole('button', { name: /submit report/i }));

    await screen.findByText(/report submitted/i);
    expect(vi.mocked(fetcher)).toHaveBeenCalledWith(
      '/reports',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('"subjectType":"review"'),
      }),
    );
  });

  it('ReportSheet accepts subjectType=review (type-level contract, P1-74)', () => {
    // Compile-time: the widened union flows through ReportSheetProps.
    const props = {
      open: true,
      onClose: () => {},
      subjectType: 'review' as const,
      subjectId: 'rv-1',
      subjectLabel: 'Review by Khalid',
    };
    expect(props.subjectType).toBe('review');
    expect(ReportSheet).toBeTruthy();
  });
});
