# Gate 3 — Program Design (contract gate): Club "Available Matches" First-Look

## 1. API response shape (unchanged)
`GET /matches?venue_id=X` (no `date`) and `GET /matches?venue_id=X&date=YYYY-MM-DD` both return:

```json
[
  {
    "id": "match-uuid",
    "title": "Friday Night Kickoff",
    "match_type": "Casual",
    "gender_rule": "Men Only",
    "status": "Open",
    "scheduled_at": "2026-08-16T18:00:00.000Z",
    "duration_mins": 60,
    "price_per_player": 37,
    "max_players": 14,
    "spots_filled": 8,
    "distance_m": null,
    "host_id": "u1", "host_name": "Khalid", "host_avatar": null,
    "pitch_id": "p1", "pitch_name": "Pitch 1", "pitch_size": "7v7", "pitch_surface": "Grass",
    "venue_name": "Green Field Stadium", "venue_city": "Riyadh",
    "is_joined": false, "has_voted": false,
    "visibility": "public",
    "voting_closes_at": "2026-08-17T19:00:00.000Z"
  }
]
```
Only the WHERE clause changes: `venue_id` no longer forces `TRUE`; the same
`(open/full/inprogress upcoming) OR (POTM-window participant)` predicate applies.

## 2. TypeScript contracts
```ts
// hooks/useMatches.ts (unchanged)
useMatches(filters?: { date?: string | null; venue_id?: string | null }): UseQueryResult<{ matches: Match[]; total?: number; hasMore?: boolean }, FetchError>

// MatchDateSections (unchanged)
interface MatchDateSectionsProps { matches: Match[]; currentUserId?: string; locale: AppLocale }

// club page state
const [selectedDate, setSelectedDate] = useState<Date | null>(null);       // null = "all"
const dateStr = selectedDate ? dateInRiyadh(selectedDate) : null;
```

## 3. Adapter contract
`useMatches` already calls `adaptMatchList(rows)` → `Match[]` with `date: dateInRiyadh(scheduled)`.
No adapter change. `MatchDateSections` keys buckets on `m.date` (YYYY-MM-DD) → correct.

## 4. i18n key contract
| Key | en | ar |
|-----|----|----|
| `clubs.allMatches` | All upcoming matches | جميع المباريات القادمة |
| `clubs.showAll` | Show all | عرض الكل |
| `clubs.noMatchesAll` | No matches scheduled | لا توجد مباريات مجدولة |
| ~~`clubs.backToToday`~~ | *removed* | *removed* |
| `clubs.availableMatches` | Available Matches | المباريات المتاحة (keep) |
| `clubs.noMatches` | No matches on this date | لا توجد مباريات في هذا التاريخ (keep) |
| `clubs.today` / `clubs.tomorrow` | Today / Tomorrow | اليوم / غداً (keep) |

## 5. Contract verification checklist
- [x] No mutation endpoint changes — `findNearby` is read-only; return shape identical.
- [x] `MatchDateSections` consumes `Match[]` (already adapted) — no new adapter.
- [x] `Match.date` is populated by `adaptMatchList` (`date: dateInRiyadh(scheduled)`).
- [x] No `undefined` fields introduced — `currentUserId` is optional and only affects card state.
- [x] Every new user-facing string has both `en.json` and `ar.json` entries (table above).
- [x] `venue_id` scoping preserved via `venueClause` (`AND v.id = ${venue_id}::text`).
