# Admin Dashboard — Gate 2 Architecture

## Overview
```
┌──────────────┐   HTTP (Bearer/cookie, role JWT)   ┌─────────────────────────────┐
│  apps/admin   │ ─────────────────────────────────▶ │  apps/api  (NestJS)          │
│  Next.js 14   │    /api/v1/admin/*                │  AdminModule                │
│  Tailwind     │                                   │   ├ users/venues/pitches    │
│  TanStack     │                                   │   ├ transactions/disputes  │
│  Recharts     │                                   │   ├ settlements/audit/settings│
└──────────────┘                                   │  AdminAuthGuard (@Roles)   │
                                                   │  Drizzle → PostgreSQL       │
                                                   └─────────────────────────────┘
```

## Backend (`apps/api`)
- `common/guards/admin-auth.guard.ts` — extends JwtCookieAuthGuard; checks `req.user.role`.
- `common/decorators/roles.decorator.ts` — `@Roles('Admin')` metadata + `RolesGuard`.
- `modules/admin/` — controllers/services/DTOs for the modules above.
- Schema additions in `database/schema.ts` + drizzle migration.

## Frontend (`apps/admin`)
- Next.js App Router, `src/app/` with a sidebar shell + route-per-module.
- `lib/api.ts` admin fetch client (Bearer/cookie), `lib/types.ts` mirroring contracts.
- TanStack Table for data grids, Recharts for charts, Tailwind (shadcn-style, desktop).
- Sentry + Pino + PostHog providers (env-gated), same observability pattern as PWA.

## Data flow (tracer bullet)
`GET /admin/metrics` → AdminAuthGuard(role) → AdminService counts (users/matches/venues/
disputes/float) → JSON → admin dashboard cards → Recharts.

## Files changed (highlight)
- `apps/api/src/database/schema.ts` + `apps/api/drizzle/*` migration
- `apps/api/src/common/guards/admin-auth.guard.ts`, `roles.decorator.ts`
- `apps/api/src/modules/admin/*`
- `apps/api/src/modules/auth/auth.service.ts` (devLogin includes role)
- `apps/api/src/app.module.ts` (register AdminModule)
- `apps/admin/**` (new app)

## Risks & mitigations
- ID columns are `varchar(36)` (never `::uuid`) — use `::text`.
- `findOne` outside transactions (mutation contract).
- Admin app must NOT reuse player JWT cookie implicitly — separate login page + token
  storage; guard validates `role === 'Admin'`.
