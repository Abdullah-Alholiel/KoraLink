# Run #68 — Gates 1-3 Compact (pwa-drain-clubs-hygiene)

## Gate 1 — Product
**Problem:** On Clubs, the default "Nearby" pill does not actually order venues by
distance (no-op since introduction), a "Top Rated" pill renders but filters nothing
(product has no ratings pipeline — `venues.rating` is all-zero, no write path), and
the empty state tells a user with ZERO venues to "adjust your filters".
**User story:** As a player opening Clubs, the Nearby order should put the closest
venues first, I should not see a filter that does nothing, and an empty list should
say something true about why it's empty.
**Scope IN:** client-side distance sort on the fetched set; remove Top Rated pill;
split empty-state copy (filtered-empty vs zero-venues); page tests for all three.
**Scope OUT:** real ratings pipeline (stays a backlog lead — needs venue-review
submission flow first); radius hard-cutoff (deliberately descoped since P1-2);
server-side sort (set is already server-searched, ≤50 rows client sort is the
native mechanism); any API/schema change.

## Gate 2 — Architecture
Single file change + tests + i18n keys:
- `apps/player-pwa/src/app/[locale]/(main)/clubs/page.tsx`
  - FILTER_KEYS: remove `'Top Rated'`; drop its FILTER_LABEL_MAP entry.
  - `filteredVenues` → keep predicate filter (Indoor/Available Now unchanged);
    add memoized stable sort when `activeFilter === 'Nearby'`: ascending
    `distance_m`, `null`/missing last; ties keep API order (stable by spec).
  - Empty state: `venues.length > 0` → heading `common.noResults`, description
    `clubs.noClubsDescription` (existing "adjust your filters" advice is correct
    for the filtered-empty case); `venues.length === 0` → heading `clubs.noClubs`,
    description NEW `clubs.noClubsEmpty`.
- `messages/en.json` + `ar.json`: `clubs.noClubsEmpty` (EN+AR) — only i18n delta;
  `clubs.filters.topRated` keys stay in the dicts (harmless, keeps parity diff at
  +1 leaf on both sides).
- No API/hook/type changes (`distance_m: number | null` already on VenueApi).

## Gate 3 — Contracts
No API contract touched. Frontend-only:
- Component contract: pill row renders exactly `Nearby | Indoor | Available Now`;
  Nearby ordering is a pure function of the fetched array; null-distance venues
  never sort before known-distance ones.
- i18n parity: en/ar leaf-key counts must stay EQUAL after the change (currently
  974/974 per Reviewer A) → +1 leaf each side.
- Sorting must be SSR/hydration-safe: `filteredVenues` derives from `venues`
  (React Query data) + `activeFilter` state only — no clock, no randomness.

### Contract verification checklist (run before Gate 4)
- [✓] No mutation endpoints touched — mutation return contract (§2) not applicable.
- [✓] `VenueApi.distance_m` already declared `number | null` (useVenues.ts:16) —
  the sort input type exists; no field silently undefined.
- [✓] No adapter changes — `adaptVenues` output feeds the sort unchanged.
- [✓] i18n: new key added to BOTH en.json and ar.json in the same commit;
  parity test (`test/i18n.test.ts`) enforces equal leaf counts.
- [✓] No `new Date()`/`Date.now()`/`Math.random()` in the new render path.

## Gate 4 slice plan
- Slice 1 (tracer): sort + pill removal + empty-state split in one commit,
  with `page.test.tsx` covering order, pill absence, both empty variants.
  Gates: `npx vitest run` (full suite), `npm run type-check`, root
  `npm run build` (turbo 3/3). Single commit — the slice is one file + keys.

## Observability note (AGENTS.md §4)
UI-only change; existing page telemetry unchanged. No new error paths (sort
cannot throw on typed input; null coalescing handled).
