# Environment Segregation — Cycle Status (v2, under devops-cycle)

| Gate | Name | Status | Approved | Artifact |
|------|------|--------|----------|----------|
| 0 | Retrospective | ✅ DONE (v2 corrections recorded) | auto | [00-retro.md](./00-retro.md) |
| 1 | Product Spec | ✅ DONE (v2: phased production) | auto (user mandate) | [01-product.md](./01-product.md) |
| 2 | Architecture | ✅ DONE (v2: real deploy mechanics) | auto (user mandate) | [02-architecture.md](./02-architecture.md) · [env-matrices.md](./env-matrices.md) |
| 3 | Program Design | ⏸️ see [03-program-design.md](./03-program-design.md) | auto (user mandate) | contracts + checklists |
| 4 | Vertical Slices | 🔄 IN PROGRESS | — | ops-log.md |

Autonomy: slices 1–3 run T1 (staging-auto) per `devops-cycle` §2; Render/Vercel env changes
and the promote merge are T2 and pause for Abdullah. Abdullah's directive 2026-09-08:
"re do this cycle … make the best harnessing skill … for best output and stability" =
autonomous mode for Phase 0.

## Slices

| # | Slice | Tier | Status |
|---|---|---|---|
| 1 | staging branch + `scripts/deploy-staging.sh` + `scripts/migrate-vps.mjs` + first green deploy | T1 | ✅ DONE (exit 0, all 6 probes; journal reconciled) |
| 2 | postgres loopback bind (+ arm64 image fix); staging CORS cutover; `NODE_ENV=staging` + regression | T1 | ✅ DONE (C1/C2 green, dev-login 200, data intact) |
| 3 | Sentry env split (code + VPS env) — VPS bundles bake `environment:"staging"` | T1 | ✅ DONE (chunk-grep verified both apps) |
| 3b | Vercel prod envs + redeploy + chunk-grep verify; Render env-vars | **T2** | ⏸️ AWAITING ABDULLAH (see final report) |
| 4 | runbooks ×5 (promote/prod-migrations/otp-go-live/neon-reset/coolify-cutover) + factory retarget | T1 | ✅ DONE |

## Decisions log

- 2026-09-08 (v1): staging = VPS quartet ONLY; no new Vercel staging projects.
- 2026-09-08 (v2): production is PHASED (Phase 0 segregation → Phase 1 OTP → Phase 2
  Coolify cutover) — Render FREE cold-start disqualifies it as the OTP-grade endpoint.
- 2026-09-08 (v2): Neon reset deferred to Phase 1; Render `DEV_LOGIN_ENABLED` stays true
  until then (F3 accepted, documented).
- 2026-09-08 (v2): `staging` branch created at `c5038e1`+docs; factory retargets to it.
