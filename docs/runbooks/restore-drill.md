# Restore Drill — Nightly Prod Dump (runbook)

**Status:** PROVEN 2026-11-15 (factory run #209). Close-line evidence for D-20261113-09 /
launch condition 5. Repeat quarterly or after any schema/migration change.

## What this proves
The nightly prod dump (`koralink-prod-YYYYMMDD-HHMMSS.sql.gz`,
`koralink-backup-prod.timer` 03:20 UTC → `/home/ubuntu/backups/koralink-prod/`)
restores cleanly into a throwaway Postgres container with **exactly 60 Drizzle
journal rows**, all 30+ tables, and PostGIS live. Restoring prod is possible; the
procedure below is the tested path.

## Preconditions
- Docker on the VPS (rootless agent user can run containers).
- The dump's source is **prod Neon PG 17.x** — the restore container must be
  **PG major 17** and have the **PostGIS extension available** (schema has
  `geography` columns + `CREATE EXTENSION postgis`).
- The dump was produced by psql/pg_restore 17.6 (inside `momentum-db`). Its plain
  SQL contains psql 17.6 meta-commands (`\restrict`) that **older psql clients
  choke on** — restore with a 17.6 client.

## Image selection (ARM64 VPS — hard-won)
| Image | Verdict |
|---|---|
| `postgres:17-alpine` | ❌ no PostGIS extension available |
| `postgis/postgis:17-3.5-alpine` | ❌ no arm64 manifest |
| `postgis/postgis:17-3.5` (amd64 under `--platform`) | ✅ works under emulation; boots in ~35 s |
| `supabase/postgres:17.6.1.136` | ❌ crashes at boot (hardcoded `supabase_admin` init) |

## Procedure (copy-paste)
```bash
# 1. Latest dump
DUMP=$(ls -t /home/ubuntu/backups/koralink-prod/koralink-prod-*.sql.gz | head -1)

# 2. Throwaway container (NEVER restore into prod/staging)
docker run -d --platform linux/amd64 --name koralink-restore-drill \
  -e POSTGRES_PASSWORD=drill -e POSTGRES_DB=drill postgis/postgis:17-3.5
sleep 35 && docker exec koralink-restore-drill pg_isready -U postgres

# 3. Network join: the only arm64 psql 17.6 client lives in momentum-db
docker network connect momentum-supabase_default koralink-restore-drill

# 4. Restore via the momentum-db client (17.6 — handles \restrict)
zcat "$DUMP" | docker exec -i -e PGPASSWORD=drill momentum-db bash -c \
  "psql -h koralink-restore-drill -U postgres -d drill -v ON_ERROR_STOP=1 -q"
```

## Acceptance checks (all must pass)
```bash
docker exec -e PGPASSWORD=drill momentum-db psql -h koralink-restore-drill \
  -U postgres -d drill -At -c "
SELECT 'journal: '||(SELECT COUNT(*) FROM drizzle.__drizzle_migrations);  -- expect 60
SELECT 'tables: '||(SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public');
SELECT 'users: '||(SELECT COUNT(*) FROM users);
SELECT 'postgis: '||(SELECT PostGIS_Full_Version() LIKE '%POSTGIS%');"
```
2026-11-15 (dump `koralink-prod-20261115-032025.sql.gz`, 11.9 KB gzipped,
dumped from prod PG 17.12): journal **60/60**, 32 public tables, users **2**,
activity/settlement/dispute tables present at 0 rows (prod is seed-state
pre-launch), PostGIS OK. Restore elapsed: **2 s**; wall incl. container boot
~15 min (dominated by image pull).

## Teardown
```bash
docker rm -f koralink-restore-drill
rm -f /tmp/restore-drill.sql
```

## Notes
- `ON_ERROR_STOP=1` makes any restore error fatal — RC≠0 means NO silent partial
  restore; treat as failed drill.
- Prod DB mutations are owner-gated (DECISIONS.md 2026-11-03); this drill only
  ever touches a throwaway container.
- If journal count ≠ repo journal entry count, a migration drifted — stop and
  reconcile before trusting the restore (compare against
  `apps/api/drizzle/meta/_journal.json`).
