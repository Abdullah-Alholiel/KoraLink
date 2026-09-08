# 01 — Product Spec v2: Environment Segregation

## Problem statement

KoraLink has one deploy lane: every push to `main` instantly deploys the Render API and both
Vercel frontends — no migrations, no staging verification, no release gate. Production
readiness (real OTP auth, clean DB, hardened surfaces) cannot be prepared without breaking
the dev workflow. Additionally, the intended future prod API platform (Render FREE)
cold-starts 30–60s — unfit for real users waiting on SMS codes.

## Product decision (v2): phased production

Production readiness is delivered in gated PHASES (per `devops-cycle` §8), each with
verifiable preconditions — no big-bang cutover:

- **Phase 0 (this cycle)**: segregation itself — staging quartet vs public bundle, branch
  gate, deploy tooling, observability split. Public bundle = Vercel ×2 + Render + Neon
  (demo-grade, dev-login interim ON).
- **Phase 1 — OTP go-live**: Unifonic AppSid wired on Render → test OTP → flip
  `DEV_LOGIN_ENABLED=false` → Neon reset to clean schema. Prod becomes real-user ready.
- **Phase 2 — Coolify cutover**: prod API+DB move to Coolify on this VPS (always-on, no
  cold-start), Render+Neon become documented fallback. Gated by backup-restore drill +
  bind + monitoring preconditions.

## Environment map (the contract)

| Layer | 🟡 STAGING (test bed) | 🔴 PRODUCTION |
|---|---|---|
| Branch | `staging` (all daily work) | `main` (release-only, via PR) |
| Player PWA | VPS `https://aa.tail2948f9.ts.net:9450` | Vercel `kora-link-player-pwa.vercel.app` |
| Admin | VPS `https://aa.tail2948f9.ts.net:9451` (:9451→3002, tailnet-only) | Vercel `kora-link-admin.vercel.app` |
| API | VPS funnel `:8443` → :3001 | Render `koralink-api.onrender.com` (→ Coolify in Phase 2) |
| DB | VPS PG docker `koralink_dev` (loopback bind after Slice 2) | Neon `falling-frost-44866281` (→ Coolify PG in Phase 2) |
| Auth | dev-login ON forever + seeded phones `+966500000001–005`, both apps | OTP via Unifonic (Phase 1); dev-login OFF |
| Migrations | in `scripts/deploy-staging.sh` (before restarts) | runbook (Render pre-deploy is paid-only) |

## User stories

- **S1 (P0) Branch gate**: `staging` is the factory working branch; `main` is reached only
  via promote PR; VPS deploys only ever run from `staging`.
- **S2 (P0) One-command staging deploy**: `scripts/deploy-staging.sh` = preflight → build →
  migrate → deploy assets → restart → verify (health matrix), idempotent, safe on the
  shared dirty tree.
- **S3 (P0) CORS segregation**: staging API allows only staging origins; prod API allows
  only Vercel origins. Cross-env API calls impossible.
- **S4 (P0) VPS dummy-data login intact**: dev-login bar + seeded phones keep working on
  both VPS apps after every change (regression-gated each deploy).
- **S5 (P1) Observability split**: Sentry events visibly tagged `staging` (VPS) vs
  `production` (Vercel/Render) in all three apps.
- **S6 (P1) Hardened staging DB**: postgres reachable only via loopback.
- **S7 (P1) Prod-prep runbooks**: promote flow, prod migrations, OTP wiring, Neon reset,
  Coolify Phase-2 preconditions — written, not yet executed.
- **S8 (P2) Vercel prod env hardening**: `NEXT_PUBLIC_DISABLE_DEV_LOGIN_BAR=true` +
  prod API URL + Sentry env baked into both prod frontends (T2, user-gated, verified by
  chunk-grep after redeploy).

## Out of scope (this cycle)

Phase 1 and Phase 2 EXECUTION (OTP wiring, Neon reset, Coolify cutover, Cloudflare DNS),
paid tiers, custom domains, new Vercel staging projects (explicitly rejected — VPS is
staging), Redis changes.

## Success criteria (verifiable)

1. `bash scripts/deploy-staging.sh` runs green end-to-end on the VPS; re-run is idempotent.
2. Health matrix green afterward: API health (+/health alias), PWA 200/307, Admin 200/307,
   dev-login 200 + token, seeded data flows.
3. Staging API CORS: staging origins allowed; Vercel origins NOT echoed (OPTIONS probe).
4. Render CORS: Vercel origins only (OPTIONS probe) — T2.
5. `koralink-postgres` no longer reachable on a non-loopback bind from the host.
6. VPS API reports `NODE_ENV=staging`; no code path regresses (grep audit + build + matrix).
7. Sentry: `environment` set in all three apps; Vercel builds tagged `production`, VPS `staging`.
8. Promote PR staging→main exists/merged per runbook; post-promote chunk-grep verifies the
   baked API URL + absent dev-login markers in prod bundles.

## Resolved decisions (v1 open questions → answers)

- Q1 VPS `NODE_ENV=staging`: **YES** (grep-audited before flip; Sentry API tag rides on it).
- Q2 VPS deploy trigger: **manual script now**; poll-cron is a follow-up once stable.
- Q3 Neon reset: **DEFERRED to Phase 1** (demo keeps its data until OTP go-live).
- Q4 Render `DEV_LOGIN_ENABLED`: **stays true until Phase 1** (documented interim risk F3).
