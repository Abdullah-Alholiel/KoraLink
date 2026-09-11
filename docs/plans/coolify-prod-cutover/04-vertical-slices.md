# Coolify Prod Cutover — Gate 4: Vertical Slices

**Date:** 2026-09-10 · **Cycle:** coolify-prod-cutover v1 · **Pre-gate verified:** `turbo run build` 3/3 success (Gate 3 → 4)

Each slice ends with: `turbo run build` zero errors + §6 health matrix + an ops-log row. The cycle is gated by a single user approval here; after that, slices execute in order, T1 by default, T2 on the marked gates.

---

## Slice 0 — Delete Supabase stack

**Tier:** T1 · **Risk:** LOW · **Reversibility:** HIGH (env + compose file kept)
**Goal:** reclaim ~2.4 GB RAM + ~5 % CPU + ~7.5 GB disk; prove zero app breakage.

**Steps:**
1. `grep -rE 'supabase|SUPABASE_' /home/ubuntu/projects/koralink --include='*.ts' --include='*.tsx' --include='*.json' --include='*.yml' | grep -v node_modules | grep -v .next/` → must be empty (already verified; this is a guard step before deletion)
2. `cd /home/ubuntu/supabase-project && docker compose down` (stops containers; preserves images, volumes, .env, docker-compose.yml)
3. `cd /home/ubuntu/projects/koralink && env -u NODE_ENV npx turbo run build` → must still pass (no code touches Supabase)
4. `docker images | grep supabase` → still shows images (we only stopped containers)
5. `docker system df` → reports reclaimable space; volumes still listed
6. Wait 7 days (grace period: if any service complains, the Supabase config + .env + compose file are intact for `docker compose up -d` to restore in ≤2 min)
7. After 7 days: `cd /home/ubuntu/supabase-project && docker compose down --rmi all --volumes` (nuclear: removes images + volumes; .env + compose file still kept for one cycle as rollback)
8. `rm -rf /home/ubuntu/supabase-project` (final, after 30 days)

**Verification (Step 3):**
- `docker ps` shows 0 `supabase*` containers
- `free -h` shows ≥ 1 GB more available than baseline (Supabase containers released ~2.4 GB RSS but mostly file-cached, so net is ~1 GB available)
- `df -h` shows ~7.5 GB more available after Step 7
- All staging services still active (`systemctl --user is-active koralink-{api,pwa,admin}`)
- API health green (`curl https://aa.tail2948f9.ts.net:8443/api/v1/health`)

**Commit:** `chore(infra): stop supabase stack (slice 0 of coolify-prod-cutover)`

---

## Slice A — Close public funnels `:10000` and `:8443`

**Tier:** T1 · **Risk:** LOW (funnel re-enable is one command) · **Reversibility:** HIGH

**Steps:**
1. `tailscale serve status` → snapshot pre-state
2. `tailscale funnel --https=10000 off` (kills the public funnel; Tailscale serve :9450 stays as tailnet-only fallback — verify)
3. `tailscale funnel --https=8443 off` (same for API; :8443 is still served to tailnet via `tailscale serve`, just no public)
4. `check-host.net TCP 10000,8443,9450,9451` from public internet → all CLOSED/FILTERED
5. `curl -sk https://aa.tail2948f9.ts.net:9450/ -o /dev/null -w "%{http_code}\n"` → 307 (you, on Tailscale)
6. `curl -sk https://aa.tail2948f9.ts.net:9451/ -o /dev/null -w "%{http_code}\n"` → 307 (you, on Tailscale)
7. From phone on mobile data (no Tailscale), try `:10000` → unreachable (good)

**Verification:**
- Staging reachable only on Tailscale
- Staging PWA still has dev-login bar (you, on Tailscale, see it; fine for now, fixed when prod E2E proves OTP)
- All 4 prod surfaces (Vercel×2 + Render + Neon) untouched

**Commit:** `chore(infra): close public funnels :10000 and :8443 (slice A of coolify-prod-cutover)`

---

## Slice B — Rebind Coolify UI `:8000` to 127.0.0.1

**Tier:** T1 · **Risk:** LOW · **Reversibility:** HIGH

**Steps:**
1. `sudo iptables -I INPUT -i lo -p tcp --dport 8000 -j ACCEPT` (allow loopback)
2. `sudo iptables -I INPUT -p tcp --dport 8000 -j DROP` (block non-loopback)
3. `sudo apt-get install -y iptables-persistent && sudo netfilter-persistent save` (persist across reboots)
4. `tailscale serve --bg --https=8000 http://127.0.0.1:8000` (give you Tailscale access to Coolify UI without OCI Security List exposure)
5. `check-host.net TCP 8000` from public → CLOSED
6. `curl -skL https://aa.tail2948f9.ts.net:8000/ -o /dev/null -w "%{http_code}\n"` → 302 (you, on Tailscale)

**Verification:**
- Defense-in-depth: iptables blocks the port even if the container bind slips back to 0.0.0.0
- Tailscale provides your access
- OCI Security List can stay open on :8000 (defense-in-depth: belt + suspenders)

**Commit:** `chore(infra): defense-in-depth rebind Coolify :8000 to loopback (slice B)`

---

## Slice C — 8 GB swapfile + OOM-guard drop-in

**Tier:** T1 · **Risk:** LOW (swap is always safe) · **Reversibility:** HIGH

**Steps:**
1. `sudo fallocate -l 8G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile`
2. Append to `/etc/fstab`: `/swapfile none swap sw 0 0`
3. `sysctl vm.swappiness=10` (prefer dropping file cache before swap) + persist in `/etc/sysctl.d/99-swap.conf`
4. Create `/home/ubuntu/.config/systemd/user/koralink-api.service.d/oom-guard.conf`:
   ```ini
   [Service]
   MemoryHigh=800M
   MemoryMax=1G
   Restart=on-failure
   RestartSec=5s
   ```
5. `systemctl --user daemon-reload && systemctl --user restart koralink-api`
6. `swapon --show` → 8 GB
7. `systemctl --user show koralink-api -p MemoryMax` → `MemoryMax=1G`

**Verification:**
- Swap active; OOM-guard limits API to 1 GB
- Build spikes no longer crash the box
- API health still green

**Commit:** `chore(infra): 8 GB swapfile + OOM guard on koralink-api (slice C)`

---

## Slice D — Offsite backup to Cloudflare R2 + restore drill

**Tier:** T1 · **Risk:** MED (token handoff pending) · **Reversibility:** HIGH
**Blocker:** you add `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` to `.deploy-tokens` (and create the R2 bucket in your CF dashboard)

**Steps:**
1. `curl https://r2.example.com` is DNS-blocked from VPS (verify with `nslookup` — if it works, the bucket is reachable; if it doesn't, fall back to dashboard recipe for the restore drill)
2. `which rclone || sudo apt-get install -y rclone`
3. `rclone config` → add remote `r2` with type `s3`, provider `Cloudflare`, access_key/secret_key from env
4. Create `/home/ubuntu/scripts/backup-offsite.sh`:
   ```bash
   #!/bin/bash
   set -euo pipefail
   set -a; source /home/ubuntu/.hermes/profiles/koralink/.deploy-tokens; set +a
   NEWEST=$(ls -t /home/ubuntu/backups/koralink/koralink-*.sql.gz | head -1)
   rclone copy "$NEWEST" "r2:${R2_BUCKET}/daily/" --progress --log-file=/var/log/koralink-backup-offsite.log
   ```
5. `chmod +x /home/ubuntu/scripts/backup-offsite.sh`
6. Create `/home/ubuntu/.config/systemd/user/koralink-backup-offsite.service`:
   ```ini
   [Unit]
   Description=KoraLink offsite backup to R2
   [Service]
   Type=oneshot
   ExecStart=/home/ubuntu/scripts/backup-offsite.sh
   ```
7. Create `/home/ubuntu/.config/systemd/user/koralink-backup-offsite.timer` (after koralink-backup.timer +5 min)
8. `systemctl --user daemon-reload && systemctl --user enable --now koralink-backup-offsite.timer`
9. Restore drill: `scripts/restore-drill.sh` (downloads from R2 → spin scratch docker PG → apply → row count + checksum)

**Verification:**
- `rclone ls r2:${R2_BUCKET}/daily/` → shows the new file
- Restore drill row count matches latest local dump
- Sentry event tag `kind=restore-drill ok=1`

**Commit:** `feat(infra): offsite backup to R2 with restore drill (slice D)`

---

## Slice E — Coolify project `koralink` + service `koralink-api`

**Tier:** T1 · **Risk:** MED (first Coolify deploy) · **Reversibility:** HIGH (env revert + service delete)
**Blocker:** you add `COOLIFY_TOKEN` to `.deploy-tokens`; you can mint it at Coolify UI :8000 (after Slice B you access via Tailscale)

**Steps:**
1. `apps/api/Dockerfile.coolify` (the contract from Gate 3 §6) — NEW file
2. Commit + push to `main` (so the Coolify webhook can find the Dockerfile)
3. `curl -X POST http://127.0.0.1:8000/api/v1/applications -H "Authorization: Bearer $COOLIFY_TOKEN" -H 'Content-Type: application/json' -d @coolify-app.json` (coolify-app.json: name, project_uuid, environment_name=production, git source, build_pack=dockerfile, dockerfile_path, base_dir, git_branch=main, manual_deploy=true)
4. Apply env-scoped vars per Gate 3 §2.1 (using Coolify's `POST /api/v1/applications/{uuid}/envs` with `is_build_time=false`)
5. `curl -X POST .../applications/{uuid}/deploy` → wait for "successful" status
6. `curl -i http://127.0.0.1:8000/api/v1/applications/{uuid}` → check container status
7. Inside container: `docker exec <container> wget -qO- http://127.0.0.1:3001/api/v1/health` → 200
8. From host: `curl -i http://127.0.0.1:3001/api/v1/health` (via `koralink-net` bridge? actually via Traefik — go to Slice H for the public path; for now this stays internal)

**Verification:**
- `coolify-db psql -U coolify -c "select name, status from applications;"` → koralink-api, status=running
- `docker stats --no-stream koralink-api` → 1 vCPU, 1 GB RAM cap respected
- Internal healthcheck 200
- No Sentry alerts

**Commit:** `feat(infra): coolify prod koralink-api service (slice E)`

---

## Slice F — Coolify managed DB `koralink-db`

**Tier:** T1 · **Risk:** MED (data persistence) · **Reversibility:** HIGH (volume survives; rerun migrate is idempotent)

**Steps:**
1. `curl -X POST http://127.0.0.1:8000/api/v1/databases -H ...` with image `imresamu/postgis:16-35`, port 5432, bind 127.0.0.1:5433, user `koralink`, db `koralink`, password (auto-generated → save to `.deploy-tokens:COOLIFY_PROD_DB_PASSWORD`)
2. `docker exec <koralink-db-container> psql -U koralink -d koralink -c "select version();"` → 16.x
3. `docker exec <koralink-db-container> psql -U koralink -d koralink -c "create extension if not exists postgis;"` → CREATE EXTENSION
4. Run `MIGRATE_DATABASE_URL=postgresql://koralink:<pwd>@127.0.0.1:5433/koralink node --env-file=.env scripts/migrate-vps.mjs` from `apps/api` (one-shot bootstrap)
5. `docker exec <koralink-db-container> psql -U koralink -d koralink -c '\dt'` → 30+ tables present
6. `docker exec <koralink-db-container> psql -U koralink -d koralink -c "select count(*) from drizzle.__drizzle_migrations;"` → matches `drizzle/*.sql` count
7. Restart `koralink-api` container (Coolify redeploy) so `DATABASE_URL` resolves
8. API health 200; one authenticated read works

**Verification:**
- Coolify managed DB healthy, port 5433 only on loopback
- Migrations applied (journal matches)
- API container connects to DB container via `koralink-db` service name
- One Sentry probe tagged `env=production`

**Commit:** `feat(infra): coolify prod postgis db (slice F)`

---

## Slice G — CORS + secret cutover, Render DEV_LOGIN flip (T2)

**Tier:** T2 (prod-touching; needs your explicit go per action) · **Risk:** HIGH (visible to friends) · **Reversibility:** HIGH (env revert ≤2 min)

**Steps (per `devops-cycle` §8 Phase 1):**
1. Test OTP end-to-end on Coolify API URL using the seeded user `+966500000001` + dev-login (still ON in staging; Coolify has no dev-login — use staging API for the E2E test instead, which proves OTP works against the same DB shape; for prod, the OTP path needs the staging-flow confirmed)
2. Confirm Brevo is sending on the staging API (proven 2026-09-10 ops-log row 24)
3. Replicate the Brevo env on Coolify (`BREVO_API_KEY`, `BREVO_FROM`, `EMAIL_PROVIDER=brevo`) — done in Slice E env-scoped vars; verify by sending a test email from Coolify
4. You press go for "Render DEV_LOGIN_ENABLED=false": `curl -X DELETE .../envs/DEV_LOGIN_ENABLED -H "Authorization: Bearer $RENDER_API_KEY"`
5. Vercel PWA: `NEXT_PUBLIC_API_URL` → Coolify API URL (T2 env edit + redeploy)
6. Friends open `kora-link-player-pwa.vercel.app` → sign up → OTP arrives → verified → in
7. Bake `NEXT_PUBLIC_DISABLE_DEV_LOGIN_BAR=true` on Vercel PWA (verifies no dev-login bar in prod chunks)
8. Update `devops-cycle` §1 prod rows + `environment-segregation/02-architecture.md` (registry stays the source of truth)

**Verification:**
- §6 cutover matrix green on Coolify public origin
- OTP received on Abdullah's phone (live)
- No dev-login bar in Vercel PWA chunks
- Sentry environment=production visible in UI

**Commit:** `feat(infra): prod cutover via Coolify (slice G — T2 — owner signed off)`

---

## Slice H — Cloudflare DNS CNAME + Render warm rollback (T2 if you add token)

**Tier:** T2 · **Risk:** MED · **Reversibility:** HIGH
**Blocker:** you add `CLOUDFLARE_API_TOKEN` to `.deploy-tokens`; you have a koralink zone in Cloudflare

**Steps:**
1. Cloudflare dashboard: add a public hostname `api.koralink.sa` (or your chosen name) → CNAME → Coolify Traefik origin
2. `curl https://api.koralink.sa/api/v1/health` → 200
3. `koralink-keepwarm.timer` keeps Render warm at 10-min cadence (already live; no change)
4. Runbook: `docs/plans/coolify-prod-cutover/runbooks/render-rollback.md` (re-point Vercel `NEXT_PUBLIC_API_URL` to Render, redeploy ≤2 min)
5. Cloudflare proxy OFF (CNAME-only, gray-cloud) — proxy can flip later if you want TLS + DDoS for free

**Verification:**
- DNS resolves to Coolify origin
- Render still 200 (warm rollback armed)
- Sentry release tag shows new environment
- §6 cutover matrix green on the new public hostname

**Commit:** `feat(infra): cloudflare CNAME for prod api (slice H)`

---

## Cycle completion

After Slice H, the registry (`devops-cycle` §1) prod rows read:

```
PROD | PWA    | Vercel kora-link-player-pwa.vercel.app
PROD | Admin  | Vercel kora-link-admin.vercel.app
PROD | API    | Coolify container (https://api.koralink.sa) + Render warm fallback
PROD | DB     | Coolify managed PostGIS (127.0.0.1:5433) + Neon warm fallback
```

The phase-2 box becomes phase-3 cleanup: Render + Neon kept warm by cron, ready as documented fallback; Coolify is the live prod.

`docs/plans/coolify-prod-cutover/00-status.md` will mark every slice ✅ as it lands, mirroring the `environment-segregation/00-status.md` style.

---

## Final pre-build guard

Before starting Slice 0, the build was already verified green (Gate 3 → 4). Each slice re-runs `env -u NODE_ENV npx turbo run build` at its boundary — if a slice changes any file in `apps/`, the build gate fires.
