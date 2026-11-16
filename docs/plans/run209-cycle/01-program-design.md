# Run #209 — Program Design (compact, items 2–4)

## Item: Restore drill (D-20261113-09 — worker request, launch condition 5)
- **Contract:** restore latest nightly prod dump into a THROWAWAY PG container; journal rows
  = 60; seed data present; PostGIS live; never prod/staging; write docs/runbooks/restore-drill.md.
- **Shape:** `postgis/postgis:17-3.5` (amd64 under `--platform` emulation — arm64 alpine has no
  manifest; supabase image crashes at boot; plain postgres:17-alpine lacks PostGIS). Restore via
  momentum-db's psql 17.6 (the dump's own client — its `\restrict` meta-command breaks older psql).
- **Acceptance:** RC=0 with ON_ERROR_STOP=1; journal 60/60; tables ≥30; users=2 (seed phones).

## Item: F6 rate-limit review (production-plan Step 3)
- **Contract:** every public (unauthenticated-reachable) endpoint carries rate-limit coverage.
- **Method:** Reviewer A enumerated all 7 public routes (auth×5, health, public-settings) →
  global ThrottlerGuard APP_GUARD 60/min + per-route @Throttle on auth (3/min, 50/day OTP cap).
  **Result: CLEAN — no gaps, no build needed** (evidence in run report).

## Item: P2-369(a+b) wallet reconcile hardening
- **API delta:** none (no route/DTO/schema change).
- **TS contracts:** `expiryHours = Math.max(1, parseInt(env) || 24)` — floor 1h, '0'/unparsable
  keep the 24h default. `expiredNotifyGuard` eviction loop mirrors agedOutAlerted (before the
  empty early-return; zero extra queries).
- **Safety argument (in-code):** no writer flips failed→pending → an evicted id can never
  re-match the expiry UPDATE's `status='pending'` predicate.
- **Tests:** 3 pins — negative env → expiryHours:1 (Sentry payload); eviction renders without
  the evicted id in the UPDATE exclusion (PgDialect render proof, ONE service instance across
  two sweeps); still-pending id keeps guard (exclusion + alert-dedup hold).
- **Gates:** jest 152/152 suites (1497), api tsc 0, turbo 3/3 sequential; PR #260 → 8/8 checks
  + PR-Agent clean → squash `61c2b83` → API restarted (dist verified live).

## i18n keys
None (no user-facing strings touched).
