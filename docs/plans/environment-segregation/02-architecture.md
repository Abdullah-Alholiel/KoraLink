# 02 — Architecture: Environment Segregation

## Overview

Two fully disjoint environment sets. The **branch is the release gate**: `staging` → VPS
quartet; `main` → public bundle. No shared deploy triggers.

```
                    ┌───────────────────────────────┐
   git push         │  branch: staging              │
  ─────────────────►│  (all day-to-day work lands   │
                    │   here via factory cron/agents)│
                    └──────────────┬────────────────┘
                                   │ scripts/deploy-staging.sh
                                   ▼
   🟡 STAGING (test bed, dummy data, dev-login ON)
   ┌──────────────────────── VPS (100.93.99.24) ────────────────────────┐
   │ PWA   :9450 ◄─ funnel ─ aa.tail2948f9.ts.net:9450                  │
   │ Admin :3002 ◄─ funnel ─ aa.tail2948f9.ts.net:443                   │
   │ API   :3001 ◄─ funnel ─ aa.tail2948f9.ts.net:8443  NODE_ENV=staging│
   │ PG    :5432  koralink/koralink_dev (docker, seeded dummy data)     │
   └────────────────────────────────────────────────────────────────────┘

                    ┌───────────────────────────────┐
   git push         │  branch: main = RELEASE       │
  ─────────────────►│  (merge staging→main via PR)  │
                    └──────────────┬────────────────┘
                                   │ auto-deploy (Render + Vercel webhooks)
                                   ▼
   🔴 PRODUCTION (real users, OTP, dev-login OFF)
   ┌──────────────────── Public bundle ─────────────────────────────────┐
   │ Vercel  kora-link-player-pwa.vercel.app  ─┐                        │
   │ Vercel  kora-link-admin.vercel.app        ─┤→ Render API (FREE)    │
   │                                           ─┤  koralink-api.        │
   │                                            │  onrender.com         │
   │                                            └→ Neon Postgres        │
   │                                               falling-frost-44866281│
   └────────────────────────────────────────────────────────────────────┘
```

**Leak-proofing rule:** the staging API's CORS lists (`PLAYER_URL`/`ADMIN_URL`) DROP the two
Vercel prod origins; the prod API's lists contain ONLY the two Vercel prod origins. A prod
frontend physically cannot call the staging API (CORS rejection) and vice versa.

## Component changes

| # | Component | Change | Why |
|---|---|---|---|
| 1 | `scripts/deploy-staging.sh` (NEW) | fetch `staging` → `npm run build` via `turbo` (with `env -u NODE_ENV` guard) → migrate VPS PG in filename order → rsync `public/` into both standalone dirs (hot-edit trap) → restart `koralink-{api,pwa,admin}.service` → health matrix probe | one-command, ordered staging deploy; kills the stale-dist + skipped-migration classes (P0-10) |
| 2 | VPS `apps/api/.env` | `NODE_ENV=development→staging`; drop Vercel origins from `PLAYER_URL`/`ADMIN_URL` | Sentry env tag = `NODE_ENV` (free separation); CORS leak-proofing |
| 3 | Render env-vars (via API) | `NODE_ENV=production`; `PLAYER_URL`/`ADMIN_URL` = ONLY the Vercel origins; `UNIFONIC_SENDER_ID=KoraLink` (present in tokens, missing on Render) | prod identity; OTP-ready |
| 4 | Vercel project envs (dashboard — Abdullah's console step, agent provides exact list) | `NEXT_PUBLIC_API_URL=https://koralink-api.onrender.com/api/v1`, `NEXT_PUBLIC_APP_URL=<own prod URL>`, `NEXT_PUBLIC_DISABLE_DEV_LOGIN_BAR=true` on the PWA project; same API URL on admin | prod bundle points at prod API; dev-login tree-shaken (Strix P0-7 gate) |
| 5 | PWA/admin Sentry init (2-line change) | `environment: process.env.NEXT_PUBLIC_SENTRY_ENV ?? 'production'` in client config; Vercel env carries `NEXT_PUBLIC_SENTRY_ENV=production`; VPS builds get `staging` via `.env.local` | S: `staging` vs `production` visible per event in all 3 apps |
| 6 | `docs/plans/environment-segregation/env-matrices.md` (NEW) | full per-env variable matrices (source of truth) | prevents the "which env var where" drift class |
| 7 | `docs/plans/environment-segregation/runbooks/*.md` (NEW) | promote-flow (staging→main PR), Neon reset + migration application, Unifonic AppSid wiring + Render dev-login flip | paid-tier constraints documented; Render pre-deploy is PAID-only (verified) so migrations are a runbook, not a hook |
| 8 | Branch setup | create `staging` at current `origin/main`; VPS clone tracks it; main becomes promote-only | S1, S5 |
| 9 | `kanban/STATE.json` + BOARD note | factory default branch → `staging` | F5: cron must never release to prod |

## Data flow: staging auth (dummy)

`DevLoginBar (VPS build, flag unset) → POST :8443/api/v1/auth/dev-login {phone:+9665000000xx}
→ DEV_LOGIN_ENABLED=true → JWT cookie + Bearer → VPS PG seeded users` — unchanged behavior,
regression-gated by success criterion 3.

## Data flow: production auth (real)

`Login form → POST /auth/request-otp → UnifonicService.sendSms (APP_SID set → real SMS)
→ user enters code → POST /auth/verify-otp → JWT cookie (same-origin Vercel↔Render? No —
cross-origin → existing Bearer dual-extraction path) → Neon users table`.
Interim (before APP_SID): SMS logged to Render logs; dev-login still enabled (flagged risk F3,
flips off at OTP wiring per 01-product Q4).

## Files changed (full list)

| File | Type |
|---|---|
| `scripts/deploy-staging.sh` | new (executable) |
| `apps/api/.env` (VPS only, not committed) | edit |
| Render env-vars (remote, via API) | edit |
| Vercel project envs (dashboard) | edit (user) |
| `apps/player-pwa/sentry.client.config.ts` (+ admin equivalent) | 1-line each |
| `apps/player-pwa/.env.local` (VPS): add `NEXT_PUBLIC_SENTRY_ENV=staging` | edit |
| `docs/plans/environment-segregation/**` (this dir) | new |
| `kanban/STATE.json`, `kanban/BOARD.md` row | edit (factory bookkeeping) |

No API module code, no schema, no DTO, no i18n changes — zero contract surface.

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| VPS `NODE_ENV=staging` breaks a prod-coupled branch (unaudited) | grep audit + full build + health matrix before declaring the flip done (success criterion 6); revert = one env line + restart |
| Docs-only push to `main` triggers wasteful Render/Vercel builds during transition | all cycle work lands on `staging`; `main` only receives the promote PR |
| Factory cron pushes `main` mid-cycle (F5) | STATE.json/BOARD retarget lands in the same slice as branch creation |
| Neon reset nukes demo data while dev-login still on (empty app confusion) | accepted in 01-product Q3 — demo shows empty-but-working app; VPS keeps dummy data |
| Vercel env edits sit behind Abdullah's dashboard | exact copy-paste var list provided; agent verifies baked output post-deploy by grepping live JS chunks (P0-7 audit pattern) |
| Render free spin-down makes staging↔prod contract tests flaky | keep-warm cron 527c30dea3a7 already exists; document cold-start ~50s in runbook |

## Descoped

Paid tiers, custom domains, preview environments, Neon branching, Redis for staging, CI
changes beyond what exists (`ci.yml` already builds+type-checks on PRs — promote PRs get it free).
