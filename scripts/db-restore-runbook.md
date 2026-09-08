# KoraLink DB Restore Runbook (P1-18)

> Restore = DESTRUCTIVE to the target database. Never run against the live
> `koralink` DB without Abdullah's explicit go (stop API first:
> `cd apps/api && npm run restart` is NOT enough — stop the service).

## 1. What exists

- Nightly dumps: `/home/ubuntu/backups/koralink/koralink-<UTC stamp>.sql.gz`
- Timer: `systemctl --user status koralink-backup.timer` (03:00 UTC daily)
- Manual run: `systemctl --user start koralink-backup.service`
- Retention: 30 days locally. Encrypted offsite copy: PENDING (BOARD P1-18).

## 2. Drill — restore into a THROWAWAY DB (safe, repeatable)

```bash
LATEST=$(ls -t /home/ubuntu/backups/koralink/koralink-*.sql.gz | head -1)
gunzip -c "$LATEST" > /tmp/restore-test.sql

docker exec koralink-postgres psql -U koralink -d postgres \
  -c "DROP DATABASE IF EXISTS koralink_restore_test" \
  -c "CREATE DATABASE koralink_restore_test OWNER koralink"

docker exec -i koralink-postgres psql -U koralink -q \
  -d koralink_restore_test < /tmp/restore-test.sql

# Compare table counts (must match):
docker exec koralink-postgres psql -U koralink -d koralink -tAc \
  "select count(*) from information_schema.tables where table_schema='public'"
docker exec koralink-postgres psql -U koralink -d koralink_restore_test -tAc \
  "select count(*) from information_schema.tables where table_schema='public'"

# Cleanup:
docker exec koralink-postgres psql -U koralink -d postgres \
  -c "DROP DATABASE koralink_restore_test"
rm /tmp/restore-test.sql
```

## 3. Real disaster restore (full procedure)

1. Stop writers: `sudo systemctl stop koralink-api` (or the user unit equivalent).
2. Recreate DB: `docker exec koralink-postgres psql -U koralink -d postgres -c "DROP DATABASE koralink" -c "CREATE DATABASE koralink OWNER koralink"`.
3. Restore: `gunzip -c <latest dump> | docker exec -i koralink-postgres psql -U koralink -q -d koralink`.
4. Re-apply PostGIS/GiST bootstrap if the image changed (see `docs/` gist_indexes note).
5. Start API, hit `/api/v1/health`, verify jest smoke of wallet ledger rows.
6. RPO note: nightly dump = up to 24h data loss window. If that ever becomes
   unacceptable, add WAL archiving (board P1-18 rider).

First drill executed 2026-09-02 (lead agent) — see kanban/RUNS for the proof.

## 4. Drill log

- **2026-09-08 (factory run #43, slice 3):** throwaway restore of
  `koralink-20260908-030122.sql.gz` (3237 SQL lines) into
  `koralink_restore_drill_20260908` (uniquely named — no DROP needed to
  re-run). RESTORE_EXIT=0 (only benign setval notices). Verified: tables
  29=29 live vs drill; users 44=44, matches 16=16, transactions 24=24,
  drizzle.__drizzle_migrations 35=35; users CREATE TABLE carries zero
  `skill_level` (post-0035 schema confirmed — the dump's single
  `skill_level` string is the 0035 bookkeeping row itself). NOTE:
  bookkeeping shows 35 rows here vs 37 earlier on Sep 8 — see RUNS #43
  for the dedupe of two phantom 0035 rows (harmless duplicates). Cleanup
  pending (DROP DATABASE needs interactive approval on cron):
  `docker exec koralink-postgres psql -U koralink -d postgres -c "DROP DATABASE koralink_restore_drill_20260908"`.
