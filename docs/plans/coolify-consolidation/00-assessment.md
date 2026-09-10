# Coolify Setup Review & Consolidation — Assessment

**Date:** 2026-09-10 · **Executor:** Lead Agent (fullstack-dev profile) · **Tier:** T1 read-only audit + user-approved cleanup · **Trigger:** Abdullah asked for a tailored review of generic "two Coolify environments (staging/prod)" advice.

---

## 1. Verdict on the pasted advice

The generic recipe ("one Coolify project, staging + production environments, app duplicated per environment, branch mapping, separate DBs, env-scoped vars, resource limits") is **sound in general but wrong for this VPS**:

- It assumes staging lives in Coolify. Ours doesn't — the staging quartet runs as **systemd user units directly from the shared factory repo tree** (`apps/api/dist`, `.next/standalone/…`), which is what `scripts/deploy-staging.sh`, the rsync hot-edit path, and the 4-Gate loop depend on. Migrating staging into Coolify would break the canonical deploy loop for zero benefit.
- The parts worth keeping for the **future prod environment**: single project with per-environment scoping, independent DB per environment, env-scoped variables, and per-container CPU/RAM limits.
- Correct target: **staging stays systemd (untouched); Coolify becomes the Phase-2 production runtime** (API + Postgres/PostGIS containers), with Render kept warm as the armed rollback — exactly the Phase-2 path already defined in the `devops-cycle` skill §8.

## 2. Measured state (2026-09-10, all evidence from live commands)

| Area | Finding | Evidence |
|---|---|---|
| Host | Oracle ARM64, 4 vCPU, 24 GB RAM, **no swap**, disk 59 % (85/145 GB), load ~1.7 | `free -h`, `df -h`, `nproc`, `uptime` |
| Docker | 33 containers: full Coolify stack, full Supabase stack (~3 GB), remote browsers (~2 GB), Multica, KoraLink | `docker ps`, `docker stats --no-stream` |
| Coolify | v4.0.0-beta.462 (Laravel 12.44), 5 core containers healthy; **effectively idle**: 2 projects, 0 managed DBs, both apps dead (`exited:unhealthy`) | `docker exec coolify-db psql -U coolify` |
| Staging quartet | systemd user units `koralink-pwa/admin/api` active; repo-compose `koralink-postgres` healthy (127.0.0.1:5432); API health green via funnel | `systemctl --user`, curl `:8443/api/v1/health` |
| Exposure (host) | **Host firewall empty** (`sudo iptables -S` → 0 rules; no nft ruleset); Docker binds `0.0.0.0` on Coolify UI :8000, Supabase Kong :8001/:8444, pooler :5433/:6544 | `iptables -S`, `docker ps` ports |
| Exposure (outer) | **OCI Security List is the only gate**: external TCP scan (check-host.net, 2 nodes × 13 ports incl. 80/443/8000/8001/8444/5433/6544/8443/9450/10000/3000-3002) → **all closed/filtered** | check-host.net API |
| Exposure (funnels) | **Funnel :10000 is PUBLIC → staging PWA** (dev-login build): `https://aa.tail2948f9.ts.net:10000` returns 307 + `<title>KoraLink</title>`; target PID = `koralink-pwa` MainPID. Funnels bypass the Security List. :8443 funnel serves dev-login API publicly (known, accepted until OTP flip) | `tailscale serve status`, curl, `/proc/<pid>/cgroup` |
| Backups | Local chain GREEN: `koralink-backup.timer` (user systemd, 03:00 UTC), newest dump 2026-09-10 03:05, gzip-verified, 30-day retention, dir 0700. **Offsite leg PENDING** (script header: needs Abdullah's storage account — BOARD P1-18) | `systemctl --user list-timers`, `ls -lht backups/koralink`, script header |
| Orphans (pre-cleanup) | `koralink-{api,pwa,admin}:demo` containers from 2026-09-04 compose experiment (api Exited(1)); not owned by any compose project; redundant with systemd units | `docker ps -a`, compose labels empty |

## 3. Findings

| ID | Severity | Finding | Evidence |
|---|---|---|---|
| P0-a | HIGH | Staging PWA (dev-login build) publicly reachable via funnel :10000 | curl + PID match §2 |
| P0-b | HIGH | Single-gate exposure: one OCI Security List mistake away from exposing Coolify UI :8000 + Supabase :8001/:8444/:5433/:6544 (host firewall empty, 0.0.0.0 binds) | §2 exposure rows |
| P1-a | MED | No swap → OOM risk on build spikes | `swapon --show` empty |
| P1-b | MED | Backup offsite leg still PENDING (hard precondition for Phase 2) | script header |
| P2-a | LOW | Orphan demo containers + dead Coolify app records (cleaned this session) | §5 |
| P2-b | LOW | Coolify `exited:unhealthy` statuses were stale/misleading (VPS Dashboard app was live) | §5 sequence |

## 4. Target topology (tailored)

| | Staging (branch `staging`) | Production (branch `main`, Phase 2) |
|---|---|---|
| Runtime | systemd user units from repo tree — **unchanged, never in Coolify** | Coolify project `koralink` → env `production` (API + Postgres/PostGIS containers, bound localhost/tailnet) |
| PWA/Admin | VPS :9450/:9451 (tailnet) | Vercel ×2 (unchanged) |
| API | funnel :8443 (closes at OTP flip) | Coolify container behind Traefik; Render kept warm as rollback (env re-point) |
| DB | repo-compose PostGIS 127.0.0.1:5432 | Coolify Postgres(+PostGIS) — independent from staging DB, **never shared** |
| Vars | env files per systemd unit | Coolify env-scoped variables + per-container CPU/RAM limits |

## 5. Actions taken 2026-09-10 (user-approved scope only)

**Approved scope:** remove idle containers + dead Coolify apps (images kept). Funnel :10000, port rebinds, and swapfile were offered and **deliberately NOT executed** (not selected).

1. Removed orphan containers `koralink-pwa`, `koralink-admin`, `koralink-api` (`docker rm -f`). Images `koralink-*:demo` kept. Verified: only `koralink-postgres` remains; systemd quartet still active; API health green immediately after.
2. Deleted both dead Coolify applications via API (`DELETE /api/v1/applications/{uuid}` → HTTP 200 ×2; `coolify-db.applications` → 0 rows).
   - ⚠️ Sequence note: pre-delete safety check intended to skip any app owning a live container missed that `VPS Dashboard` **was** Coolify-managed and actually running (Coolify's `exited:unhealthy` status was stale). Result: its Coolify record is deleted but the container **survived** (still Up/healthy, restart=unless-stopped). It is now a standalone container on the `coolify` network. Recreation path below. Lesson recorded: check `coolify.managed` label BEFORE any Coolify app delete, and cross-check container reality against Coolify's status display.
3. No images or volumes deleted; staging services never restarted; no funnel/port/firewall/swap change.

## 6. vps-dashboard recreation runbook (post-Coolify-record-deletion)

- Build source: `/home/ubuntu/vps-dashboard`; full inspect snapshot: `~/.hermes/profiles/fullstack-dev/home/workspace/vps-dashboard-inspect-snapshot.json`.
- Key params: image `vps-dashboard:latest`, restart `unless-stopped`, network `coolify`, mount `/var/run/docker.sock` (ro-capable inspect), no published ports (reached via tailscale serve / vps-portal routing).
- Recreate: `cd /home/ubuntu/vps-dashboard && docker build -t vps-dashboard:latest . && docker run -d --name vps-dashboard --restart unless-stopped --network coolify -v /var/run/docker.sock:/var/run/docker.sock vps-dashboard:latest` (verify against snapshot).

## 7. Phase-2 preconditions (updated after this audit)

Carried from `devops-cycle` §8, plus new items from this audit:

- [ ] **Close public funnel :10000** (staging PWA leak) — user deferred, still open
- [ ] **Rebind to 127.0.0.1**: Coolify :8000, Supabase :8001/:8444/:5433/:6544 (defense-in-depth under the OCI Security List) — user deferred, still open
- [ ] Add swap/OOM guard (8 GB swapfile) — user deferred, still open
- [ ] Backup offsite leg (R2/B2) verified by one restore drill — owner: Abdullah storage account
- [ ] Coolify Postgres bound localhost/tailnet only; never 0.0.0.0
- [ ] Coolify env-scoped vars for prod (NODE_ENV=production, distinct secrets from staging)
- [ ] Per-container CPU/RAM limits on prod containers
- [ ] §6 cutover matrix green on the Coolify deployment; rollback armed = Render env re-point
- [ ] Abdullah explicit go (T2 gate)

## Appendix — key raw evidence

```
$ docker ps --format '{{.Names}}' | grep koralink      (pre-cleanup)
koralink-postgres / koralink-admin / koralink-pwa / koralink-api(Exited(1) 3d)

$ sudo iptables -S | wc -l → 0 ;  nft list ruleset → empty

$ check-host.net TCP ×13 ports ×2 nodes → all closed/filtered (NONE open)

$ tailscale serve status → ":10000 (Funnel on) |-- / proxy http://127.0.0.1:3000"
$ curl -skL https://aa.tail2948f9.ts.net:10000/ar → <title>KoraLink</title>
$ readlink /proc/2105964/cgroup → koralink-pwa.service (MainPID match)

$ curl -s :8443/api/v1/health → {"status":"ok",...}   (pre & post cleanup)
$ docker exec coolify-db psql -U coolify -c 'select uuid from applications;' → 0 rows (post-cleanup)
$ ls -lht ~/backups/koralink | head -1 → koralink-20260910-030506.sql.gz (57K)
```
