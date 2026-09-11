# Coolify Prod Cutover — Gate 2: Architecture

**Date:** 2026-09-10 · **Cycle:** coolify-prod-cutover v1

---

## 1. Topology (target, post all slices)

```
                ┌──────────────────────────────────────────────────┐
                │                  PUBLIC INTERNET                 │
                │  friends → kora-link-player-pwa.vercel.app (PWA) │
                │  friends → kora-link-admin.vercel.app (Admin)    │
                │          ↓ NEXT_PUBLIC_API_URL                   │
                │          ↓                                        │
                │  API host (Cloudflare CNAME, Slice H)            │
                │          ↓                                        │
                │  Traefik on :443 (Coolify-managed)               │
                └──────────────────┬───────────────────────────────┘
                                   │ HTTP
                                   ▼
                ┌──────────────────────────────────────────────────┐
                │              OCI VPS (this box)                   │
                │                                                   │
                │  ┌──────────────────────────────────────────┐     │
                │  │  Tailscale tailnet (Abdullah only)        │     │
                │  │   :9450 PWA  :9451 Admin  :20128 OmniR.   │     │
                │  │   :8443 API  (Funnel closes at Slice A)   │     │
                │  └──────────────────────────────────────────┘     │
                │                                                   │
                │  ┌─ Staging (systemd, never in Coolify) ──────┐   │
                │  │  koralink-api.service  → :3001             │   │
                │  │  koralink-pwa.service  → :3000             │   │
                │  │  koralink-admin.service → :3002             │   │
                │  │  koralink-postgres (docker) → 127.0.0.1:5432│   │
                │  └─────────────────────────────────────────────┘   │
                │                                                   │
                │  ┌─ Production (Coolify, Slice E/F) ───────────┐   │
                │  │  koralink-api (env=production) → :3001      │   │
                │  │  koralink-db  (PostGIS arm64)   → 127.0.0.1 │   │
                │  │  Coolify Traefik → public :443               │   │
                │  │  CPU 1/RAM 1GB each, network: koralink-net  │   │
                │  └─────────────────────────────────────────────┘   │
                │                                                   │
                │  ┌─ Coolify orchestrator (idle) ───────────────┐   │
                │  │  coolify, coolify-db, coolify-redis,         │   │
                │  │  coolify-realtime, coolify-proxy, sentinel   │   │
                │  │  :8000 127.0.0.1 (after Slice B)            │   │
                │  └─────────────────────────────────────────────┘   │
                │                                                   │
                │  ┌─ Rollback: Render FREE ─────────────────────┐   │
                │  │  koralink-api.onrender.com (kept warm by     │   │
                │  │  koralink-keepwarm.timer every 10 min)       │   │
                │  │  Neon falling-frost (prod DB target before   │   │
                │  │  Coolify cutover)                            │   │
                │  └─────────────────────────────────────────────┘   │
                │                                                   │
                │  Memory budget post-Slice 0 (Supabase out):        │
                │   24 GB total – 13 GB staging/Coolify/etc.          │
                │   – ~0.5 GB prod api – ~0.8 GB prod db              │
                │   – 1 GB swap headroom = ~9 GB free                 │
                └───────────────────────────────────────────────────┘
```

## 2. Component changes (per file / per service)

### 2.1 Staging — NO changes to systemd quartet

The `koralink-api.service` / `koralink-pwa.service` / `koralink-admin.service` / repo-root `docker-compose.yml` for `koralink-postgres` are untouched. The factory loop, deploy script, and hot-edit rsync path all stay on this tree.

### 2.2 Tailscale funnels (Slice A)

| Today | After |
|---|---|
| `:10000` Funnel ON (public PWA) | `:10000` OFF |
| `:8443` Funnel ON (public API) | `:8443` OFF (re-enable only during Phase-1 OTP E2E then OFF) |
| `:9450` tailnet-only (PWA) | `:9450` tailnet-only (unchanged — your staging PWA) |
| `:9451` tailnet-only (Admin) | `:9451` tailnet-only (unchanged) |
| `:20128` tailnet-only (OmniRoute) | `:20128` tailnet-only (unchanged) |

**Access for you after Slice A:** Tailscale on your MacBook (already on `albertcatsby@`). Open `https://aa.tail2948f9.ts.net:9450` → staging PWA. Friends have no path.

### 2.3 Coolify (Slices B, E, F)

- **Slice B:** Coolify Traefik `:80`/`:443` must stay public (it's the public entry to prod), but Coolify UI `:8000` is currently 0.0.0.0 — rebind to 127.0.0.1. (Supabase rebinds become moot after Slice 0 removes those containers.)
- **Slice E:** Coolify project `koralink` created with env `production`. Service `koralink-api` is a `Docker Image` service pointing to a built image (build path: `apps/api/Dockerfile.coolify` — new file, ~20 lines, multi-stage Node 20, copies dist, runs `node dist/src/main.js`). Resource limits: 1 vCPU, 1 GB RAM, restart=`unless-stopped`. Network: `koralink-net` (custom). Healthcheck: `wget -qO- http://127.0.0.1:3001/api/v1/health` every 30s.
- **Slice F:** Coolify managed DB `koralink-db`, image `imresamu/postgis:16-3.5` (proven arm64, glibc 2.36 — same as staging). Bind 127.0.0.1:5433 → 5432 in container. Volume `koralink_prod_pgdata` on host's `/var/lib/coolify/db/...`. Resource limits: 1 vCPU, 1 GB RAM, restart=`unless-stopped`. Init script: run `scripts/migrate-vps.mjs` after first boot (one-shot via Coolify's "Init Containers" pattern or a systemd-side hook).
- **Slice H:** Cloudflare CNAME `api.koralink.sa` → Coolify Traefik origin (proxy initially OFF — CNAME-only, lets us swap back to Render by re-pointing the CNAME).

### 2.4 Backups (Slice D)

- Existing local chain stays: `koralink-backup.timer` 03:00 UTC, dir 0700, 30-day retention, gzip-verified.
- New: `koralink-backup-offsite.service` (user systemd) — runs after the local timer, `rclone copy` the newest dump to `r2:koralink-backups/daily/`. Token in `.deploy-tokens` named `R2_ACCESS_KEY` / `R2_SECRET_KEY` / `R2_BUCKET` (you add these when Slice D lands).
- Restore drill: a `scripts/restore-drill.sh` that downloads from R2, spins a scratch docker PG, applies, row-counts against the live DB (read-only), sends Sentry event with `tags: { kind: 'restore-drill', ok: '1' }`.

### 2.5 Render (kept warm, no API changes)

- `koralink-keepwarm.timer` (live, 10 min) keeps Render from cold-starting.
- When Slice G fires: `DEV_LOGIN_ENABLED=false`, `EMAIL_PROVIDER=brevo`, `BREVO_FROM`, `BREVO_API_KEY` (the last three are already in Render env from 2026-09-10).
- Render is rollback target: re-point Coolify → Render by re-deploying the PWA with `NEXT_PUBLIC_API_URL=https://koralink-api.onrender.com/api/v1` (and re-pointing the Cloudflare CNAME if it's already live).

### 2.6 PWA/Admin (Vercel)

- No source code changes needed for the cutover. The Vercel env var `NEXT_PUBLIC_API_URL` flips from `koralink-api.onrender.com` to `https://api.koralink.sa` (post Slice H) — a one-line T2 env edit + redeploy. (You can leave it on Render's URL indefinitely; the swap is independent of the Coolify cutover.)

## 3. Data flow (one slice, the cutover)

```
Slice G sequence (manual; you press go):
  1. Abdullah: tests prod OTP end-to-end on Coolify API URL (dev-login bar OFF on Vercel already since 2026-09-09).
  2. Abdullah: gives explicit go for "Render DEV_LOGIN=false" + "CORS allowlist update on Render" (T2).
  3. Lead agent: Render env DEL `DEV_LOGIN_ENABLED` (defaults to false) + CORS preflight re-probe.
  4. Lead agent: Cloudflare CNAME api.koralink.sa → Coolify origin (T2, you add the token in §7).
  5. Vercel: NEXT_PUBLIC_API_URL → https://api.koralink.sa (T2, one env edit + redeploy).
  6. Live: friends hit Vercel → PWA fetches Coolify API via Cloudflare CNAME.
  7. Rollback: revert step 5 to https://koralink-api.onrender.com/api/v1 (one env edit + redeploy, ≤2 min).
```

## 4. Files changed (cumulative, all slices)

| Path | Action | Slice |
|---|---|---|
| `apps/api/Dockerfile.coolify` | NEW | E |
| `docker-compose.coolify-prod.yml` (reference) | NEW | E (reference for Coolify's compose equivalent) |
| `scripts/migrate-vps.mjs` (already exists) | reused | F |
| `scripts/restore-drill.sh` | NEW | D |
| `.deploy-tokens` | names only: `R2_*`, `COOLIFY_TOKEN`, `COOLIFY_PROD_ORIGIN`, `CLOUDFLARE_API_TOKEN`, `KL_PROD_UNIFONIC_APP_SID` | D, E, H, G |
| `devops-cycle` skill §1 (registry prod rows) | UPDATE post-cutover | G |
| `docs/plans/environment-segregation/02-architecture.md` | UPDATE | G |
| Tailscale serve config | change: funnel off :10000 + :8443 | A |
| Coolify project / service / DB records | NEW | E, F |
| Docker network `koralink-net` | NEW | E, F |
| `/etc/fstab` swapfile entry | NEW | C |
| `systemd --user drop-in` for koralink-api OOM guard | NEW | C |

## 5. i18n / observability / auth

- **i18n:** no new keys.
- **Observability (mandatory per AGENTS.md §4):** Sentry `environment=production`, release from `git rev-parse HEAD`; Pino keeps `koralink-api` structured logs on host journal; PostHog `posthog-js` from Vercel PWA already wired. New: a Sentry tag `coolify_service=koralink-api` to distinguish from staging in Sentry UI.
- **Auth:** Unifonic AppSid (TBD) OR Brevo (already done in staging; Render uses Brevo). Coolify API uses the SAME Brevo key as Render — secret propagated via Coolify env-scoped vars.

## 6. Risks & mitigations (architecture-level)

| Risk | Mitigation |
|---|---|
| Coolify Traefik vs host iptables conflict | Traefik manages its own ports (:80/:443) on the `coolify` network; koralink-api never publishes host ports — only the Traefik `Host()` rule reaches it |
| Postgres volume grows unbounded | Coolify volume cap + a 30-day pg_dump retention cron on the host (separate from app backup) |
| Staging and prod on the same host → staging OOM during build | Per-container limits (Slice E/F) + 8 GB swap (Slice C) + `turbo run build --filter=api` runs serially (no parallel prod build) |
| OCI Security List mistake exposes Coolify UI again | Rebind to 127.0.0.1 (Slice B); defense-in-depth. Long-term: a `vps-networking` audit that codifies the SL. |
| Coolify auto-updates Coolify itself | Coolify `4.0.0-beta.462` — pin by image digest in the Coolify UI; auto-update OFF |

## 7. What is descoped (and why)

- **Coolify staging env:** factory loop depends on systemd; migrating would break the canonical deploy path (assessment §1, unchanged).
- **Cloudflare proxy / WAF rules:** CNAME-only this cycle; you can flip to proxied (orange-cloud) later for free TLS + DDoS.
- **Multi-region prod:** one VPS is the SPOF; adding a second is a later box + DB replication decision.
- **R2 lifecycle rules (auto-prune old backups):** start with all backups kept; prune after 2 cycles of confidence.

## 8. Gate 2 → 3

Proceed to program design. Contracts (env vars, ports, secrets) are well-defined.
