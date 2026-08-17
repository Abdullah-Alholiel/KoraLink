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
- Admin email/password + 2FA login (currently phone-OTP reuse).
- Admin Sentry project + PostHog key wiring (code is env-gated and ready; just add keys).

## Cycle 2 — Venue Partner portal + observability + deploy (done 2026-08-17)
- **Partner backend** (`PartnerModule`): `/api/v1/partner/*` role-gated
  (`@Roles('VenueOwner','Admin')`), every query scoped by `owner_id` — a venue
  owner can only see their own venues/pitches/earnings/verification.
  Endpoints: dashboard, venues, pitches (CRUD), earnings, verification (upsert).
- **Partner frontend** (in `apps/admin`, role-scoped): `Sidebar` switches between
  HQ nav (Admin) and Partner nav (VenueOwner) from the JWT `role` claim;
  `defaultRoute()` + layout guard route each role to its portal. Pages: partner
  dashboard, my-pitches (add + availability toggle), earnings, settings (business
  profile).
- **Schema**: `venue_verifications.venue_id` → unique index (one verification per
  venue) — migration `0012_sturdy_shriek.sql`.
- **Observability**: Sentry (`sentry.*.config.ts`, `instrumentation.ts`,
  `withSentryConfig`, `global-error.tsx`, replay disabled for admin) + PostHog
  (`ObservabilityProvider`), both env-gated no-ops without keys.
- **Deploy**: `output: 'standalone'` + `scripts/sync-standalone.mjs` (postbuild
  hook) + `deploy/koralink-admin.service` (systemd user unit, :3002). Installed,
  enabled, and live (`systemctl --user status koralink-admin`).

## Verification (real terminal output, Cycle 2)
- `npm run build` → **3/3 tasks, exit 0** · API jest **11/11** · PWA vitest **175/175**
- Admin app serving on `:3002` (systemd `koralink-admin.service` active).
- Live smoke: VenueOwner login → `/partner/dashboard` (3 venues, 4 upcoming, today's
  schedule), `/partner/pitches` (5 pitches); verification upsert → `pending`;
  pitch toggle → on/off. RBAC: VenueOwner → `/admin/*` **403**; Player →
  `/partner/*` **403**.
