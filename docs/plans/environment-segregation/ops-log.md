# Ops Log — environment-segregation (devops-cycle §9 ledger)

| Date | Tier | Action | Surfaces | Verification | Undo path |
|---|---|---|---|---|---|
| 2026-09-08 | T1 | `staging` branch created at docs baseline, pushed | git | branch exists on origin | delete branch (nothing depends yet) |
| 2026-09-08 | T1 | Journal reconciliation: backfilled 4 missing journal rows (0014/0030/0031/0034 — applied-but-unjournaled objects verified present in DB first) | VPS PG `drizzle.__drizzle_migrations` | migrate-vps reports 0 pending, idempotent ×2 | rows deletable (objects predate this cycle) |
| 2026-09-08 | T1 | `scripts/deploy-staging.sh` + `scripts/migrate-vps.mjs` shipped; first full staging deploy | repo, VPS services | build 3/3, matrix H1/H2/H3/H5 ok, H4 failed (pre-existing funnel 000) | git revert + redeploy |
| 2026-09-08 | T1 | tailscale serve: admin moved `:443`(dead, shadowed by Coolify Traefik self-signed) → `:9451` tailnet-only; dead 443 handler removed | tailscale serve | `:9451` → 307; API `:8443` + PWA `:9450` unaffected (re-probed) | `tailscale serve --https=9451 off` |
| 2026-09-08 | T1 | Deploy script H4 re-targeted to `https://aa.tail2948f9.ts.net:9451/` (now release-blocking) | scripts/deploy-staging.sh | full matrix re-run pending (next deploy) | n/a |
