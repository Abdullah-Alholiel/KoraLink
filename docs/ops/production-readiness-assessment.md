# KoraLink VPS Production-Readiness Assessment

**Date:** 2026-09-02 · **Host:** `aa` (ARM64, Tailscale IP 100.93.99.24, public IP 145.241.109.213)
**Scope:** OS, resources, services, DB, security, backups, observability, cost of scaling.

---

## 1. Executive verdict

**Score: 6.5 / 10 — "strong solo-dev staging, not yet production."**

The platform itself (code hardening, auth gating, observability wiring, watchdog, backup script) is in very good shape for this stage. What keeps it out of "fully production" is a short, well-defined list: a single non-redundant host on a reclaimable free tier, backups with no offsite copy, `NODE_ENV=development` on the live API, a public Swagger doc, and the public entry point still being a Tailscale Funnel URL instead of a real domain.

Everything on the blocking list is fixable in ≤1 day of work, ~$0/month.

| Area | Status | Score |
|---|---|---|
| App services (API/PWA/Admin) | ✅ healthy, systemd user units + linger | 8/10 |
| Database | ✅ healthy, 27 tables, PostGIS 3.5.3, 18 MB, 6/100 conns | 8/10 |
| Security posture | ⚠️ good gates, 2 hygiene gaps | 6/10 |
| Backups / DR | ⚠️ local-only, no offsite, single host | 4/10 |
| Observability | ✅ Sentry EU + PostHog + Pino + watchdog | 7/10 |
| Infra reliability | ⚠️ 1 box, 0 swap, free-tier reclamation risk | 5/10 |
| Cost efficiency | ✅ $0/month today, clear upgrade path | 9/10 |

---

## 2. Current state (measured)

- **OS:** Ubuntu 24.04.3 LTS, aarch64. Node v22.23.2, npm 12.0.2, Docker 27.0.3. Kernel up 5 days, no pending reboot, unattended-upgrades active, fail2ban active, SSH password auth disabled.
- **Resources:** 4 vCPU / 23.4 GB RAM / 145 GB disk (Oracle Cloud A1.Flex "Always Free" shape). RAM 9 GiB used, 14 GiB available. Disk 54% used. **Swap: 0 B.**
- **Load:** averages 4.2–5.0 on 4 cores → **CPU is the saturated resource**; RAM is not. Spikes coincide with dev/QA activity on the box.
- **Running on the box (29 containers + user services):** KoraLink Postgres (PostGIS 16-3.5), full self-hosted Supabase stack (14 containers incl. Logflare/analytics), Coolify (+proxy/db/redis), Multica (3), n8n task-runner, remote Firefox + Chromium (UI-verification tools), VPS portal/dashboard, webui-proxy — plus 3 Hermes gateways, WebUI, kanban dashboard, and the 5 KoraLink user services (api, pwa, admin, landing-drafts, multica-bridge).
- **KoraLink health at probe time:** PWA `/ar` 200 (33 ms) · API `/api/v1/health` 200 `{"status":"ok"}` (2.6 ms) · Admin 307→login (normal). 139 error/fail log lines in 24 h across the three services — dominated by *expected* security rejections ("dev-login is disabled", "Invalid or missing session cookie" — external scanners probing the funnel URL and being refused).
- **DB internals:** PostgreSQL 16.10, 27 public tables, 18 MB total size, 6 connections of `max_connections=100`, PostGIS 3.5.3, 12 tables never yet autovacuumed (autovacuum will engage as rows grow — normal), 26 user rows (seed/demo).
- **Network exposure (verified from the public internet via check-host.net):** open — 22 (SSH, expected), 443 (Admin funnel), 8443/10000 (API/PWA funnels). **Closed — 5432, 3000.** Postgres and the raw PWA port are not internet-reachable. ✅
- **Entry path:** all public traffic enters via Tailscale Funnel TLS (`aa.tail2948f9.ts.net`) → localhost ports. Encrypted and working, but a ts.net hostname + Tailscale relay is a dependency you don't control for a consumer product.

---

## 3. Findings

### P0 — must fix before real users
| # | Finding | Evidence | Impact |
|---|---|---|---|
| 1 | **API runs with `NODE_ENV=development`** | `/proc/<api-pid>/environ` → `NODE_ENV=development`; `apps/api/.env:24` | Non-standard runtime posture; some libs dev-tune (verbose errors, cache headers). Auth risk itself is *contained* — dev-login is gated by explicit `DEV_LOGIN_ENABLED` flag (default disabled, external probes rejected in logs — P0-7 fix from run #25/26 confirmed live) |
| 2 | **Backups are local-only, single-host DR = none** | `scripts/db-backup.sh`: "Encrypted offsite copy: PENDING (board P1-18)"; only `/home/ubuntu/backups/koralink/koralink-20260902-101244.sql.gz` (31 KB) | Disk loss / instance termination / Oracle reclamation = total data loss. Script itself is good (pg_dump, gzip -t integrity, size guard, 30-day retention) — only the offsite leg is missing |
| 3 | **Single point of failure, free-tier reclamation risk** | Oracle "Always Free" idle-reclamation policy: 7-day window with CPU p95 < 20% AND network < 20% AND memory < 20% (A1) → instance may be **stopped** | Currently *low* risk (CPU load ≫ 20% p95, RAM 39%) — the crowded box is accidentally protecting itself. But this is luck, not design. One policy away from a dead production box |

### P1 — fix this week
| # | Finding | Evidence | Impact |
|---|---|---|---|
| 4 | **Swagger UI + full API surface map publicly reachable, unconditionally** | `GET https://aa.tail2948f9.ts.net:8443/api/docs` → **200**; no env guard around `SwaggerModule.setup` in `main.ts` | Attackers get every endpoint, DTO shape and parameter enumerated. Docs are nice-to-have publicly; the enumeration is not |
| 5 | **No swap** | `swapon --show` empty | A single RAM spike (docker build on this crowded box) → OOM-kill of the API or Postgres. We've already seen admin builds OOM (run #21) |
| 6 | **Public entry = Tailscale Funnel, no real domain** | `tailscale funnel status` → all public hosts are `aa.tail2948f9.ts.net` | For Saudi consumer users: Tailscale relay latency, ts.net domain, no CDN, no WAF, funnel availability is on Tailscale's goodwill. Fine for beta; not for launch |

### P2 — hygiene (≤1 h each)
| # | Finding | Evidence | Impact |
|---|---|---|---|
| 7 | **Watchdog was failing every 5 min since creation** | `koralink-watchdog.service` 203/EXEC — script lacked execute bit | **Fixed during this audit** (chmod +x; now green: api/pwa/admin/postgres/disk/backup-age all OK every 5 min) |
| 8 | **Box serves ~12 unrelated production-ish workloads** | 29 containers; Supabase stack alone ≈ 14 containers, Logflare 650 MB RAM, remote browsers 1.2 GB RAM combined | CPU contention with KoraLink (the load-4–5 spikes); a noisy neighbor crash-loop can starve the API |
| 9 | **journald at 4 GB** | `journalctl --disk-usage` → 4.0G | Disk creep; add `SystemMaxUse=500M` |
| 10 | **`max_connections=100`, no PgBouncer** | `show max_connections` → 100 | Fine for hundreds of users; revisit at Phase 2 with a pooler (supavisor already on box for Supabase, pattern exists) |

### Verified-good (no action)
- Dev-login disabled by default (explicit `DEV_LOGIN_ENABLED` flag; Strix CVSS 9.1 finding from run #25 confirmed remediated live).
- SSH hardened (PasswordAuthentication no) + fail2ban active + unattended security upgrades + no pending reboot.
- Docker restart policies (`unless-stopped`/`always`) + Docker/containerd enabled at boot + user services with `Linger=yes` → **the full stack survives a reboot unattended**.
- Postgres not exposed publicly; KoraLink DB is tiny and healthy; backup integrity guard works.
- Sentry (EU, org hztl) on API + PWA, PostHog on PWA, Pino structured logs with the runtime's known CSP/sourcemap gotchas already handled (koralink-observability conventions).

---

## 4. Capacity: how many users can this serve?

Engineering estimate (not load-tested — action item: k6 smoke test before launch):

| Stage | Rough MAU | Verdict on current box |
|---|---|---|
| Today (26 seed users, dev/QA traffic) | — | ✅ comfortable |
| Beta → early launch | ≤ ~1,000–2,000 | ✅ holds, *if* dev containers are trimmed and builds move off-box |
| Growth | 2,000–10,000 | ⚠️ CPU-tight; needs the Phase-2 split |
| Scale | 10,000+ | ❌ needs the Phase-3 stack |

The two first bottlenecks will be **CPU during builds on the shared box** (move `turbo build` to GitHub Actions, ship artifacts) and **DB connections as concurrent users grow** (add PgBouncer; `koralink-db-scaling` skill has the playbook).

---

## 5. Cost-efficient scaling ladder (verified prices, Sep 2026)

**Guiding principle: stay free as long as the architecture allows, then split DB from app *before* buying anything big. All prices verified against vendor pages/published price lists this audit.**

### Phase 0 — now · **$0/month**
1. Upgrade OCI account to **Pay-As-You-Go** (keep Always Free allowances): OCI price list — A1 = $0.01/OCPU-hr; first **3,000 OCPU-hr + 18,000 GB-hr per month are free on paid tenancies**. This box uses 4×744 = 2,976 OCPU-hr and 24×744 = 17,856 GB-hr → **still $0**, but PAYG tenancies are exempt from idle reclamation → P0-3 closed for free.
2. **Offsite backups to Cloudflare R2** (~$0.015/GB-mo, free egress; DB is 31 KB/day compressed → effectively $0 for years). Nightly `rclone copy` appended to `db-backup.sh`.
3. Gate Swagger: `if (configService.get('ENABLE_SWAGGER') === 'true')` around `SwaggerModule.setup` in `apps/api/src/main.ts` → P1-4 closed.
4. Fix `NODE_ENV=production` in `apps/api/.env` after a rehearsed check of prod env completeness (Unifonic, JWT secret, PostHog/Sentry keys) + rebuild — P0-1 closed.
5. Add 2–4 GB swapfile; `SystemMaxUse=500M` for journald.
6. External uptime ping (UptimeRobot/healthchecks.io free tier) on the funnel URLs → page when the watchdog can't.

### Phase 1 — ≤ ~2k MAU · **$0/month**
Stay on the (now PAYG) A1 4/24. Move builds to GitHub Actions. Triage the Supabase stack: if it's not serving KoraLink prod traffic, stop it or run it off-hours — reclaiming its ~3 GB RAM + CPU share directly buys KoraLink headroom. Optionally spin a **second Always Free A1 instance** (PAYG allowance covers 4 OCPU/24 GB total ×1; two instances must share 2,976 OCPU-hr → realistically 2 OCPU/12 GB each at $0) as a warm standby/DB target.

### Phase 2 — 2k–10k MAU · **$12–25/month**
Two options, both ARM64 (aarch64 images move over cleanly):
- **A (recommended): second free OCI A1 instance in the same VCN dedicated to Postgres** — same-region private network, sub-ms DB latency, still $0 on PAYG allowance. App box keeps KoraLink only.
- **B: Hetzner CAX21** (4 vCPU/8 GB/80 GB, €10.49 ex-VAT ≈ **$12.5/mo** after the Jun-2026 price adjustment) or **CAX31** (8/16, ~$24/mo) as a clean single-purpose app host. Hetzner = no reclamation policy, snapshot backups, cheap egress — the escape hatch if Oracle ever throttles.
Add PgBouncer in front of Postgres; enable PostGIS KNN/GiST tuning per `koralink-postgis-performance`.

### Phase 3 — 10k–50k MAU · **$50–150/month**
- **DB:** Neon Launch (pay-per-use: $0.106/CU-hr, $0.35/GB-mo, 7-day PITR, 99.95% SLA on Scale) — PostGIS supported; or Hetzner CAX31+volume for the DB. *Caveat: Neon has no Middle-East region — from Saudi, ~100 ms DB RTT; if latency hurts, keep the DB on a Hetzner/OCI instance in-region and use Neon only for staging branches.* (Neon Free: 100 CU-h/mo, 0.5 GB — fine for staging.)
- **App:** 2× CAX21 behind Cloudflare (free CDN/WAF) with a real domain — retires the Funnel dependency; sticky sessions for Socket.IO via the Redis adapter (`koralink-realtime-scaling` skill), Redis on Upstash free tier → paid.
- **Object storage:** R2 for media/uploads.

### Phase 4 — 50k+ · **$150–500+/month**
Managed Postgres with SLA, 2–4 app nodes, dedicated Redis, Sentry Team (~$26/mo) + PostHog paid tier as event volume demands, staging environment (Neon branch per feature — $0 extra), on-call via existing watchdog + UptimeRobot escalation.

**Total cost to a genuinely production-grade 10k-MAU deployment: roughly $25–70/month.** The single most cost-efficient action available today remains **Phase 0, item 1: the PAYG upgrade — it converts the biggest reliability risk (reclamation) into zero dollars.**

---

## 6. 30-day action checklist

- [ ] OCI → Pay-As-You-Go upgrade (removes reclamation risk, stays $0) — *owner: Abdullah (console)*
- [ ] Offsite backup leg to R2 + restore drill (restore the 31 KB dump into a scratch DB, verify)
- [ ] Swagger behind `ENABLE_SWAGGER` flag
- [ ] `NODE_ENV=production` rehearse-and-switch
- [ ] Swapfile + journald cap
- [ ] UptimeRobot on funnel URLs
- [ ] k6 load test → real capacity number replaces the estimate in §4
- [ ] Real domain + Cloudflare plan for launch (Phase 2/3 trigger)
- [ ] Supabase-stack triage: keep / idle / remove

---

## 7. Evidence appendix (key commands → results)

```
uptime            → load 4.75/5.00/4.26, 4 cores          (CPU-saturated, RAM fine)
free -h           → 9.0Gi used / 23Gi, swap 0B            (P1-5)
df -h /           → 77G/145G (54%)
docker ps         → 29 containers up (supabase×14, coolify×6, multica×3, browsers×2, …)
systemctl --user  → koralink-api/pwa/admin/landing-drafts/multica-push active;
                    koralink-watchdog FAILED 203/EXEC (pre-fix)
curl /api/v1/health → 200 {"status":"ok"} (2.6 ms)
PG                → 16.10, DB 18 MB, 27 tables, 6/100 conns, PostGIS 3.5.3
check-host.net    → 22,443 open · 5432,3000 closed from internet
funnel            → :8443 /api/docs 200 (P1-4)
api environ       → NODE_ENV=development (P0-1)
db-backup.sh      → pg_dump+gzip+t, 30d retention, offsite PENDING (P0-2)
Oracle docs       → A1 reclamation: 7d, CPU p95<20% ∧ net<20% ∧ mem<20%
OCI price list    → A1 $0.01/OCPU-hr; 3,000 OCPU-hr + 18,000 GB-hr/mo free on PAYG
Hetzner (Jun '26) → CAX11 €5.99 · CAX21 €10.49 · CAX31 €20.99 (ex-VAT)
Neon              → Free 100 CU-h/0.5GB · Launch $0.106/CU-h + $0.35/GB-mo
```
