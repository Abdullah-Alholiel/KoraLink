'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetcher, FetchError } from '@/lib/fetcher';
import { useAppStore } from '@/store/useAppStore';
import type { VenueApi } from '@/hooks/useVenues';

/**
 * P2-161 (run #109): venue favorites (wishlist).
 *
 * Shapes mirror the API contract (docs/plans/run109-venue-favorites/00-retro.md):
 *   GET    /venues/favorites     → VenueApi[] (bare array, newest-first)
 *   POST   /venues/:id/favorite  → { favorited: true, created }
 *   DELETE /venues/:id/favorite  → { favorited: false, removed }
 *
 * Both mutations are idempotent server-side (composite PK). The hook keeps
 * TWO caches in sync — the id set (heart state on cards/detail) and the full
 * favorites list (Favorites filter pill) — with optimistic patch + rollback
 * so the heart flips instantly and reverts on failure (callers surface the
 * localized toast via onError per the error-message standard).
 */

export interface FavoriteMutationApi {
  favorited: boolean;
  created?: boolean;
  removed?: boolean;
}

/** Toggle payload: the id is required; pass the full row when available so
 *  the Favorites list cache can be patched without a refetch. */
export interface VenueFavoriteToggleVars {
  venueId: string;
  venue?: VenueApi | null;
}

/** Per-user favorites cache keys (PR-Agent r9, run #110): scoping by user id
 *  makes a previous account's cached ids/lists unreachable after an account
 *  switch on a shared device — logout already wipes the persisted IDB cache
 *  (P2-45) and every logout path hard-navigates (in-memory reset), this is
 *  the belt-and-braces third layer. Undefined user → literal null segment;
 *  such keys are never read because the queries are auth-disabled. */
export function favoritesKeys(userId: string | null | undefined) {
    return {
        ids: ['venues', 'favorites', 'ids', userId ?? null] as const,
        list: ['venues', 'favorites', userId ?? null] as const,
    };
}

/** The caller's favorited venue ids, newest-first — heart-state source.
 *  Run #110 (PR-Agent r5): gated on auth — a signed-out visitor must not
 *  query (401 is "no session", not "fetch failed"), so no misleading
 *  error strip and no permanent inert hearts on the public clubs pages. */
export function useVenueFavoriteIds() {
    const user = useAppStore((s) => s.user);
    const { ids } = favoritesKeys(user?.id);
    return useQuery<string[], FetchError>({
        queryKey: ids,
        queryFn: () => fetcher<string[]>('/venues/favorites/ids'),
        staleTime: 300_000, // favorites change only by explicit user action
        enabled: !!user,
    });
}

/** The caller's favorite venues as full VenueApi rows (Favorites pill source). */
export function useVenueFavorites() {
    const user = useAppStore((s) => s.user);
    const { list } = favoritesKeys(user?.id);
    return useQuery<VenueApi[], FetchError>({
        queryKey: list,
        queryFn: () => fetcher<VenueApi[]>('/venues/favorites'),
        staleTime: 300_000,
        enabled: !!user,
    });
}

/** Idempotent optimistic favorite/unfavorite. */
export function useVenueFavoriteToggle() {
  const queryClient = useQueryClient();
  const user = useAppStore((s) => s.user);
  const { ids: idsKey, list: listKey } = favoritesKeys(user?.id);

  return useMutation<
    FavoriteMutationApi,
    FetchError,
    VenueFavoriteToggleVars,
    { prevIds: string[]; prevList: VenueApi[] | null }
  >({
    mutationFn: ({ venueId }) => {
      const ids = queryClient.getQueryData<string[]>(idsKey) ?? [];
      const willFavorite = !ids.includes(venueId);
      return fetcher<FavoriteMutationApi>(`/venues/${venueId}/favorite`, {
        method: willFavorite ? 'POST' : 'DELETE',
      });
    },
    onMutate: async ({ venueId, venue }) => {
      await queryClient.cancelQueries({ queryKey: idsKey });
      const prevIds = queryClient.getQueryData<string[]>(idsKey) ?? [];
      const prevList = queryClient.getQueryData<VenueApi[]>(listKey) ?? null;
      const wasFav = prevIds.includes(venueId);

      queryClient.setQueryData<string[]>(
        idsKey,
        wasFav ? prevIds.filter((x) => x !== venueId) : [venueId, ...prevIds],
      );
      if (venue) {
        queryClient.setQueryData<VenueApi[]>(
          listKey,
          wasFav
            ? (prevList ?? []).filter((v) => v.id !== venueId)
            : [venue, ...(prevList ?? []).filter((v) => v.id !== venueId)],
        );
      }
      return { prevIds, prevList };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx) {
        queryClient.setQueryData(idsKey, ctx.prevIds);
        if (ctx.prevList) queryClient.setQueryData(listKey, ctx.prevList);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: idsKey });
      void queryClient.invalidateQueries({ queryKey: listKey });
    },
  });
}
