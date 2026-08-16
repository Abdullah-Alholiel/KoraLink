# Admin Dashboard — Cycle Status

| Gate | Name | Status | Artifact |
|------|------|--------|----------|
| 0 | Retrospective | ✅ APPROVED | [00-retro.md](./00-retro.md) |
| 1 | Product Spec | ✅ APPROVED | [01-product.md](./01-product.md) |
| 2 | Architecture | ✅ APPROVED | [02-architecture.md](./02-architecture.md) |
| 3 | Program Design | ✅ APPROVED | [03-program-design.md](./03-program-design.md) |
| 4 | Vertical Slices | ✅ DONE (Slice 1 tracer + full HQ console) | see below |

## Decision (location)
Admin portal lives at **`apps/admin`** in the existing Turbo monorepo (Next.js 15 App
Router, port 3002, `ADMIN_URL` already reserved in API CORS). Shares the NestJS API via a
role-gated `AdminModule`. Venue Partner portal = follow-up cycle (schema + RBAC already
support it).

## What landed (Slice 1 — full HQ console)
- **Schema**: `disputes`, `dispute_messages`, `venue_verifications`, `settlements`,
  `audit_logs`, `reports`, `app_settings`; moderation cols on `users`; `is_active`/`images`
  on `pitches`; new enums + `SETTLEMENT`/`PAYOUT`/`ADJUSTMENT` reference types. Migration
  `0011_volatile_reaper.sql`.
- **RBAC**: `AdminAuthGuard`, `RolesGuard` + `@Roles`; `devLogin` now signs `role`.
- **AdminModule**: metrics, users, venues(+approval), disputes(+resolve), transactions
  (+refund), settlements(+pay), settings, audit-logs — all `@UseGuards(AdminAuthGuard)`,
  all mutations return populated objects + write `audit_logs`.
- **apps/admin**: login (dev-login + OTP), dashboard (metrics + Recharts), users, venues,
  disputes(+detail), transactions, settlements, settings, audit log.

## Verification (real terminal output)
- `npm run build` → **3/3 tasks, exit 0**
- `apps/api` jest → **11/11 pass** · `apps/player-pwa` vitest → **175/175 pass**
- Live smoke: admin dev-login → `GET /admin/metrics` 200 (real data); player → **403**;
  ban → populated response + `audit_logs` entry; settings upsert 200.

## Follow-ups (next cycle)
- Venue Partner portal UI (screens 2/5) — schema/RBAC ready.
- Admin Sentry/PostHog instrumentation (observability slice).
- Admin email/password + 2FA login (currently phone-OTP reuse).
- systemd service + deploy wiring for `apps/admin`.
