'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetcher, FetchError } from '@/lib/fetcher';
import { useAppStore } from '@/store/useAppStore';

/**
 * P1-55 (run #117): booking-verified venue reviews.
 *
 * Shapes mirror the API contract (docs/plans/run117-venue-reviews/00-retro.md):
 *   GET  /venues/:id/reviews → { reviews[], average, count, can_review }
 *   POST /venues/:id/reviews → { review, venueRating: { average, count } }
 *
 * Submission is server-gated (403 unless the caller completed a game at the
 * venue) — `can_review` from the GET is the single source of truth for the
 * UI CTA, so the sheet is only reachable when the server would accept it.
 * Re-submit UPSERTs server-side; the mutation patches the query cache from
 * the response (no refetch) and callers surface localized errors per the
 * error-message standard.
 */

export interface VenueReviewApi {
  id: string;
  rating: number;
  comment: string | null;
  created_at: string;
  updated_at: string;
  user: { id: string; full_name: string | null; avatar_url: string | null };
  mine: boolean;
}

export interface VenueReviewsApi {
  reviews: VenueReviewApi[];
  average: number;
  count: number;
  can_review: boolean;
}

export interface ReviewSubmitResultApi {
  review: VenueReviewApi & {
    venue_id: string;
    user_id: string;
    match_id: string;
  };
  venueRating: { average: number; count: number };
}

export function venueReviewsKey(venueId: string) {
  return ['venue', venueId, 'reviews'] as const;
}

/** Latest 20 reviews + aggregates + whether the caller may review. */
export function useVenueReviews(venueId: string | null) {
  const user = useAppStore((s) => s.user);
  return useQuery<VenueReviewsApi, FetchError>({
    queryKey: venueReviewsKey(venueId ?? 'none'),
    queryFn: () => fetcher<VenueReviewsApi>(`/venues/${venueId}/reviews`),
    enabled: !!venueId && !!user,
  });
}

/** Submit (or re-submit — server upserts) the caller's review. */
export function useVenueReviewSubmit(venueId: string) {
  const queryClient = useQueryClient();
  const key = venueReviewsKey(venueId);
  return useMutation<ReviewSubmitResultApi, FetchError, { rating: number; comment: string | null }>({
    mutationFn: ({ rating, comment }) =>
      fetcher<ReviewSubmitResultApi>(`/venues/${venueId}/reviews`, {
        method: 'POST',
        body: JSON.stringify({ rating, comment }),
      }),
    onSuccess: (data) => {
      // Patch the cache from the authoritative response — the server already
      // recomputed the aggregates inside its tx.
      queryClient.setQueryData<VenueReviewsApi>(key, (prev) =>
        prev
          ? {
              ...prev,
              reviews: [
                {
                  id: data.review.id,
                  rating: data.review.rating,
                  comment: data.review.comment,
                  created_at: String(data.review.created_at),
                  updated_at: String(data.review.updated_at),
                  user: {
                    id: data.review.user_id,
                    full_name: prev.reviews.find((r) => r.mine)?.user.full_name ?? null,
                    avatar_url: prev.reviews.find((r) => r.mine)?.user.avatar_url ?? null,
                  },
                  mine: true,
                },
                ...prev.reviews.filter((r) => !r.mine),
              ],
              average: data.venueRating.average,
              count: data.venueRating.count,
            }
          : prev,
      );
    },
  });
}
