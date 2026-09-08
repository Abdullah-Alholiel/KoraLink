# 00 — Retrospective: Environment Segregation (2026-09-08)

Baseline: `c5038e1` (docs(kanban): push-auth blocker resolved — 12 commits pushed).

## What changed since the last audit

| Item | Status |
|---|---|
| Push auth (was P0 blocker) | ✅ RESOLVED — write-scoped PAT standardized, 12 commits pushed, `main == origin/main` |
| Vercel deploys (were 100% failing) | ✅ FIXED — `kora-link-player-pwa` READY @ `3ea4a30`, `kora-link-admin` READY @ `593177b` (verified via CLI-token API) |
| Render demo API | LIVE @ `3ea4a30`, auto-deploys `origin/main`, health 200 (verified) |
| Demo DB | **Neon** (`ep-snowy-river-arbt59ht…neon.tech`, project `falling-frost-44866281`) — Render hosts NO Postgres (verified `GET /v1/postgres` → empty) |

## Findings (this cycle's drivers)

| ID | Finding | Class | Cascade if unaddressed |
|---|---|---|---|
| F1 | Single deploy lane: every push to `main` auto-deploys Render (API) AND Vercel (PWA+admin) instantly, with **no migration step** (P2-51) and no staging verification. VPS builds from the same branch. | CRITICAL | A schema-breaking push 500s public demo + Vercel prod simultaneously; no release gate exists. |
| F2 | `UNIFONIC_APP_SID` is **empty in every environment** (VPS `.env`, Render env-vars, `.deploy-tokens`). Graceful fallback verified: `unifonic.service.ts` logs the SMS instead of sending. | CRITICAL (prod-prep) | Real OTP auth has never been exercised end-to-end anywhere; production cannot onboard real users. |
| F3 | Render (future PROD API) runs `DEV_LOGIN_ENABLED=true`; Neon likely contains seeded dummy phones. | CRITICAL (prod-prep) | Production bundle would ship with a CVSS-9.1-class dev-login path and dummy accounts. |
| F4 | Sentry environment = `NODE_ENV` (API only); PWA/admin never set `environment`. | IMPORTANT | Staging and production errors indistinguishable in Sentry. |
| F5 | Factory cron + agents commit directly to `main`. Under the new model `main` = production release trigger. | IMPORTANT | Any cron run would silently release to production. Cron/kanban runbook must switch default branch to `staging`. |
| F6 | VPS Postgres publishes `0.0.0.0:5432` (firewall-only protection). | MINOR (re-raise) | Defense-in-depth gap on the staging DB host. |

## Verified-good (no action)

- CORS is fully env-driven (`PLAYER_URL`/`ADMIN_URL` comma lists → `enableCors` callback) — segregation needs zero CORS code.
- PWA CSP `connect-src` auto-derives the API origin from `NEXT_PUBLIC_API_URL` (`next.config.mjs:141-156`) — new frontends need no CSP edits.
- DevLoginBar is build-time gated (`NEXT_PUBLIC_DISABLE_DEV_LOGIN_BAR=true` tree-shakes it; Strix P0-7 fix) — public staging URLs can hide it while VPS keeps it.
- VPS funnel topology already matches the staging layout (PWA :9450, API :8443 funnel → 3001, Admin 443 → 3002).

## Admin state check

`kanban/BOARD.md` has in-flight uncommitted edits (factory cron territory) — this cycle will **not** touch `apps/admin` code; no overlap. Commit discipline: stage only `docs/plans/environment-segregation/**`.

## Recommendation

Proceed to Gate 1. No code contract breaks found; the entire cycle is env/infra + two tiny Sentry init changes + a deploy script.
