# Cycle 2 — Attendance/Appeal Loop, Role User Stories, Dynamic Policy

## Gap map (verified by code audit)

| # | Gap | Where |
|---|-----|-------|
| 1 | `useMarkNoShow` hook exists but NO host UI uses it — hosts can't mark attendance → no-shows never set → disputes (cycle 1) have no producer | PWA match detail |
| 2 | No player appeal entry — `POST /matches/:id/dispute` unreachable from PWA; player can't see their no-show status | PWA + adapter drops `no_show` |
| 3 | `refund_policy` editable in admin Settings but MatchRulesSheet shows hardcoded text | PWA rules sheet |
| 4 | Partner can create pitches but NOT edit them (backend `PATCH /partner/pitches/:id` exists, no UI); can't create venues at all | partner portal |
| 5 | Admin can change user `role` via API (`UpdateUserAdminDto.role`) but no UI exposes it — can't promote a player to VenueOwner | admin users |
| 6 | Admin dispute detail shows `messages` (never populated) — the appeal reason lives in `evidence` and is invisible | admin disputes/[id] |
| 7 | `reports` table exists, fully unused (dead feature) — documented, not built this cycle | api schema |

## Slices

### Slice 1 — API: dispute visibility + public policy + partner venues
- `GET /matches/:id/my-dispute` → current user's dispute for a match (or `null`): `{ id, type, status, decision, created_at }`
- `GET /settings/public` → `{ refund_policy }` from app_settings (non-sensitive, public)
- `POST /partner/venues` → create own venue (name, city, address) — starts `is_approved=false`
- Admin disputes/[id] returns evidence already via findOne (verify)

### Slice 2 — PWA: attendance + appeal UI
- Adapter: `RosterPlayer.noShow` ← `no_show`; MatchDetailApi players already carry it
- Host: "Attendance" card on in_progress/completed matches → AttendanceSheet (roster toggle no-show)
- Player: no-show banner when own roster entry `noShow` && no open dispute → AppealSheet (reason → POST dispute); open dispute → status banner; resolved → "reversed" state
- MatchRulesSheet: refund body from `GET /settings/public` when present
- i18n: `attendance.*`, `appeal.*` in en + ar

### Slice 3 — Admin: role management + evidence
- User detail: role select (Player/VenueOwner/Admin) → PATCH /admin/users/:id
- Dispute detail: render `evidence[]` (reason + timestamp) instead of empty messages

### Slice 4 — Partner: pitch edit + My Venues
- My Pitches: edit sheet (name, size, surface, environment, hourly_rate) → PATCH
- New "My Venues" page: list + create form (name, city, address) → POST /partner/venues
- Partner nav += My Venues

## Hard gate
`turbo run build` green + `vitest run` green (player-pwa) + live curl verification of every new endpoint + headless check of new pages.
