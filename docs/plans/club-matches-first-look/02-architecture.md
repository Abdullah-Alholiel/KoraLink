# Gate 2 — Architecture: Club "Available Matches" First-Look

## Data flow

```
┌───────────┐   GET /matches?venue_id=X            ┌──────────────────────┐
│ Club page │  (date omitted → all upcoming)  ───▶ │ findNearby (service) │
└─────┬─────┘                                       └──────────┬───────────┘
      │  useMatches({ date: null|string, venue_id })            │ NearbyMatchRow[]
      ▼                                                        ▼
   adaptMatchList → Match[]  ──▶  MatchDateSections  ──▶  MatchCard[] (currentUserId)
```

## Backend change — `apps/api/src/modules/matches/matches.service.ts`
`findNearby`: remove the `venue_id ? sql`TRUE`` short-circuit. The status/time filter is now
applied uniformly (upcoming open/full/inprogress OR POTM-window-participant), and `venueClause`
(`AND v.id = ${venue_id}::text`) still scopes to the venue. No DTO/schema/controller change.

## Frontend change — `apps/player-pwa/src/app/[locale]/clubs/[id]/page.tsx`
1. `selectedDate` state → `Date | null`, default `null`.
2. `useMatches({ date: selectedDate, venue_id: id })` (null → no `date` param → all).
3. `dateStr` → `dateInRiyadh(selectedDate)` (only used when a date is selected).
4. Render `MatchDateSections matches={matches} currentUserId={currentUserId} locale={...}`
   (import from `@/components/matches/MatchDateSections`), replacing the flat map.
5. `currentUserId` from `useAppStore(selectUser)`.
6. Header: no date → `clubs.allMatches` label; date → `formatDateLabel` + "Show all" button.
7. Replace `handleGoToToday`/`isToday` with `handleClearDate` (sets `selectedDate = null`).
8. Calendar sheet: `DatePicker selectedDate={selectedDate}` (null = no highlight), keep
   `fireOnMount={false}`; "Show all" button in the sheet header when a date is selected.

## Files changed
| File | Change |
|------|--------|
| `apps/api/src/modules/matches/matches.service.ts` | Remove `venue_id ? TRUE` bypass |
| `apps/player-pwa/src/app/[locale]/clubs/[id]/page.tsx` | Default all-games + `MatchDateSections` + auth ctx |
| `apps/player-pwa/src/messages/en.json` | `clubs.allMatches`, `clubs.showAll`, `clubs.noMatchesAll`; drop `clubs.backToToday` |
| `apps/player-pwa/src/messages/ar.json` | same keys, Arabic |
| `apps/player-pwa/test/components/MatchDateSections.test.tsx` | NEW — grouping/breaker/order |

## i18n keys
- `clubs.allMatches` — "All upcoming matches" / "جميع المباريات القادمة"
- `clubs.showAll` — "Show all" / "عرض الكل"
- `clubs.noMatchesAll` — "No matches scheduled" / "لا توجد مباريات مجدولة"
- remove `clubs.backToToday` (no longer meaningful — default is now "all", not "today")
- keep `clubs.today` / `clubs.tomorrow` (still used by `formatDateLabel`)

## Risks & mitigations
- Removing `venue_id → TRUE` could hide a venue match a user expects to see → only affects
  completed/cancelled past matches, which are not "available"; matches the discovery feed.
- React Query key `['matches', { date: null|string, venue_id }]` distinct → refetch correct.
