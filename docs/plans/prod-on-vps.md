# P0-11 — KoraLink prod + staging on the VPS via Coolify (PLAN ONLY)

**Status:** DRAFT awaiting owner go/no-go (see `kanban/OWNER-QUEUE.md`, item 1).
**Requested by:** Abdullah, 2026-11-05 (kanban card `t_459699ef`, DECISIONS.md 2026-11-05 row).
**Written by:** Factory run #190, 2026-11-06.
**Nothing in this plan executes without the owner's numbered approvals.** This document
contains no secrets.

---

## 0. What already exists (verified live, run #190)

| Fact | Evidence |
|---|---|
| Coolify 4.6.0 installed and healthy on this VPS | `docker ps`: `coolify` (up 11h, UI on host :8000), `coolify-db` (pg15-alpine), `coolify-redis`, `coolify-sentinel`, `coolify-proxy` (Traefik v3.6, owns host :80/:443/:8080) |
| Traefik already owns public :80/:443 | `ss -tlnp` — no other listener on 80/443; factory Traefik (:443) from the docs coexists as user-level, no port conflict observed |
| Per-app Dockerfiles already in repo | `Dockerfile` (API, node:20-alpine multi-stage, NODE_ENV=production), `apps/player-pwa/Dockerfile`, `apps/admin/Dockerfile` |
| Both Next apps build `output: 'standalone'` | `apps/player-pwa/next.config.mjs`, `apps/admin/next.config.mjs` |
| Release-verify tooling exists | `scripts/release-verify.sh <API_BASE> <PWA_URL> [ADMIN_URL]` — public probes only |
| Staging Postgres+PostGIS | `koralink-postgres` (imresamu/postgis:16-3.5, docker compose project `koralink`, 127.0.0.1:5432, **no memory limit set**) |
| VPS headroom | 23 GiB RAM total, 9.3 GiB available; 42 GiB free disk (72% used) |
| Staging quartet memory today | API 121 MB · PWA 85 MB · admin 75 MB (peaks ≈ 142/105/106 MB) |

**Note (correction to the card brief):** the brief's "stale `/data/coolify/proxy/dynamic/
koralink-demo.yaml`" — `/data/coolify/proxy/dynamic/` reads EMPTY from the agent shell
(permission-limited); the owner should eyeball it at Approval A5. Traefik's dynamic config
is file-provider mounted from that dir; if the file exists but is not readable by the
agent, Coolify's proxy panel will show it anyway.

---

## 1. Target topology (post-cutover)

```
                        Coolify proxy (Traefik, :80/:443)
                                      │
        ┌─────────────┬───────────────┼────────────────┐
        │             │               │                │
   app.145241109…  api.145241109…  admin.145241109…  (dashboard :8000 stays
   sslip.io        sslip.io        sslip.io           owner-side / tinyauth)
   player-pwa      api             admin              ← Coolify containers
        │                             │
        └──────────── to api:3001 (env NEXT_PUBLIC_API_URL / server-side base)
        
   koralink-prod-pg (NEW Postgres+PostGIS container, memory-capped, 
   creds owner-held; factory agents NEVER receive them)
   migration source: Neon (Render DATABASE_URL ep-rapid-mud) via dump/restore
```

- Prod DB lives **in Docker on the VPS** (PDPL data-residency driver).
- Staging quartet (systemd) stays **exactly as-is** during and after cutover — zero risk
  to the factory loop. A later phase MAY move staging into Coolify as a second stack;
  it is explicitly OUT of scope until prod is stable 2 weeks.
- Render/Vercel/Neon stay live as fallback for 2 weeks, then retired (Approval A8).

## 2. Coolify app definitions (three apps + one DB)

Common settings for all three apps, built from **tagged `main` releases**, never the
staging checkout:

- **Source:** GitHub repo `Abdullah-Alholiel/KoraLink`, deploy trigger = **GitHub
  webhook on tag push** (`release/v<N>` tag made at the staging→main merge), branch
  mode OFF (never auto-deploy `main` on every commit — releases are explicit).
- **Build:** each app's existing Dockerfile (Coolify "Dockerfile" build type, monorepo
  root context). Build in Coolify is containerized — it does NOT touch the factory's
  systemd scope or the 4 GiB worker guard.
- **Health check:** API `GET /api/v1/health` (200), PWA `/en` (200/307), admin `/en`
  (200/307) — same probes `release-verify.sh` already makes.
- **Restart policy:** `on-failure`, retries 3.
- **Rollback:** Coolify keeps every successful build image; rollback = redeploy previous
  version from the app's Versions list (one click) + re-point the proxy label if needed.
  Verify line for every rollback: `release-verify.sh` against the sslip URLs returns
  all-ok.

| App | Domain (sslip) | Container port | Key env (no secrets listed) |
|---|---|---|---|
| player-pwa | `app.145241109.213.sslip.io`¹ | 3000 | `NEXT_PUBLIC_API_URL=https://api…`, `NEXT_PUBLIC_*` parity with prod Vercel project (owner exports current values into Coolify; factory never handles prod keys) |
| api | `api.145241109.213.sslip.io`¹ | 3001 | `DATABASE_URL` (→ new prod pg container), `NODE_ENV=production`, Unifonic/Moyasar/Sentry keys — **owner pastes these into Coolify UI**, `WALLET_TOPUP_ENABLED` per owner |
| admin | `admin.145241109.213.sslip.io`¹ | 3002 | same parity discipline |

¹ exact host string = `app.145.241.109.213.sslip.io` per sslip.io dash convention —
CONFIRM the exact resolving form in Approval A5 with `curl -I` before DNS cutover.

**PWA/Admin standalone note:** the Dockerfiles must run `node apps/<app>/.next/standalone/
server.js` (or the repo's `sync-standalone` equivalent inside the image). Runbook: build
one image locally first (`docker build -f apps/player-pwa/Dockerfile .`) at Approval A5
and confirm the container boots before wiring Coolify.

## 3. Prod Postgres+PostGIS container (the money table)

- **Image:** `imresamu/postgis:16-3.5` (same as staging — PostGIS needed for venue geo).
- **Name:** `koralink-prod-pg`, docker compose project `koralink-prod` (separate from
  staging's `koralink` project so a compose down never crosses).
- **Resources:** `--memory=1g --memory-swap=2g` (target: prod quartet + DB ≈ 1 GB total
  steady-state; DB gets the largest single share). Staging pg currently has NO memory
  limit — adding a cap on the PROD container is mandatory, on staging it is owner-optional.
- **Credentials:** generated once, shown once in the Coolify/owner session. **The factory
  agents never receive them.** Owner pastes `DATABASE_URL` into the Coolify api-app env.
  Any future debug that needs prod DB access = owner runs the command (or hands a
  time-boxed session; factory never stores it).
- **Backups:** nightly `pg_dump` inside the container to `/data/coolify/backups/
  koralink-prod/` + offsite copy (Approval A7 decides: Backblaze B2 vs private GitHub
  repo — R2 is ruled out, unreachable from this VPS). Replaces the current
  `koralink-backup-prod.timer` (Neon) after cutover; watchdog §4b path repointed.

## 4. Migration path Neon → VPS Postgres (one-time, owner-executed)

1. Owner runs dump from prod Neon (helper exists: `scripts/db-backup-prod.sh` pattern —
   PG17 client against the Render-resolved `DATABASE_URL`). Verify: `gzip -t` +
   CREATE-TABLE floor count = 29 tables (current prod truth).
2. Owner restores into `koralink-prod-pg`:
   `docker exec -i koralink-prod-pg psql -U <owner> -d koralink < dump.sql.gz` (gunzip pipe).
3. Journal reconciliation: `scripts/neon_journal_reconcile.py` against the new DB —
   `drizzle.__drizzle_migrations` must show 60/60 rows matching the repo journal (60
   entries at run #190). Verify: helper prints 60/60 + table/object spot-checks.
4. Point the api-app `DATABASE_URL` at the new container, restart, hit
   `/api/v1/health` + one authed endpoint from the PWA. **Rollback:** flip
   `DATABASE_URL` back to the Neon/Render URI and restart the Render service (still
   live during the 2-week window).

## 5. Public URLs + DNS (sslip now, real domain later)

- sslip hosts per §2; Traefik labels live in Coolify per-app "Domain" fields (the proxy
  auto-generates LE certs — sslip.io is LE-eligible; if rate-limited, self-signed via
  Coolify is the fallback, noted as cosmetic for demo phase).
- The (possibly stale) `/data/coolify/proxy/dynamic/koralink-demo.yaml` is repointed or
  removed at Approval A5 — one file, owner-visible.
- Current Tailscale Funnel links (:9450/:8443/:10000/:3002) are INTERNAL/diagnostic and
  stay untouched — nothing breaks for the factory.
- Real domain later = Cloudflare DNS → same Traefik (one label edit per app).

## 6. CI / release flow after cutover

1. `pr-gate.yml` / `semgrep.yml` / `pr-agent.yml` unchanged (PRs → staging).
2. Release = owner merges staging→main (PR #178 flow unchanged), then owner tags
   `release/v<N>` on main → GitHub webhook → Coolify builds + deploys the three apps
   from that tag.
3. Post-deploy verify: `scripts/release-verify.sh https://api.145…sslip.io/api/v1
   https://app.145…sslip.io https://admin.145…sslip.io` — target list gains the sslip
   URLs; Render/Vercel URLs keep being probed during the 2-week overlap.
4. Migrations on release: **migrate-first runbook preserved** — owner runs
   `MIGRATE_DATABASE_URL=<prod-pg-uri> node scripts/migrate-vps.mjs` BEFORE the tag
   push (same P2-51 discipline; the Coolify app never auto-migrates).

## 7. Cutover + rollback runbook (numbered, each step verify + rollback)

| # | Step | Verify | Rollback |
|---|---|---|---|
| C1 | Coolify: create 3 apps + prod-pg from this plan (owner) | containers `Up (healthy)` in Coolify UI | delete apps/DB (nothing public yet) |
| C2 | Wire webhook + tag `release/v<initial>` | Coolify builds green, images listed | rebuild previous tag |
| C3 | Neon → prod-pg restore (§4) | journal 60/60 + 29 tables | Neon stays authoritative; point api back |
| C4 | Flip api `DATABASE_URL` → prod-pg; restart | health 200 + authed smoke via PWA | flip back to Neon URI |
| C5 | Repoint/remove stale demo route; confirm sslip URLs | `release-verify.sh` all-ok on sslip URLs | remove labels, Funnel links unchanged |
| C6 | Announce/demo on sslip URLs (Momentum-style launch order unchanged) | owner manual pass | Render/Vercel still live — swap DNS/links back |
| C7 | Nightly backup retarget to prod-pg + offsite | watchdog §4b green 2 nights | re-arm Neon timer (kept 2 weeks) |
| C8 | After 14 stable days: retire Render/Vercel/Neon + keep-warm cron | owner confirms last probe | none needed (this IS the retirement) |

## 8. Launch-readiness gaps (LISTED, NOT BUILT — each needs its own row/approval)

1. **Turnstile (or equivalent) on OTP send** — prepaid Unifonic SMS is abuse bait on
   public URLs. Biggest new exposure of this whole plan.
2. **PDPL privacy notice + terms pages** on the PWA (public launch legality).
3. **Moyasar + Unifonic callback URLs** must move to the new public hosts (owner does
   this in the Moyasar/Unifonic dashboards).
4. **Sentry DSN per env** — separate prod project (or same DSN with env tag) once prod
   traffic is real.
5. **Nightly prod backup → prod-pg + offsite copy** (§3, §7-C7; offsite target =
   Approval A7).
6. Rate-limit review on public exposure: existing `@Throttle` coverage was sized for
   Tailscale-internal; re-check auth endpoints when URLs go public.

## 9. RAM/disk estimate

| Component | Steady | Peak |
|---|---|---|
| api container | ~150 MB | ~250 MB |
| player-pwa container | ~100 MB | ~150 MB |
| admin container | ~90 MB | ~130 MB |
| koralink-prod-pg (capped) | ~300 MB | ≤ 1 GiB (cap) |
| **Prod total (target ≈ 1 GB)** | **~640 MB** | **≤ 1.5 GiB** |
| Coolify overhead (already running) | ~400 MB | — |

Disk: 3 images ≈ 1.5–2.5 GB + backups (~12 KB/day now, grows with prod data; 30-day
retention trivial) — 42 GiB free is ample.

## 10. Owner approvals needed, IN ORDER (each = one chat "go" + the step)

- **A1** — Approve this plan as the cutover blueprint (or amend; every amendment lands
  here as a dated edit).
- **A2** — Create the 3 Coolify apps + `koralink-prod-pg` (§2/§3 settings incl. memory
  cap; owner pastes secrets; factory never sees prod creds).
- **A3** — Wire the GitHub webhook + first tag build (C2).
- **A4** — Owner-executed Neon dump → restore → journal reconcile (§4, C3) — prod-DB
  action, owner-only per DECISIONS.md 2026-11-03.
- **A5** — sslip URL cutover + stale demo-route repoint/removal (C5) — includes the
  exact sslip host-form confirmation.
- **A6** — Public go-live on sslip URLs (C6) — NOT before A5 verify is green + OTP
  rate-limit review (§8.1/§8.6) at least scheduled; Turnstile can follow fast, but
  public OTP must not open before the review lands.
- **A7** — Offsite backup target choice (Backblaze B2 vs private GitHub repo) + retarget
  nightly backup (C7).
- **A8** — 2-week fallback retirement: Render/Vercel/Neon + keep-warm cron off (C8).

**Factory role during execution:** prepare exact commands, run non-credential steps on
request, verify each step's verify-line — never execute prod-DB or credential steps
itself (DECISIONS.md 2026-11-03 stands).
