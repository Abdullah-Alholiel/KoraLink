# 02 — Architecture v2: Environment Segregation

## Overview

Two disjoint environment sets; the branch is the release gate. Production topology evolves
in phases (01-product v2); this cycle delivers Phase 0.

```
  git push ──► branch: staging (factory working branch)
                    │  scripts/deploy-staging.sh  (T1, autonomous)
                    ▼
   🟡 STAGING — VPS quartet (dummy data, dev-login ON)
   ┌──────────────────────────────────────────────────────────────┐
   │ PWA :3000 ◄─ funnel :9450      Admin :3002 ◄─ funnel :443    │
   │ API :3001 ◄─ funnel :8443      NODE_ENV=staging              │
   │ PG koralink-postgres → 127.0.0.1:5432/koralink_dev           │
   └──────────────────────────────────────────────────────────────┘

  promote PR (T2) ──► branch: main = RELEASE
                    │  auto-deploy (Render + Vercel webhooks)
                    ▼
   🔴 PRODUCTION — public bundle (Phase 0: demo-grade)
   ┌──────────────────────────────────────────────────────────────┐
   │ Vercel kora-link-player-pwa ─┐                               │
   │ Vercel kora-link-admin ──────┼──► Render API (FREE)          │
   │                              └──► Neon PG falling-frost-…    │
   │ Phase 1: + Unifonic OTP, dev-login off                       │
   │ Phase 2: API+DB → Coolify (this VPS), Render/Neon = fallback │
   └──────────────────────────────────────────────────────────────┘
```

**Leak-proofing:** staging API CORS drops the Vercel origins; prod API CORS lists ONLY
Vercel origins. A prod frontend physically cannot call the staging API and vice versa.

## Component changes

| # | Component | Change | Why |
|---|---|---|---|
| 1 | `scripts/deploy-staging.sh` (NEW) | FIXED order: preflight (branch=staging; dirty tree allowed+logged) → fetch/checkout → `npm install` → `env -u NODE_ENV npx turbo run build --filter=api --filter=player-pwa --filter=admin --force` → `scripts/migrate-vps.mjs` → rsync `public/` into both standalone dirs (hot-edit trap) → restart API→PWA→Admin → inline health matrix | one-command, ordered, idempotent staging deploys; kills stale-dist (P0-10) + skipped-migration (P2-51) classes |
| 2 | `scripts/migrate-vps.mjs` (NEW) | drizzle-kit is unavailable on this VPS → reads `drizzle/*.sql` filename-ordered, diffs against `__drizzle_migrations`, applies pending (statement-breakpoint split), reconciles journal rows; loads `DATABASE_URL` from `apps/api/.env` itself | migrations run inside the deploy loop, DB before restarts |
| 3 | `docker-compose.yml` (repo) | postgres ports `"5432:5432"` → `"127.0.0.1:5432:5432"` + `docker compose up -d postgres` | F6: loopback bind, defense-in-depth (OCI netfilter remains outer gate) |
| 4 | VPS `apps/api/.env` | `NODE_ENV=staging`; `PLAYER_URL`/`ADMIN_URL` drop the two Vercel origins (localhost + TS IP + funnel origins remain) | Sentry API env tag; S3 CORS segregation |
| 5 | Render env-vars (T2, via API) | `NODE_ENV=production`; `PLAYER_URL=https://kora-link-player-pwa.vercel.app`; `ADMIN_URL=https://kora-link-admin.vercel.app`; `UNIFONIC_SENDER_ID=KoraLink` | prod CORS-only-Vercel; OTP-ready |
| 6 | `sentry.client.config.ts` ×2 (PWA+admin) | `environment: process.env.NEXT_PUBLIC_SENTRY_ENV ?? 'production'` | S5; Vercel bakes `production`, VPS `.env.local` sets `staging` |
| 7 | Vercel project envs (T2, CLI or dashboard) | `NEXT_PUBLIC_API_URL=https://koralink-api.onrender.com/api/v1`, `NEXT_PUBLIC_DISABLE_DEV_LOGIN_BAR=true`, `NEXT_PUBLIC_SENTRY_ENV=production` (both projects) + `NEXT_PUBLIC_APP_URL` (PWA) | S8; verified by chunk-grep post-redeploy (bake rule) |
| 8 | `kanban/STATE.json` + BOARD row | factory default branch → `staging` | F5: cron must never release to prod |
| 9 | `docs/plans/environment-segregation/runbooks/*.md` (NEW) | promote-flow, prod-migrations, otp-go-live (Phase 1), coolify-cutover (Phase 2), neon-reset | S7; phases documented, not executed |

## Data flow: staging auth (unchanged, regression-gated)

`DevLoginBar (VPS build) → POST :8443/api/v1/auth/dev-login {phone:+9665000000xx} →
DEV_LOGIN_ENABLED=true → JWT cookie+Bearer → VPS PG seeded users`.

## Data flow: production auth (Phase 1 target)

`Login → POST /auth/request-otp → UnifonicService.sendSms (AppSid set → real SMS) →
POST /auth/verify-otp → JWT (cross-origin → Bearer dual-extraction path) → Neon users`.
Until Phase 1: SMS logged to Render logs; dev-login interim-true (F3, accepted).

## Files changed

| File | Type | Tier |
|---|---|---|
| `scripts/deploy-staging.sh`, `scripts/migrate-vps.mjs` | new | T1 |
| `docker-compose.yml` | edit (bind) | T1 |
| `apps/api/.env` (VPS-only, uncommitted) | edit | T1 |
| `apps/player-pwa/.env.local` + admin equivalent (VPS) | edit (SENTRY_ENV) | T1 |
| `sentry.client.config.ts` ×2 | 1-line each | T1 (code) |
| Render env-vars | remote edit | **T2** |
| Vercel project envs + redeploy | remote edit | **T2** |
| promote PR merge | git | **T2** |
| `docs/plans/environment-segregation/**`, `kanban/*` | docs/bookkeeping | T1 |

No API module code, no schema, no DTO, no i18n changes — zero contract surface. Foreign WIP
(factory run #44 on `auth.module.ts`) is logged by the deploy script and never touched.

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| `NODE_ENV=staging` breaks an unguarded prod-coupled branch | grep audit BEFORE flip (`NODE_ENV` consumers: Sentry init, next-pwa disable flag — both safe); full build + health matrix after; revert = one env line + restart |
| Postgres re-bind breaks local API | compose edit keeps port number; API uses 127.0.0.1 already; probe health immediately after `up -d` |
| deploy script runs during sibling agent's edit window | script never stashes/discards; logs dirty files; git-level operations only; restarts are the only mutation of service state |
| docs-only `main` pushes waste prod builds | all cycle work on `staging`; `main` receives only the promote PR |
| Vercel env change with no redeploy = stale bundle (bake rule) | slice 3 verifies by chunk-grep AFTER redeploy, not by env listing |
| Render env change breaks demo mid-flight | T2 gate shows exact key→value diff first; revert = previous values recorded in ops-log |
| drizzle applier mis-handles a 0018-style enum ADD VALUE | applier reuses the proven hand-apply procedure (filename order, statement split, journal reconcile) — the same steps run #43 executed manually |

## Descoped

Phase 1/2 execution, paid tiers, custom domains, preview envs, Neon branching, Redis for
staging, Cloudflare DNS (needs `CLOUDFLARE_API_TOKEN`, §7 handoff).
