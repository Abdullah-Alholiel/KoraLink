# Program Design — Waitlist + Capacity Standardisation (Gates 1–3)

## Problem
1. Match capacity (`max_players`) is client-supplied and unrelated to pitch size → cards
   show "12/12" next to a 14-slot lineup. False data everywhere.
2. A FULL match offers no queue path → churn (board P1-17).

## Capacity invariant (the standard)
`matches.max_players = 2 × perSide(pitches.size)` — always.
5v5→10 · 7v7→14 · 8v8→16 · 11v11→22. `max_players` becomes a DERIVED value:
- **API**: `createMatch` derives it from `pitches.size` (client `max_players` is ignored,
  exactly like `pitchCostSar` before it). DTO field stays (back-compat) but docstring
  marks it derived. Service `minPlayersFor(max)` logic is unchanged (already derives
  min from max).
- **DB trigger**: `BEFORE INSERT OR UPDATE ON matches` — raises if `max_players` deviates
  from the pitch's capacity. Non-negotiable backstop (cross-table CHECK is impossible).
- **Existing bad rows**: one-shot data fix migrates the 6 violating rows to capacity
  (3 demo rows 16→14, 12→14, 10→14; 3 rejected test rows get swept by the new seed's
  reset). `min_players` recomputed with the same `max−2, floor 2` rule in SQL.

## Waitlist (P1-17) — vertical slice

### Contract (verified against live service code)
- `POST /api/v1/matches/:id/waitlist` → **201** `{ message, position, waitlist_id }`,
  guarded `JwtCookieAuthGuard`. Position = 1-based FIFO.
- `DELETE /api/v1/matches/:id/waitlist` → **200** `{ message }` (leave queue).
- `GET /api/v1/matches/:id/waitlist` → **200** `{ count, waitlist: [{ userId, fullName,
  handle, avatarUrl, joinedAt, position, isYou }] }` (host sees everyone; players see
  aggregate + own entry only — privacy standard from DMs).
- Promotion on spot-free: piggyback the EXISTING transactional broadcast in
  `leaveMatch`/`removePlayer` (where `Full→Open` flips) — promote head-of-line inside
  the same tx, notify AFTER commit (activities fire-and-forget pattern).
- Host cancel/complete → queue emptied (cascades), players notified.
- Status semantics: match stays `Open` at capacity? NO — `Full` at capacity (existing
  rule, unchanged); joining still blocked; `GET /matches` feed already carries status.

### Schema — `match_waitlist`
| column | type | notes |
|---|---|---|
| id | varchar(36) PK | gen_random_uuid()-capable (app default too) |
| match_id | varchar(36) FK→matches CASCADE | |
| user_id | varchar(36) FK→users CASCADE | |
| position | integer NOT NULL | resequenced on mutation |
| created_at | timestamptz default now() | |

UNIQUE `(match_id, user_id)` — one entry per player per match.
UNIQUE `(match_id, position)` DEFERRABLE INITIALLY DEFERRED — makes resequencing safe
inside one tx.

### Waitlist guard rules (mirror joinMatch)
- match must be Open|Full (not Cancelled/Completed/InProgress)
- not already a ROSTER member
- not already queued (unique) → 409
- POST while Open (non-full) → 409 'Match has open spots — join directly.'

### CTA (UI standard)
- **MatchCard** (feed): full match shows `Join Waitlist` amber button (not gray FULL).
- **match/[id]** detail: sticky footer shows `Join Waitlist (#N)` when full; queued
  state `Queued · #N` green outline; sheet-free inline error (§12 mutation-error rule).
- Match stays "FULL" badge on the lineup; the CTA sits in the action area — the badge
  describes the match, the CTA describes the action.

### Gates 3 contract-verification checklist
- [x] joinMatch returns 201 (no @HttpCode) — verified live
- [x] cancelMatch is POST, host-only — verified live
- [x] leaveMatch blocks host, flips Full→Open in tx — verified (source read)
- [x] removePlayer = separate path that must also promote — located
- [x] Raw-SQL ids `::text`, never `::uuid` (varchar(36))
- [x] mutation endpoints return populated shapes / explicit messages
- [x] i18n EN+AR keys for every new string
- [x] all strings via next-intl; z-[60]/z-[70] for any sheet (none needed — inline states)
- [x] positions resequenced in ONE transaction (deferred unique)

### Test data (replaces the rejected pack) — `test-` prefix, deterministic
Names standard, capacity true, self-verifying; runner asserts every hop. See
`seed-standard-test-data.sql` + `run-e2e.sh`.
