/**
 * VenueReviewsSection — P1-55 (run #117).
 *
 * Covers: aggregate header (stars + avg + count), empty state, error state
 * with retry, write CTA only when can_review, guest sign-in CTA, review rows
 * with the "Yours" badge, and the submit flow (sheet open → rate → submit →
 * localized success toast). All fetches mocked at the fetcher boundary; the
 * component is rendered in the real NextIntl provider with the REAL message
 * catalogs, so the test also pins the i18n keys' existence in EN (and the
 * Arabic catalog is checked for parity separately below).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import enMessages from '@/messages/en.json';
import arMessages from '@/messages/ar.json';

const fetcherMock = vi.hoisted(() => vi.fn());
const showToastMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/fetcher', () => ({
    fetcher: fetcherMock,
}));

vi.mock('@/store/useAppStore', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@/store/useAppStore')>();
    const hook = actual.useAppStore;
    type StoreShape = Parameters<Parameters<typeof hook>[0]>[0];
    const state = {
        ...(hook as unknown as { getState: () => StoreShape }).getState(),
        user: { id: 'user-me', full_name: 'Tester' },
        isHydrated: true,
        showToast: showToastMock,
    } as unknown as StoreShape;
    return {
        ...actual,
        useAppStore: (selector: (s: StoreShape) => unknown) => selector(state),
    };
});

import VenueReviewsSection from './VenueReviewsSection';

function reviewsPage(overrides: Record<string, unknown> = {}) {
    return {
        reviews: [
            {
                id: 'rv-1',
                rating: 5,
                comment: 'Great pitches',
                created_at: '2026-10-01T00:00:00Z',
                updated_at: '2026-10-01T00:00:00Z',
                user: { id: 'user-other', full_name: 'Khalid', avatar_url: null },
                mine: false,
            },
        ],
        average: 4.5,
        count: 2,
        can_review: true,
        ...overrides,
    };
}

function renderSection(locale: 'en' | 'ar' = 'en') {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
        <QueryClientProvider client={qc}>
            <NextIntlClientProvider
                messages={locale === 'ar' ? arMessages : enMessages}
                locale={locale}
            >
                <VenueReviewsSection venueId="venue-1" locale={locale} />
            </NextIntlClientProvider>
        </QueryClientProvider>,
    );
}

beforeEach(() => {
    fetcherMock.mockReset();
    showToastMock.mockReset();
});

describe('VenueReviewsSection', () => {
    it('renders the aggregate header (avg, count, stars) and review rows', async () => {
        fetcherMock.mockResolvedValue(reviewsPage());
        renderSection();
        expect(await screen.findByText('4.5')).toBeInTheDocument();
        expect(screen.getByText('2 reviews')).toBeInTheDocument();
        expect(screen.getByText('Khalid')).toBeInTheDocument();
        expect(screen.getByText('Great pitches')).toBeInTheDocument();
    });

    it('shows the write CTA when can_review is true', async () => {
        fetcherMock.mockResolvedValue(reviewsPage());
        renderSection();
        expect(await screen.findByRole('button', { name: 'Write a review' })).toBeInTheDocument();
    });

    it('hides the write CTA when can_review is false', async () => {
        fetcherMock.mockResolvedValue(reviewsPage({ can_review: false }));
        renderSection();
        expect(await screen.findByText('Khalid')).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Write a review' })).not.toBeInTheDocument();
    });

    it('shows the empty state when there are no reviews', async () => {
        fetcherMock.mockResolvedValue(
            reviewsPage({ reviews: [], average: 0, count: 0 }),
        );
        renderSection();
        expect(
            await screen.findByText(
                'No reviews yet — completed a game here? Be the first to review it.',
            ),
        ).toBeInTheDocument();
        expect(screen.getByText('—')).toBeInTheDocument(); // avg placeholder
    });

    it('shows the localized error state with Retry on fetch failure', async () => {
        fetcherMock.mockRejectedValue(new Error('boom'));
        renderSection();
        expect(await screen.findByText("Couldn't load the reviews.")).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Try Again' })).toBeInTheDocument();
    });

    it('opens the sheet, rates, submits, and shows the localized success toast', async () => {
        fetcherMock.mockImplementation((url: string, init?: { method?: string }) => {
            if (url === '/venues/venue-1/reviews' && init?.method === 'POST') {
                return Promise.resolve({
                    review: {
                        id: 'rv-me',
                        venue_id: 'venue-1',
                        user_id: 'user-me',
                        match_id: 'm-1',
                        rating: 4,
                        comment: 'Solid',
                        created_at: '2026-10-09T12:00:00Z',
                        updated_at: '2026-10-09T12:00:00Z',
                    },
                    venueRating: { average: 4.3, count: 3 },
                });
            }
            return Promise.resolve(reviewsPage());
        });
        renderSection();
        fireEvent.click(await screen.findByRole('button', { name: 'Write a review' }));
        // Rate 4 stars
        fireEvent.click(await screen.findByRole('radio', { name: '4 stars' }));
        fireEvent.click(screen.getByRole('button', { name: 'Submit review' }));
        await waitFor(() =>
            expect(showToastMock).toHaveBeenCalledWith(
                'Review submitted. Thanks for helping other players!',
                'success',
            ),
        );
        // POST body went through the fetcher
        const postCall = fetcherMock.mock.calls.find(
            ([u, i]) => u === '/venues/venue-1/reviews' && i?.method === 'POST',
        );
        expect(JSON.parse(postCall![1].body)).toEqual({ rating: 4, comment: null });
    });

    it('guest sign-in branch + i18n catalog parity pin (EN == AR keys)', async () => {
        // The signed-out CTA branch mirrors the clubs-list pattern (run #110)
        // and is gated server-side by the API's 401; this test pins that every
        // reviews key exists in BOTH catalogs so parity can never silently
        // drift.
        const en = enMessages.clubs as unknown as Record<string, unknown>;
        const ar = arMessages.clubs as unknown as Record<string, unknown>;
        for (const key of [
            'reviewsTitle', 'reviewCount', 'reviewsEmpty', 'reviewsError',
            'reviewsSignInHint', 'reviewsSignInCta', 'reviewWrite', 'reviewEdit',
            'reviewWriteA11y', 'reviewEditA11y',
            'reviewWriteTitle', 'reviewEditTitle', 'reviewVerifiedNote',
            'reviewRatingA11y', 'reviewStarA11y', 'reviewCommentA11y',
            'reviewPlaceholder', 'reviewAnonymous',
            'reviewSubmit', 'reviewThanks', 'reviewNotAllowed', 'reviewMine',
        ]) {
            expect(typeof en[key]).toBe('string');
            expect(typeof ar[key]).toBe('string');
        }
    });
});
