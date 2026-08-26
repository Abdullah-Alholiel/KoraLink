# Gate 0 — Retrospective: Env Secret Hardening (P0-3)

**Cycle:** env-secret-hardening · **Run:** #2 · **Date:** 2026-08-26T22:2xZ

## Trigger

Comprehensive reviewer (deepseek-v4-pro, deleg_a6eb6d32) flagged **CRITICAL**:
`apps/api/.env` carries `JWT_SECRET=change-me` and `COOKIE_SECRET=change-me`, loaded by the
**running** systemd process (`EnvironmentFile=apps/api/.env`, PID 1058923). I re-verified
directly against `/proc/<pid>/environ`: both secrets are the placeholder values, and
`NODE_ENV=development`.

## Impact cascade (why this is P0)

1. `JWT_SECRET` is the HS256 signing key for every access token (cookie + Bearer). A
   publicly-known placeholder means **anyone who can reach the API can forge a valid
   `{ sub, phone, role: 'Admin' }` JWT** → full admin-console takeover.
2. `COOKIE_SECRET` signs the HttpOnly session cookie (cookie-parser `main.ts:69`) → a known
   secret lets an attacker forge/forge-verify signed cookies.
3. Compounding: `NODE_ENV=development` means **dev-login is live** (`POST /auth/dev-login`,
   gated by `NODE_ENV===production`) AND the **wallet top-up dummy is live** (P0-2's
   "prod-gate" is NOT exercised on this box). On the Tailscale HTTPS deployment
   (`aa.tail2948f9.ts.net`), any tailnet peer can mint an Admin token or self-credit their
   wallet. The wallet-topup "interim mitigation" (403 when NODE_ENV=production) is effectively
   bypassed because the box runs `development`.

## Code fallbacks (why nothing failed loudly)

- JWT modules default to `'fallback-dev-secret'` (`auth.module.ts:18`, `jwt-cookie.strategy.ts:44`,
  `app.gateway.ts:109`, `gateway.module.ts:16`).
- `main.ts:33` defaults cookie secret to `'change-me'`.
- `.env.example:14-15` ships `change-me-to-a-random-64-char-string` / `change-me-to-another-random-string`
  — so a fresh `cp .env.example .env` silently boots with placeholders.

**No bootstrap validation exists** — the app serves traffic with whatever secret it finds.

## Fix:feat ratio

Recent commits (since run #1) are 1 docs + 1 deps + 1 STATE handoff — no fix churn. This run
adds one security `feat` + hardening. Healthy.

## Decision

Proceed to Gates 1-3 (compact) → Gate 4 vertical slice:
**bootstrap secret guard (hard-fail on placeholder/weak secrets) + generate real secrets on the
live box + fix `.env.example` guidance.**

## Classified findings from review (for the board)

| # | Sev | Finding | Evidence |
|---|-----|---------|----------|
| P0-3 | CRITICAL | Placeholder JWT/COOKIE secrets in live deployment | `/proc/<pid>/environ`, `apps/api/.env`, `main.ts:33` |
| P1-x | IMPORTANT | `updatePitch` omits actorRole → Admin can't edit pitch | `partner.service.ts:317` |
| P1-x | IMPORTANT | `getDashboard`/`getEarnings` owner-scoped → Admin sees empty partner portal | `partner.service.ts:149,374` |
| P2-x | MINOR | `sendPomDecidedNotification` omits locale | `notifications.service.ts:192-196` |
| P2-x | MINOR | money aggregated via `::float` (rounding) | `settlements.service.ts:36,107` etc. |
| P2-x | MINOR | settlement `generatePending` not in tx | `settlements.service.ts:99-150` |
| P2-x | MINOR | `useLiveAdminData` opens a socket per instance | `use-live-data.ts:61-86` |

## Prior-run claim verification (all CONFIRMED)

P0-1 (chat access control), P1-3 (idempotency), P1-4 (7 FK indexes), P1-5 (SW locale, with
caveat: POTM notification omits locale), P1-1 (3 cron jobs), P0-2 (prod-gate code exists) —
all confirmed in code + DB. Live DB spot-checks this run: 7/7 indexes, `locale` column,
`reminders_sent_at` column, `pom_winner_id` on 4 matches, POTM finalize log line.
