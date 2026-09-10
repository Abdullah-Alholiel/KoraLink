# Coolify Prod Cutover — Gate 1: Product Spec

**Date:** 2026-09-10 · **Cycle:** coolify-prod-cutover v1 · **Mode:** autonomous (user mandate)
**Stops at Gate 1 → 2 boundary only if no further decisions needed; this gate is final-form.**

---

## 1. Problem statement

KoraLink's prod API lives on Render FREE — a tier that (a) cold-starts 30–50 s after 15 min idle, (b) cold-starts after every deploy, (c) has 0.1 CPU / 512 MB hard cap, and (d) just disqualified itself as an OTP-grade endpoint in our own Phase 1 assessment (`devops-cycle` §8). Our VPS is fast, paid-for, 5 vCPU, 24 GB RAM, 145 GB disk — and we already have Coolify installed, healthy, and idle.

**Two simultaneous problems from the same audit:**

1. **Staging is leaking public.** Funnels `:10000` (PWA) and `:8443` (API) serve the dev-login build to the open internet, bypass OCI Security Lists, and were accepted only as Phase-0 interim. They must close before any friend is invited to prod.
2. **Supabase is dead weight on the host.** 14 containers running, ~2.4 GB RAM, ~5 % CPU, ~7.5 GB images, nothing uses them. Pure memory/disk tax.

**Plus one architectural ask:** staging should stay yours (Tailscale), prod should be shareable with friends (public).

## 2. User stories

| Priority | Story |
|---|---|
| **P0** | As Abdullah, I open staging only when I am on my Tailscale — never from the public internet. |
| **P0** | As a friend, I open `kora-link-player-pwa.vercel.app` from a normal browser, sign up with my phone, and get an OTP — no Tailscale required. |
| **P0** | As Abdullah, the VPS has 2+ GB more free RAM after Supabase removal, with zero app breakage. |
| **P0** | As Abdullah, when the VPS disk dies, I can restore a KoraLink prod DB from offsite backup within 1 hour. |
| **P1** | As Abdullah, the prod API has the same Riyadh-region latency as staging (≤ 80 ms p95). |
| **P1** | As Abdullah, prod containers have CPU/RAM limits so a runaway container cannot kill the staging quartet. |
| **P2** | As Abdullah, prod DNS lives on Cloudflare so I can swap origins without changing URLs. |

## 3. Scope & boundaries

**IN SCOPE (this cycle):**
- Slice 0: delete Supabase stack (containers, images, volumes after 7-day grace)
- Slice A: close public funnels `:10000` and `:8443`; make staging tailnet-only via `:9450`/`:9451` (you keep Tailscale)
- Slice B: rebind Coolify `:8000` to 127.0.0.1 (Supabase rebinds become moot after Slice 0)
- Slice C: 8 GB swapfile + systemd OOM-guard drop-in for koralink-api
- Slice D: offsite backup to Cloudflare R2 + ONE restore drill on a scratch PG
- Slice E: Coolify project `koralink` → env `production` → service `api` (git source, branch `main`, build = turbo API)
- Slice F: Coolify project `koralink` → env `production` → service `db` (`imresamu/postgis:16-3.5`, 127.0.0.1 bind)
- Slice G: CORS + secret cutover (Unifonic AppSid when you wire it, Brevo already done in staging); flip Render `DEV_LOGIN_ENABLED=false` AFTER prod E2E OTP pass
- Slice H: Cloudflare DNS CNAME + Render kept warm as rollback (keep-warm cron continues; you can re-point prod API by env swap if Coolify has an incident)

**OUT OF SCOPE (later cycles):**
- Migrating staging quartet into Coolify (factory loop depends on systemd; never in scope)
- Cloudflare proxy / DDoS (CNAME-only this cycle; proxy later if/when you ask)
- Multi-region prod (single VPS is your SPOF; geographic redundancy is a future box)
- Tailscale Funnel on prod API (you can flip this on later, same syntax as staging, port of your choice)

## 4. Success criteria (every gate boundary hard-gates on these)

| ID | Criterion | How verified |
|---|---|---|
| SC-1 | `https://aa.tail2948f9.ts.net:10000` returns 000 from public internet (funnel closed) | `check-host.net TCP` |
| SC-2 | `https://aa.tail2948f9.ts.net:9450` and `:9451` work for you on Tailscale | `tailscale serve status` + browser test |
| SC-3 | `docker ps` shows no `supabase*` containers; `docker images` shows no `supabase/*` images (after grace) | `docker ps`/`docker images` |
| SC-4 | `free -h` shows ≥ 2 GB more available RAM than baseline (13 GB used) | `free -h` |
| SC-5 | `swapon --show` shows 8 GB swapfile active | `swapon --show` |
| SC-6 | Offsite backup file exists in R2 with size > 0; restore drill row count matches latest local dump | `rclone ls r2:...` + scratch PG `psql -c '\dt'` |
| SC-7 | Coolify `applications` table has 1 app (koralink-api), 0 staging entries | `coolify-db psql` |
| SC-8 | Coolify `databases` table has 1 db (koralink-db, postgis); 0 staging entries | `coolify-db psql` |
| SC-9 | §6 cutover matrix green on Coolify API URL (dev-login 200 + data read 200) | `curl -i` against Coolify public origin |
| SC-10 | One live OTP end-to-end on prod after flip (Abdullah's phone receives code, verifies) | manual |
| SC-11 | DNS: `api.koralink.sa` (or your chosen hostname) resolves to Coolify public origin; Render still 200 (warm rollback) | `dig +short` + `curl` |
| SC-12 | `turbo run build` zero errors at every slice boundary | terminal output |

## 5. Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Coolify public origin changes IP after container restart | LOW | MED | Cloudflare CNAME hides the IP; doc the Coolify origin in `.deploy-tokens` named `COOLIFY_PROD_ORIGIN` |
| Supabase removal breaks something I missed | LOW | HIGH | Slice 0 = read-only audit first; container stop only; rm only after 7-day grace; rollback = docker compose up with kept .env |
| Offsite backup fails silently | MED | HIGH | One restore drill per cycle; alert path on rclone exit code; bucket size = 0 → Sentry alert |
| Cloudflare token not in `.deploy-tokens` when Slice H runs | CERTAIN until you add it | LOW (slice pauses) | Pause Slice H; rest of cycle still ships |
| You share the staging URL with a friend by mistake | LOW | MED | `:9450`/`:9451` are Tailscale-resolved hostnames, not real domains — friend can't guess |
| Render dies before we cut over | LOW | HIGH | Keep-warm cron keeps it warm; keep `DEV_LOGIN_ENABLED=true` until prod E2E proves OTP works |
| VPS dies before slice D lands | LOW | CRITICAL | Local backup is still on-disk; offsite is the missing leg — slice D is highest priority after Slice 0 |

## 6. Decisions locked (from user message)

1. **Autonomous mode, full 4-Gate cycle.**
2. **Staging = Tailscale only. Prod = public, shareable with friends.** No Tailscale required for friends.
3. **Delete Supabase stack.**

## 7. Gate 1 → 2

Proceed to architecture. No open questions remaining.
