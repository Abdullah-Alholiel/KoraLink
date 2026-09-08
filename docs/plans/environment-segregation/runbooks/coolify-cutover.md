# Coolify Cutover (Phase 2) — prod API+DB move from Render/Neon to Coolify VPS

> Tier **T2** final gate = Abdullah's explicit go. All preconditions T0-verified BEFORE.
> Context: Render FREE cold-starts 30–60s (unfit for OTP); Coolify runs on THIS VPS with
> Traefik (`coolify-proxy`) already healthy. Coolify = git-based deploys + rollback + TLS.

## Preconditions (the devops-cycle §8 Phase-2 checklist, operationalized)

- [ ] Coolify API token in `.deploy-tokens` as `COOLIFY_TOKEN` (Abdullah's step, §7)
- [ ] API project created in Coolify (Dockerfile at `apps/api/Dockerfile` — CMD = `dist/src/main`,
      arm64 base image; known-good pattern from the koralink-pwa/admin demo images)
- [ ] Env-var set mirrors the prod matrix EXCEPT `DATABASE_URL` → Coolify Postgres (Neon URL
      kept for the fallback window), plus `NODE_ENV=production`
- [ ] Coolify Postgres: bind NOT 0.0.0.0 (Coolify-managed or compose `127.0.0.1`), strong
      password, NOT the seed `koralink_dev` creds
- [ ] **Backup chain live**: Coolify scheduled backup → S3-compatible offsite (Cloudflare R2
      10GB free or B2) + **one restore drill executed** (scratch container, row counts +
      checksum compared) — a backup never restored is a hope, not a backup
- [ ] **Uptime probe + alert** on the new prod URL (koralink-watchdog service or Uptime Kuma)
- [ ] Test OTP delivered from the Coolify deployment (Unifonic reachable from VPS)
- [ ] §6 cutover matrix green on the Coolify URL (public reachability, CORS, chunk-grep
      against frontends re-pointed to the new API)
- [ ] Rollback ARMED: Render `DATABASE_URL`/CORS can be re-pointed in one env-var API call
      (keep-warm cron keeps Render warm during the window)

## Cutover order (schema-first, same as prod-migrations)

1. Apply migration chain to Coolify Postgres (fresh DB: full chain + PostGIS extension).
2. Deploy API to Coolify; health matrix against the Coolify URL.
3. Restore data strategy: EITHER start empty (Phase-1-fresh prod) OR `pg_dump` Neon →
   restore → row-count verify. Empty is the default for a new prod.
4. Flip frontends: Vercel `NEXT_PUBLIC_API_URL` → Coolify URL → redeploy (bake rule) →
   chunk-grep verify.
5. Flip Render CORS OFF for frontends (or leave Render as documented fallback only).
6. Monitor one full day; then decommission decision: Render service suspended (kept for
   fallback), Neon idle.

## Rollback

Single T2 action: Vercel `NEXT_PUBLIC_API_URL` back to Render + redeploy; Render env
re-point; DNS never moved (Coolify serves on its own URL/domain) → minutes, reversible.
