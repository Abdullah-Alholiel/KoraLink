# Factory Run #51 — Gates 1-3 Program Design

## Gate 1 — Product Spec
**Problem:** a player opens a club page; the match-list fetch fails (network/server). The page
shows "No matches scheduled" — a lie: games may exist, user leaves the club page believing the
club has nothing on. Venue error IS handled (page :150); matches error is dropped (page :103).
**User story (P0 of this item):** As a player, when the club's games list fails to load, I see
"what happened + why + what to do next" with a retry — never a false empty state.
**IN:** error branch for the matches list only (localized, classified copy + retry), markedReadIdsRef
reset on match switch, specs for both. **OUT:** P2-57 SWR recipes (owner scope boundary), venue
error rework (compliant), any API change.

## Gate 2 — Architecture
| File | Change |
|---|---|
| `apps/player-pwa/src/app/[locale]/clubs/[id]/page.tsx` | destructure `error: matchesError, refetch: refetchMatches` (:103); insert error branch above the loading branch in the matches section (~:349) |
| `apps/player-pwa/src/hooks/useMessages.ts` | reset `markedReadIdsRef.current = new Set()` inside the existing matchId-change effect (~:205) |
| `apps/player-pwa/test/app/clubs-detail-error.test.tsx` | NEW spec (CDE-1/2/3) |
| `apps/player-pwa/test/hooks/useMatchChatReadWatermark.test.tsx` | +1 case: ref resets across match switch |
| `apps/player-pwa/src/messages/*.json` | none — existing `errors.*`/`common.retry` keys |
| API/DB | none |

Data flow unchanged (useMatches → page). Observability: no new scope — SWU/captureError pattern
untouched; API untouched (no new Sentry/Pino surface to wire; AGENTS.md §4 wires observability on
feature slices, this is a render-state fix + hook hygiene).

## Gate 3 — Program Design (contracts)
- Hook contract (existing, unchanged): `useMatches({date?, venue_id?})` → `{ matches: Match[],
  total?, hasMore, fetchNextPage, isFetchingNextPage, isLoading, error: FetchError|null, refetch,
  isSuccess, isError }` (useMatches.ts:149-166).
- Render contract: `matchesError && !matchesLoading` → centered column [AlertTriangle (text-brand-red),
  `errors.<kind>` line, `common.retry` button `onClick={() => void refetchMatches()}`] — exact mirror
  of the page's own venue-error block (:150-156). Empty state renders only when `!matchesError`.
- Hook contract (P2-62): on `matchId` change, `markedReadIdsRef.current` MUST be empty before the
  open-mark effect runs — dedup never suppresses marks for a newly opened match within a session.

## Gate 3 contract verification checklist (show every item)
- [x] Every mutation endpoint returns a fully populated object with relations — N/A: no API mutations this cycle (render-state + client hook only).
- [x] Frontend types can accept the exact JSON the backend produces — N/A: no shape changes; existing useMatches/useMessages contracts consumed as-is.
- [x] Adapter functions exist for every API shape the frontend consumes — N/A: no new API shape; page consumes the hook's adapted `Match[]` (no re-adaptation).
- [x] No field silently `undefined` that the backend claims to return — N/A: no field changes.
- [x] i18n keys exist for every user-facing string in both languages — VERIFIED: zero new keys; `errors.network/server/...` (9 kinds) + `common.retry` + `clubs.error` present in BOTH en.json and ar.json (parity script-verified this run).
- [x] No dead UI: retry button wired to `refetchMatches()` (real handler) — enforced by new spec CDE-2.
- [x] 5 UX states on the surface: loading (:350)/error (NEW)/empty (:351)/offline (OfflineBanner + errors.network)/success (unchanged) — now all five present.

**Gate 3 → Gate 4: PROCEED** (autonomous mode).
