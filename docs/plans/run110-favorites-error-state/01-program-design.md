# Run #110 — Program Design (Gates 1–3 compact)

## Problem
GET /venues/favorites/ids failure renders "No favorites yet" to users WITH favorites
(false-empty dead-end on a booking-entry surface). Plus: all hearts freeze during any toggle.

## User story
As a player with saved clubs, when the favorites list fails to load, I see an honest error
with a Retry — not an empty state claiming I have no favorites.

## Contract (exact)
- Hook: `useVenueFavoriteIds()` returns React Query result — page adds `isError: favIdsError`,
  `refetch: refetchFavIds` destructures. No API change.
- Filter behavior: while `favIdsError` → Favorites pill shows the UNFILTERED fetched list
  (fail-open — same principle as the loading guard; never narrow on unknown state).
- Error strip: when `activeFilter === 'Favorites' && favIdsError && !favIdsLoading`, render a
  role="status" strip above the grid: `clubs.favoritesError` + `common.retry` → refetchFavIds().
  Never inside the generic empty block.
- i18n keys (EN + AR, both files):
  - `clubs.favoritesError`: EN "Couldn't load your favorites." / AR "لم نتمكن من تحميل المفضلة."
  - (reuse existing `common.retry` for the action — parity verified in-board.)

## TS signatures (no signature changes — destructure-only)
```ts
const { data: favIds, isLoading: favIdsLoading, isError: favIdsError, refetch: refetchFavIds } = useVenueFavoriteIds();
```
Per-heart pending (both surfaces):
```ts
disabled={favoriteToggle.isPending && favoriteToggle.variables?.venueId === venue.id}
```
(mutation `variables` = last-call vars; exactly one in flight due to shared isPending —
 comparison yields per-venue isolation with zero new state.)

## Gate 3 contract checklist
- [x] No API mutation; GET contracts unchanged (E2E re-verified this run).
- [x] Page consumes existing hook fields (isError/refetch are React Query standard).
- [x] Adapter: none needed (bare-array contract per run-#109 retro).
- [x] i18n keys added BOTH locales before UI references them.
- [x] Error copy follows what/why/next standard; strip uses role="status" per a11y lens.

## Slices
S1: ids-error destructure + fail-open filter + strip + i18n EN/AR.
S2: per-heart pending isolation (clubs cards + detail hero).
S3: vitest cases + full gates + lane PR.
