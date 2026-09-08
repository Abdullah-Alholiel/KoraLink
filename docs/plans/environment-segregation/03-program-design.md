# 03 — Program Design: contracts for deploy tooling + verification (Gate 3)

No API contracts change this cycle (zero endpoint/DTO/schema surface). The contracts that
MUST be exact are the two new tools and the verification matrices.

## Contract 1 — `scripts/deploy-staging.sh` (bash, set -euo pipefail)

```
STEP 0 preflight   : repo root resolved from script location; verify `git rev-parse --abbrev-ref HEAD` == staging
                     (else exit 2); log dirty files (info only, NEVER stash/checkout -f); verify node+npm present.
STEP 1 sync        : git fetch origin staging && git reset --hard origin/staging
                     (hard reset is SAFE for generated dirs and REJECTED for tracked dirty files —
                     abort with exit 3 if any tracked file is dirty EXCEPT kanban/*, docs/**, *.local)
STEP 2 deps        : npm install --no-audit --no-fund  (workspaces)
STEP 3 build       : env -u NODE_ENV npx turbo run build --filter=api --filter=player-pwa --filter=admin --force
                     (turbo cached outputs are ignored; NODE_ENV MUST be unset — dev-build trap)
STEP 4 migrate     : node scripts/migrate-vps.mjs   (see Contract 2; DB BEFORE any restart)
STEP 5 assets      : rsync -a --delete apps/player-pwa/public/ apps/player-pwa/.next/standalone/apps/player-pwa/public/
                     rsync -a --delete apps/admin/public/      apps/admin/.next/standalone/apps/admin/public/ 2>/dev/null || true
STEP 6 restart     : systemctl --user restart koralink-api.service koralink-pwa.service koralink-admin.service
                     sleep 4 (then per-service is-active check)
STEP 7 verify      : health matrix (below); any probe failing after 3 tries (2s apart) = exit 1 with matrix printed
OUTPUT             : one `==> STEP N: name` line per step; final `[OK]` / `[FAIL: reason]` banner
EXIT CODES         : 0 ok · 1 verify fail · 2 wrong branch · 4 build fail · 5 migrate fail · 6 factory lock held
IMPLEMENTED DELTAS (slice 1, battle-tested):
- Preflight ABORTS if kanban/LOCK.json exists (factory run owns the tree; two turbos on the
  same .next corrupt builds — hit live 2026-09-08) → exit 6.
- Dirty-tree policy: LOG everything, BLOCK nothing. git merge --ff-only refuses any file a
  merge would overwrite; untracked files can never be clobbered. The earlier
  allowlist-block design (exit 3) was removed — it fired on the factory's own WIP
  (layout.tsx, new manifest files) which staging exists to test.
- STEP 1 is `git merge --ff-only origin/staging` (NOT reset --hard — clobber risk).
- H4 admin probe over funnel :443 currently 000 (Tailscale serve) — probe H4 recorded,
  fix tracked as follow-up; H1/H2/H3/H5/H6 are the release-blocking set.
```

## Contract 2 — `scripts/migrate-vps.mjs` (node ≥20, no deps beyond `postgres`)

```
INPUT   : apps/api/.env → DATABASE_URL (script loads it; NEVER sourced into shell)
STATE   : drizzle.__drizzle_migrations (hash text, created_at bigint) — create if missing
APPLY   : for each apps/api/drizzle/*.sql in LEXICOGRAPHIC filename order (0036 before 0037; gist_indexes.sql excluded):
          sha256(file) in journal? skip : apply (split on '--> statement-breakpoint', statement-by-statement,
          tolerate 'already exists' duplicate errors only) : insert journal row (hash, Date.now())
OUTPUT  : per file `= applied | skip | already (journal reconciled)`; summary `N pending, M skipped`
EXIT    : 0 always-unless-SQL-error; SQL failure prints failing statement + exits 5 (caller maps to its 5)
IDEMPOT : re-run = all skip, zero writes
```

## Contract 3 — Health matrix (executed by slice 1 and every future deploy)

| # | Probe | Command shape | Pass |
|---|---|---|---|
| H1 | API health | `curl -sf https://aa.tail2948f9.ts.net:8443/api/v1/health` | body contains `"status":"ok"` |
| H2 | API alias | `curl -sf https://aa.tail2948f9.ts.net:8443/health` | same |
| H3 | PWA | `curl -s -o /dev/null -w %{http_code} https://aa.tail2948f9.ts.net:9450/` | 200 or 307 |
| H4 | Admin | `curl -s -o /dev/null -w %{http_code} https://aa.tail2948f9.ts.net/` | 200 or 307 |
| H5 | dev-login | `curl -s -X POST …/auth/dev-login -d '{"phone":"+966500000001"}'` | 200 + `"token"` in body (staging ONLY) |
| H6 | docker PG | `docker exec koralink-postgres pg_isready -U koralink -d koralink` | `accepting connections` |

## Contract 4 — CORS verification matrix (slice 2 / slice 3b)

| # | Probe | Expect |
|---|---|---|
| C1 | `curl -s -i -X OPTIONS https://aa.tail2948f9.ts.net:8443/api/v1/auth/dev-login -H 'Origin: https://aa.tail2948f9.ts.net:9450' -H 'Access-Control-Request-Method: POST'` | `access-control-allow-origin` ECHOES the staging origin |
| C2 | same with `-H 'Origin: https://kora-link-player-pwa.vercel.app'` | header ABSENT (or non-2xx) — Vercel origin rejected by staging |
| C3 | after slice 3b, same against `https://koralink-api.onrender.com` with Vercel origin | echoes Vercel origin |
| C4 | after slice 3b, same against Render with staging origin | header ABSENT — staging rejected by prod |

## Contract verification checklist (Gate 3 → Gate 4)

- [x] Script step order fixed and total (build → migrate → assets → restart → verify) — matches devops-cycle §4
- [x] NODE_ENV never leaks into build (`env -u NODE_ENV`) — pitfall trap
- [x] Dirty-tree policy explicit: kanban/docs/local allowed, src dirty = exit 3 (protects run #44 WIP)
- [x] Migrations BEFORE restarts, journal-reconciled, idempotent re-run — P0-10/P2-51 classes
- [x] drizzle-kit NOT invoked (unavailable on VPS — verified)
- [x] Every probe has an exact command + pass condition (no "check it works")
- [x] Rollback paths named per change: env revert+restart (T1), platform env revert (T2), git revert+redeploy (code)
- [x] Public-bundle changes gated T2 with diff-first (Render/Vercel/promote)
