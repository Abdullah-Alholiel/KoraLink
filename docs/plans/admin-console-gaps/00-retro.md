# Admin Console — Wiring Gaps (Gate 0 Retro + Contract)

## Retro (audit findings — verified against live API)

All three services run (`:3000` PWA, `:3001` API, `:3002` admin). Admin dev-login
returns a JWT with `role`, `/admin/*` and `/partner/*` controllers all exist and
match the frontend routes. Verified live: metrics/users return real seed data.

**Fixed immediately:** `ADMIN_URL` in `apps/api/.env` lacked the Tailscale origin
`http://100.93.99.24:3002` → CORS preflight rejected dev-login from the browser.
Now `ADMIN_URL=http://localhost:3002,http://100.93.99.24:3002`.

**Gaps (what's missing / not wired):**

| # | Gap | Severity |
|---|-----|----------|
| 1 | Ban/suspend writes `banned_at`/`suspended_until` but the auth guard never checks them — a banned user keeps their 7-day JWT | P0 |
| 2 | Dispute `resolve()` only flips status + audit — no refund/penalty/no-show reversal. Also **nothing creates disputes** (no endpoint) and `markNoShow` never increments `no_show_count` | P0 |
| 3 | `platform_margin_sar` editable in Settings but pricing uses hardcoded `PLATFORM_MARGIN_SAR = 5` | P1 |
| 4 | `grace_period_mins` stored but `markNoShow` has no grace window | P1 |
| 5 | `payout_cadence_days` stored but no settlement generation (0 pending payouts) | P1 |
| 6 | No admin screens: matches list, user detail, venue verification review (backend endpoints exist for 6b/6c) | P2 |

## Scope

- **P0a** — enforce ban/suspend at the auth layer (401) + block re-login (403).
- **P0b** — dispute lifecycle: player appeal endpoint + `markNoShow` increments
  `no_show_count` + admin resolve applies real effects (reverse no-show/count).
- **P1** — `PlatformSettingsService` (shared, cached) reading `app_settings`;
  wire `platform_margin_sar` into pricing, `grace_period_mins` into no-show
  timing, `payout_cadence_days` into a settlement-generation admin action.
- **P2** — admin screens: Matches list, User detail, Venue verification review.

## Contracts (Gate 3 — exact shapes)

### P0a — auth enforcement
- Guard `jwt-cookie.strategy.validate()`: select `banned_at`,`suspended_until`.
  - banned → `UnauthorizedException('Account banned.')` (401)
  - suspended (`suspended_until > now()`) → `UnauthorizedException('Account suspended.')` (401)
- `auth.service.verifyOtp()`: after OTP verified, if `banned_at` → `ForbiddenException('Account banned.')`;
  if suspended → `ForbiddenException('Account suspended.')`. (blocks re-login)

### P0b — dispute lifecycle
- `POST /matches/:id/dispute` (JwtCookieAuthGuard) body `{ type, reason? }`
  - validates: user is in roster AND `no_show = true` (appeal only makes sense then),
    type is one of the `DisputeType` enum values (default `no_show`).
  - inserts `disputes { match_id, reporter_id: current, respondent_id: host, type, evidence: [{reason, at}] }`
  - returns the created dispute `{ id, type, status: 'opened', match_id, reporter_id, respondent_id, created_at }`
- `matches.service.markNoShow()`: on marking `true` → `users.no_show_count += 1`;
  on unmarking `false` → `no_show_count -= 1` (floor 0). Same transaction.
- `admin/disputes.service.resolve()`: when `outcome === 'resolved'` AND
  `type === 'no_show'` → set `match_players.no_show = false` for reporter on that
  match, decrement reporter's `no_show_count` (floor 0). `rejected` → no change.

### P1 — settings
- `PlatformSettingsService.getNumber(key, fallback)` / `.getString(key, fallback)`
  with 30s in-memory TTL. Reads `app_settings` (value is JSON).
- `matches.service.calculatePricePerPlayer()`: margin = `await getNumber('platform_margin_sar', 5)`.
- `matches.service.markNoShow()`: reject if `now < scheduled_at + grace_period_mins`
  (`getNumber('grace_period_mins', 0)`; 0 = no grace, current behaviour).
- `admin/settlements.service.generatePending()`: one `pending` settlement per venue,
  `amount = SUM(pitch_cost_sar)` of completed `booking_mode='koralink'` matches in
  the last `payout_cadence_days` (`getNumber(..., 7)`) with no existing settlement
  covering that period. `POST /admin/settlements/generate` (AdminAuthGuard).

### P2 — admin screens
- `GET /admin/matches` (`{ matches, total, page, perPage }`) + `GET /admin/matches/:id`
  + `POST /admin/matches/:id/cancel` (AdminAuthGuard). Row: id, title, status,
  scheduled_at, pitch name, venue name, host name, spots_filled/max_players, price.
- Admin UI: `/matches` list page (table + status filter + cancel action) added to
  Sidebar; `/users/[id]` detail page (reuse `GET /admin/users/:id` incl. matchesPlayed,
  totalSpent); `/venues/[id]` verification review page (reuse
  `GET /admin/venues/:id/verification`).

## Verification (hard gate)

`npm run build` (turbo) zero errors + `cd apps/player-pwa && npx vitest run` green
+ API `npx tsc --noEmit` clean after each slice. Commit per slice (conventional).
