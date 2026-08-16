# Gate 1 — Product Spec: Club "Available Matches" First-Look

## Problem statement
On a club detail page, the "Available Matches" section defaults to *today only*, in a flat list
with no day separators. This diverges from the Play screen's first-look, which shows **all
upcoming games grouped by day** with a date breaker between days. The user wants the club view
to behave the same: first-look = all games with day/date breakers; "View Calendar" narrows to
a single selected day.

## User stories
- **P0** As a player opening a club page, I see all upcoming matches at that club grouped by day
  with a day+date breaker, matching the Play first-look — without touching the calendar.
- **P0** As a player, "View Calendar" lets me pick a day and see only that day's matches.
- **P0** As a player, after picking a day I can return to "all matches" with one tap.
- **P1** As a player, cards reflect my real state (joined / hosted / POTM) instead of always "Join".
- **P1** As a player near midnight in Riyadh, the date filter uses the correct local day.

## Scope
**IN SCOPE**
- Club page default = all upcoming matches (no date filter), rendered via `MatchDateSections`.
- "View Calendar" bottom sheet → filter to a single day.
- Header/empty-state "Show all" affordance to clear the date filter.
- Pass `currentUserId` to cards; use `dateInRiyadh` for the date string.
- Backend: stop `venue_id` from bypassing the status/time filter (no past matches).

**OUT OF SCOPE**
- Host/admin view of a club's full match history.
- Pagination / infinite scroll beyond LIMIT 50.
- Changing `MatchDateSections` sort semantics (distance sort is a no-op for same-venue, harmless).

## Success criteria (verifiable)
1. Club page (no date selected) renders ≥1 date breaker matching `formatDateSection`.
2. Selecting a date in the calendar shows only that day's matches.
3. "Show all" returns to the grouped all-matches view.
4. A completed/cancelled past match does NOT appear in the club list.
5. `turbo run build` green; `npx vitest run` green; new `MatchDateSections` test passes.

## Open questions
None — resolved by reusing Play's `MatchDateSections` + `useMatches({ date: null })` contract.

## Risks
- `useMatches` queryKey `['matches', filters]` — changing `date` from a string to `null` creates a
  distinct key; React Query refetches correctly. No stale-cache risk.
