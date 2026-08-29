# Partner Match Visibility (P1-26) — 4-Gate Docs

## Gate 0 — Retro (area audit)

- `partner.controller.ts` (routes): venues CRUD, pitches CRUD, slots list/create/generate/
  delete, dashboard, earnings, verification. NO match/roster route. Partner ops run blind:
  they cannot see today's matches or no-shows on their own pitches.
- `partner.service.ts` has the building blocks: `scopedPitchIds(ownerId, role)` (Admin→all),
  `UPCOMING_STATUSES` (`IN ('Open','Full','InProgress')`), dashboard joins
  `pitch_slots ← matches` for today's schedule.
- `matches.service.ts` roster pattern: `LEFT JOIN match_players mp → JOIN users u`,
  `COUNT(mp.id)::int AS spots_filled` (host included, no FILTER), ORDER BY `mp.is_host DESC`.
- Bug-class sweep (Reviewer A, run #16): clean. createVenue/createSlot bare returns are
  known P2-5 class, NOT extended here — the new method returns explicit selected columns.
- Contract rule check: this is a READ endpoint (no mutation contract applies).
- Prior-cycle commits touching this area: none since `d93e1ea` (run #3, admin-scope fix).

## Gates 1–3 — Program design (compact)

**Problem:** venue owners cannot see matches booked on their pitches — no today view, no
rosters, no no-show awareness. Dispute context is admin-only.

**User story:** as a venue owner, I open the partner console, see today's (and upcoming)
matches on my pitches with player counts, and can open any match to see its roster with
no-show flags — so I can staff the pitch and resolve "who was here" questions myself.

**Scope:**
- IN: `GET /partner/matches` (scoped, windowed, roster-counted), `GET /partner/matches/:id`
  (roster detail), admin app "Matches" nav item + `/partner/matches` list page +
  `/partner/matches/[id]` detail page, en/ar i18n, 4 jest specs.
- OUT: partner-initiated actions on matches (cancel/no-show marking — admin-only remains),
  chat access, PWA changes, payments.

**Architecture delta:** 2 new routes in partner.controller.ts + 2 methods in
partner.service.ts; admin app gains a 5th partner nav section + 2 pages + types.

**Exact API JSON shapes:**

`GET /partner/matches?scope=today|upcoming&limit=50&offset=0` →
```json
{
  "matches": [
    {
      "id": "uuid36", "title": "Thursday 7s", "status": "Open",
      "scheduled_at": "2026-08-30T18:00:00.000Z", "duration_mins": 90,
      "booking_mode": "slot",
      "spots_filled": 7, "max_players": 10, "no_show_count": 0,
      "pitch_id": "uuid36", "pitch_name": "Pitch A",
      "venue_id": "uuid36", "venue_name": "Riyadh Arena",
      "host_name": "Faisal"
    }
  ],
  "total": 1, "hasMore": false
}
```
- `scope=today`: Riyadh-local calendar day (matches on venue timezone — Riyadh is the app
  display TZ) = `scheduled_at >= start-of-day(Riyadh, today)` AND `< start-of-day+24h`.
- `scope=upcoming`: `scheduled_at >= now()`, any future day. Default scope: `today`.
- `status` filter (optional): `?status=Open|Full|InProgress|Completed|Cancelled`.
- Visibility: public/private BOTH visible to the partner (they own the pitch; private is a
  player-discovery concept, not an ops one).

`GET /partner/matches/:id` → 403 for non-scoped pitch; else
```json
{
  "id": "uuid36", "title": "...", "status": "Open", "visibility": "public",
  "scheduled_at": "...", "duration_mins": 90,
  "spots_filled": 7, "max_players": 10, "no_show_count": 0,
  "booking_mode": "slot",
  "pitch_name": "Pitch A", "venue_name": "Riyadh Arena",
  "host_name": "Faisal",
  "players": [
    { "user_id": "uuid36", "full_name": "Faisal", "phone": "+9665...", "team": "A", "is_host": true, "no_show": false }
  ]
}
```

**TS signatures:**
- `getPartnerMatches(ownerId: string, actorRole?: string, q: { scope: 'today'|'upcoming'; status?: string; limit: number; offset: number }): Promise<{ matches: PartnerMatchRow[]; total: number; hasMore: boolean }>`
- `getPartnerMatch(actorId: string, actorRole: string, matchId: string): Promise<PartnerMatchDetail>`

**Admin app TS:** `PartnerMatchRow`, `PartnerMatchDetail` in `lib/types.ts`; pages consume
`useLiveAdminData` (list: poll on `['matches']`; detail: plain `useEffect` + `apiFetch`).

**i18n keys (en + ar, `partner.matches` namespace):** title, subtitle, loading, error, empty,
scopeToday, scopeUpcoming, filterAll, thMatch, thPitch, thVenue, thTime, thPlayers, thNoShows,
thStatus, rosterTitle, host, team, noShow, player (pluralized label uses ICU {count}).

**Gate 3 contract verification checklist:**
- [x] Read-only endpoints — mutation contract (§2) N/A; both methods return explicit column
      selections (no `.returning()`, no bare rows).
- [x] Response JSON matches admin types (PartnerMatchRow/PartnerMatchDetail written from the
      SQL output, every field mapped).
- [x] Numeric fields cast `::int` (counts) / `::text` (phone) in SQL — no silent undefined.
- [x] Scoping enforced server-side (pitch ownership via scopedPitchIds/join), Admin bypasses
      (consistent with getDashboard/getEarnings).
- [x] i18n keys added in BOTH en.json + ar.json under `partner.matches`; parity check planned.
- [x] No `::uuid` casts (all IDs varchar(36)); no `eq(col, null)`; additive predicates only.
