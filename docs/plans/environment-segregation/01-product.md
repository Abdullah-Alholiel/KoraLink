# 01 — Product Spec: Environment Segregation

## Problem statement

KoraLink has one deploy lane. Every push to `main` simultaneously and instantly deploys the
Render API, the Vercel PWA and the Vercel admin — with no migration step and no pre-production
verification. The VPS runs the same branch. Abdullah cannot prepare a real production
environment (clean DB, OTP live, dev-login hard-off) without breaking the day-to-day dev
workflow, and cannot verify a release on real infrastructure before it is public.

## Target environment map (the contract this cycle delivers)

| Layer | 🟡 STAGING (test bed) | 🔴 PRODUCTION (real users) |
|---|---|---|
| Branch | `staging` | `main` |
| Player PWA | VPS `https://aa.tail2948f9.ts.net:9450` | Vercel `kora-link-player-pwa` (exists, READY) |
| Admin console | VPS `https://aa.tail2948f9.ts.net` (:443→3002) | Vercel `kora-link-admin` (exists, READY) |
| API | VPS `https://aa.tail2948f9.ts.net:8443` (funnel → :3001) | Render FREE `koralink-api.onrender.com` (exists, LIVE) |
| Database | VPS Postgres docker (`koralink_dev`, keeps dummy data) | **Neon** `falling-frost-44866281` (reset to clean schema) |
| Auth | **dev-login ON** (`DEV_LOGIN_ENABLED=true`) + dummy seed phones — both VPS apps | **OTP via Unifonic** (AppSid — Abdullah's step); dev-login OFF at wiring time |
| Migrations | runbook: deploy script order (DB before API restart) | documented manual runbook (Render pre-deploy is PAID-only — verified) |

## User stories

- **S1 (P0) Branch split**: A `staging` branch exists; VPS stack deploys from it; `main`
  deploys only the production bundle (Render + Vercel prod). Nothing merges to `main`
  without first running on staging.
- **S2 (P0) Env separation**: Every app resolves its full env set per environment
  (API URL, CORS origins, CSP origin, DB, dev-login, Sentry env tag). No cross-env leakage:
  staging frontends never call the Render API; prod frontends never call the VPS API.
- **S3 (P0) VPS keeps dummy-data login**: dev-login bar + seeded phones `+966500000001–005`
  keep working on both VPS apps after the switch (regression-checked).
- **S4 (P1) Production prep**: Neon reset to clean migrated schema (no dummy data); Render
  `DEV_LOGIN_ENABLED` flip documented; Unifonic AppSid wiring documented (Abdullah provides
  the SID; agent applies via Render env-vars API + verify).
- **S5 (P1) Promote flow**: staging → main via PR (CI runs on PR); merge = production release.
  Factory cron/agents retarget `staging` as their working branch.
- **S6 (P1) Observability separation**: Sentry errors tag `staging` vs `production` in all
  three apps.

## Out of scope

Paid tiers (Render pre-deploy, Vercel Pro), custom domains, Render/Vercel preview-env
matrices, Redis for staging beyond current config, Neon branching/poolers, load balancing.

## Success criteria (all verifiable)

1. Push to `staging` → VPS services rebuild + restart on the new commit; health matrix green.
2. Push to `main` → Vercel prod ×2 + Render deploy; **VPS untouched**.
3. VPS PWA + admin: dev-login bar visible, dev-login 200, seeded data flows end-to-end.
4. Staging frontends (VPS): dev-login bar visible, OTP flow works with the code readable from
   `journalctl` (Unifonic log fallback), API calls hit the VPS API only.
4b. PROD frontends (Vercel): dev-login bar absent (build-time flag), API URL = Render only —
   verified by grepping the deployed JS chunk for the API origin.
5. Vercel prod PWA/admin: API URL = `koralink-api.onrender.com`, dev-login absent, prod DB = Neon.
6. `NODE_ENV=staging` on the VPS API: verified no prod-coupled code branches break (grep audit).
7. Sentry: one staging event + one production event visibly tagged per env.

## Open questions for Gate 2

- Q1 Flip VPS API `NODE_ENV` to `staging`? (Proposed: yes — gives free Sentry env tagging;
  grep-audit `NODE_ENV` usages first. `next build` forces its own NODE_ENV, unaffected.)
- Q2 Deploy trigger for VPS: manual `scripts/deploy-staging.sh` only, or + a poll cron?
  (Proposed: script now; poll cron optional follow-up.)
- Q3 Reset Neon now (demo loses its data) — acceptable? (Proposed: yes; Render demo will show
  an empty-but-working app until real data exists. Dummy data stays on VPS only, per spec.)
- Q4 Flip Render `DEV_LOGIN_ENABLED=false` now or at OTP wiring? (Proposed: at OTP wiring, so
  the public demo stays usable until real auth exists. Flagged as a conscious interim risk.)
