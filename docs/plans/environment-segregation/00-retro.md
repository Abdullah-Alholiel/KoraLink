# 00 — Retrospective v2: Environment Segregation (2026-09-08, redone under devops-cycle)

Baseline: `c5038e1`. Cycle redone under the new `devops-cycle` skill after Abdullah's
instruction: "review and assess implementation … re do this cycle." Two prior
conversations (attached) set a new direction: Coolify-as-future-prod, Cloudflare DNS,
six-capability harness. All claims below were verified against the live box.

## Corrections to v1 (what the first pass got wrong or soft-pedaled)

| v1 said | Reality (verified) |
|---|---|
| "12 local commits are deployed nowhere" | STALE — push auth was fixed the same day; `main == origin/main` at `c5038e1` |
| Branch model implied creating `staging` and continuing on `main` for docs | Fixed: `staging` branch created FIRST; all cycle work lands there (commit f63edd3 was a one-off docs push that triggered harmless prod rebuilds) |
| VPS Postgres exposure = "firewall-only" footnote | Downgraded risk. Actual exposure: OCI netfilter REJECTs non-SSH inbound (rules.v4, active) + OCI Security List. Fix to loopback bind is still correct (defense-in-depth), but this is not an open internet DB |
| "Render is a fine prod bundle for now" | attachment-verified concern stands: Render FREE cold-starts 30–60s if the keep-warm ping lapses → OTP (real users waiting for SMS) cannot rely on it. Prod API must move to Coolify (Phase 2) before real users |
| (missing) | **Coolify is installed and healthy on this very VPS** — `coolify`, `coolify-proxy` (Traefik), `coolify-db`, `coolify-redis`, `coolify-realtime`, `coolify-sentinel`, all up, `coolify-proxy` on :80/:443. The future prod platform already runs here |
| (missing) | drizzle-kit is UNAVAILABLE on the VPS — migrations must use the hand-rolled applier (established procedure: filename order + `__drizzle_migrations` journal) |
| (missing) | VPS services run directly from the repo tree (systemd units point at `apps/api/dist`, `.next/standalone/...`) — no release dir, no atomic symlink swap; staging rollback = checkout + rebuild + restart |
| (missing) | Foreign WIP is normal on this shared tree (factory run #44 editing `auth.module.ts` mid-cycle, documented). Deploy tooling must refuse to clobber it, never silently stash/discard |

## Findings

| ID | Finding | Class | Disposition |
|---|---|---|---|
| F1 | Single deploy lane: every `main` push instantly deploys Render + Vercel ×2 with no migration step (P2-51) and no staging gate | CRITICAL | This cycle: branch split + deploy script + promote runbook |
| F2 | `UNIFONIC_APP_SID` empty in EVERY environment (VPS `.env`, Render env-vars, `.deploy-tokens`). Graceful fallback verified in code: SMS logged, not sent | CRITICAL (prod-prep) | Phase 1 (needs Abdullah's AppSid — §7 handoff protocol) |
| F3 | Render (public) runs `DEV_LOGIN_ENABLED=true`; accepted interim risk until OTP wiring | CRITICAL (prod-prep) | Flip `false` at Phase 1; documented in devops-cycle §1 |
| F4 | Sentry: env tag = `NODE_ENV` on API only; PWA/admin untagged | IMPORTANT | Slice 3: `NEXT_PUBLIC_SENTRY_ENV` in both frontends |
| F5 | Factory cron/agents commit to `main` — under the new model that releases to prod | IMPORTANT | `staging` created + pushed; STATE/BOARD retarget noted in slice 4 runbook |
| F6 | `koralink-postgres` publishes `0.0.0.0:5432` (docker), protected only by OCI netfilter + Security List | IMPORTANT | Slice 2: bind `127.0.0.1:5432` (defense-in-depth) |
| F7 | Render FREE cold-start (30–60s) makes it unfit as the OTP-grade prod API | CRITICAL (Phase 2 driver) | Phase 2 cutover to Coolify, gated by devops-cycle §8 preconditions |

## Verified-good (no action)

- CORS fully env-driven (`PLAYER_URL`/`ADMIN_URL`) — segregation = env config, zero API code.
- PWA CSP `connect-src` auto-derives API origin from `NEXT_PUBLIC_API_URL` (`next.config.mjs:141–156`).
- DevLoginBar build-time gate (`NEXT_PUBLIC_DISABLE_DEV_LOGIN_BAR=true` tree-shakes the bar; Strix P0-7).
- Vercel prod deploys both READY; Render deploy pipeline healthy; keep-warm cron exists.
- Coolify + Traefik already serving this box; UnifonicService degrades safely when AppSid empty.

## Recommendation

Proceed. Implementation slices 1–3 are T1 (staging-auto) under `devops-cycle` §2; all prod
surfaces stay T2 (user-gated). Phase 1 (OTP) + Phase 2 (Coolify cutover) are explicitly NOT
part of this cycle's autonomous scope.
