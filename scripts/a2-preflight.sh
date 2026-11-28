#!/usr/bin/env bash
# a2-preflight.sh — A2 preflight + restore drill (Life-OS worker D-20261126-02,
# escalated D-20261127-01/-02; executed run #239).
#
# One command that proves the A2 cutover restore path works BEFORE the owner
# session needs it:
#   1. Preflight checks: drill image present, port free, dump present, env names.
#   2. Preserves the newest good prod dump in a folder the 30-day prune skips
#      (db-backup-prod.sh only prunes $BACKUP_DIR/koralink-prod-*.sql.gz).
#   3. Restores that dump into a THROWAWAY PG17+PostGIS container
#      (imresamu/postgis:17-3.5, port 5544, db koralink_drill) with
#      psql -v ON_ERROR_STOP=1.
#   4. Asserts the table count, then applies repo migrations with the
#      standard applier (MIGRATE_DATABASE_URL override -> scripts/migrate-vps.mjs),
#      growing the journal to the repo head.
#   5. EXIT trap always removes the container. NO prod connection is ever made:
#      the dump file is the only prod artifact touched. No prod credentials.
#
# Reversible by construction: container is throwaway, dump is read-only,
# preserved copy is additive. Exit 0 = drill green (table count + migration
# result + file paths printed).
set -euo pipefail

DRILL_NAME="koralink-a2-drill"
IMAGE="imresamu/postgis:17-3.5"
PORT=5544
DRILL_DB="koralink_drill"
DRILL_URI="postgresql://postgres:drillpw@127.0.0.1:${PORT}/${DRILL_DB}?sslmode=disable"
BACKUP_DIR="/home/ubuntu/backups/koralink-prod"
PRESERVE_DIR="/home/ubuntu/backups/koralink-prod-preserved"
REPO="/home/ubuntu/projects/koralink"
# 30 = the dump's base-table count (verified live, run #239). PostGIS adds 2
# views (geography_columns/geometry_columns), so total relations = 32; assert
# BASE TABLEs against the floor below, not the view-inflated total.
EXPECT_TABLES=30

created=0
cleanup() {
  if [ "$created" = "1" ]; then
    docker rm -f "$DRILL_NAME" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT INT TERM
umask 077

echo "── A2 PREFLIGHT ──────────────────────────────────────────"

# 1. Image present locally (docker pull is an OWNER step offline-machine choice).
docker image inspect "$IMAGE" >/dev/null 2>&1 \
  || { echo "PREFLIGHT FAIL: image $IMAGE not present locally"; exit 1; }
echo "OK image $IMAGE present"

# 2. Port free.
if ss -ltn 2>/dev/null | grep -q ":${PORT} "; then
  echo "PREFLIGHT FAIL: port $PORT already in use"
  exit 1
fi
echo "OK port $PORT free"

# 2b. Stale drill container from a SIGKILLed previous run would block every
# later run (created=1 is only set after docker run succeeds — Claude tier-B
# IMPORTANT-2). Fail loud instead; the operator removes it explicitly.
if [ -n "$(docker ps -aq -f name=^${DRILL_NAME}$)" ]; then
  echo "PREFLIGHT FAIL: stale container '$DRILL_NAME' exists — remove it first: docker rm -f $DRILL_NAME"
  exit 1
fi
echo "OK no stale drill container"

# 3. Newest good prod dump present.
DUMP="$(ls -t "$BACKUP_DIR"/koralink-prod-*.sql.gz 2>/dev/null | head -1 || true)"
[ -n "$DUMP" ] || { echo "PREFLIGHT FAIL: no koralink-prod-*.sql.gz in $BACKUP_DIR"; exit 1; }
DUMP_AGE=$(( $(date -u +%s) - $(stat -c%Y "$DUMP") ))
# Size sanity floor: the prod DB is SMALL (full dumps run ~12 KB gzipped —
# staging is 62 KB); the guard exists to catch a corrupt/truncated newest
# file (the 2026-11-21 20-byte failure class), not to enforce a minimum DB
# size. Floor = 4 KB: a real dump always exceeds it, the corrupt class
# (0-100 bytes) never does.
[ "$(stat -c%s "$DUMP")" -gt 4096 ] \
  || { echo "PREFLIGHT FAIL: newest dump suspiciously small (corrupt?): $DUMP"; exit 1; }
# Integrity check BEFORE preserving (Claude tier-B IMPORTANT-3): a truncated
# dump over 4 KB would otherwise land in the never-pruned folder as "good".
gunzip -t "$DUMP" || { echo "PREFLIGHT FAIL: dump fails gzip integrity: $DUMP"; exit 1; }
echo "OK dump $DUMP ($(( $(stat -c%s "$DUMP") )) bytes, gzip-integrity OK, ${DUMP_AGE}s old)"

# 4. Env names the A2 session will need (warn-only — drill does not use them).
for envf in "$REPO/apps/api/.env" "$REPO/apps/player-pwa/.env.local"; do
  [ -r "$envf" ] && echo "OK env present: $envf" || echo "WARN env missing: $envf"
done

# 5. Repo migration applier present.
[ -f "$REPO/scripts/migrate-vps.mjs" ] || { echo "PREFLIGHT FAIL: migrate-vps.mjs missing"; exit 1; }
echo "OK applier scripts/migrate-vps.mjs"

echo "── PRESERVE DUMP OUT OF THE PRUNE SCOPE ─────────────────"
mkdir -p "$PRESERVE_DIR"
PRESERVED="$PRESERVE_DIR/$(basename "$DUMP")"
if [ -f "$PRESERVED" ]; then
  echo "OK already preserved: $PRESERVED"
else
  install -m 600 "$DUMP" "$PRESERVED"
  echo "OK preserved: $PRESERVED"
fi
# Retention cap (Claude tier-B "Missing for optimal"): keep the newest 5
# preserved copies, remove older ones (this folder is out of every prune's
# scope by design — cap it here or it grows forever).
ls -t "$PRESERVE_DIR"/koralink-prod-*.sql.gz 2>/dev/null | tail -n +6 | xargs -r rm -f
echo "OK preserved-folder cap: newest 5 kept"

echo "── RESTORE DRILL (throwaway container) ──────────────────"
created=1  # set BEFORE docker run (Claude tier-B IMPORTANT-2): if the run
           # creates but fails to start, the EXIT trap still cleans up.
docker run -d --name "$DRILL_NAME" -e POSTGRES_PASSWORD=drillpw \
  -e POSTGRES_DB="$DRILL_DB" -p "127.0.0.1:${PORT}:5432" "$IMAGE" >/dev/null

# TCP readiness ONLY (Claude tier-B IMPORTANT-1 — the TRUE ECONNRESET cause):
# plain `pg_isready` answers via the postgis entrypoint's TEMPORARY init
# server (unix socket, no TCP) BEFORE the real server restarts — a restore
# started in that window lands on a server that then resets everything.
# Probing with -h 127.0.0.1 forces real TCP, which only exists once init is
# done. This likely explains run #239's "conntrack race" ECONNRESET.
for i in $(seq 1 60); do
  if docker exec "$DRILL_NAME" pg_isready -h 127.0.0.1 -U postgres -d "$DRILL_DB" >/dev/null 2>&1; then
    break
  fi
  sleep 1
  [ "$i" = "60" ] && { echo "DRILL FAIL: container TCP never became ready"; exit 1; }
done
echo "OK container TCP ready (port $PORT, attempt $i)"

echo "── restoring dump (psql ON_ERROR_STOP=1)..."
# Bounded restore (Claude tier-B MINOR): a hung restore must not block forever.
gunzip -c "$DUMP" | timeout 300 docker exec -i "$DRILL_NAME" \
  psql -U postgres -d "$DRILL_DB" -v ON_ERROR_STOP=1 -q
echo "OK restore completed"

TABLES="$(docker exec "$DRILL_NAME" psql -U postgres -d "$DRILL_DB" -tAc \
  "SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'")"
TOTALS="$(docker exec "$DRILL_NAME" psql -U postgres -d "$DRILL_DB" -tAc \
  "SELECT count(*) FROM information_schema.tables WHERE table_schema='public'")"
if [ "$TABLES" -lt "$EXPECT_TABLES" ]; then
  echo "DRILL FAIL: $TABLES public BASE TABLEs (expected >= $EXPECT_TABLES)"
  exit 1
fi
echo "OK tables restored: $TABLES BASE TABLEs (>= $EXPECT_TABLES; $TOTALS relations incl. PostGIS views)"

# Warmup probe before the applier: the first postgres.js connection straight
# after a bulk restore hit ECONNRESET once (run #239 — non-deterministic).
# Loop until a real parameterized query succeeds or we exhaust retries, so
# the applier never sees the race.
J0="?"
for i in $(seq 1 10); do
  J0="$(docker exec "$DRILL_NAME" psql -U postgres -d "$DRILL_DB" -tAc \
    "SELECT count(*) FROM drizzle.__drizzle_migrations" 2>/dev/null)" && [ -n "$J0" ] && break
  sleep 2
done
echo "OK journal rows in restored dump: $J0"

echo "── applying repo migrations (journal $J0 → repo head)..."
cd "$REPO"

# Host-side TCP probe: after a bulk restore through the same NAT'd port, the
# FIRST host->container TCP connections can ECONNRESET (docker-proxy
# conntrack race, seen twice on run #239) while in-container psql works
# fine. Probe over real TCP with the same driver the applier uses, and only
# proceed when it answers. Then belt-and-braces: retry the applier (it is
# idempotent — atomic per file, journaled hashes) if the race bites anyway.
TCP_OK=0
for i in $(seq 1 12); do
  if node --input-type=module -e "
import pgPkg from 'postgres';
const postgres = pgPkg.default ?? pgPkg;
const sql = postgres(process.argv[1], { max: 1, connect_timeout: 5 });
const r = await sql\`select 1 as ok\`;
console.log(r[0].ok === 1 ? 'TCP_OK' : 'TCP_BAD');
await sql.end({ timeout: 2 });
" "$DRILL_URI" 2>/dev/null | grep -q TCP_OK; then
    TCP_OK=1
    break
  fi
  sleep 3
done
[ "$TCP_OK" = "1" ] || { echo "DRILL FAIL: host TCP to drill DB never became healthy"; exit 1; }
echo "OK host TCP healthy (attempt $i)"

APPLY_OK=0
for attempt in 1 2 3; do
  set +e
  MIGRATE_DATABASE_URL="$DRILL_URI" timeout 300 node scripts/migrate-vps.mjs
  RC=$?
  set -e
  if [ "$RC" = "0" ]; then
    APPLY_OK=1
    break
  fi
  # Exit 5 = deterministic failure (journal gap / missing env contract) —
  # retrying under a "conntrack race?" label would be noise (Claude tier-B
  # MINOR). Only transient classes retry.
  if [ "$RC" = "5" ]; then
    echo "DRILL FAIL: applier exited 5 (deterministic contract failure) — not retrying"
    exit 1
  fi
  echo "WARN applier attempt $attempt failed (rc=$RC) — retrying (idempotent)"
  sleep 5
done
[ "$APPLY_OK" = "1" ] || { echo "DRILL FAIL: migration applier failed 3 attempts"; exit 1; }

# Smoke query on a key table (Claude tier-B "Missing for optimal").
SMOKE="$(docker exec "$DRILL_NAME" psql -U postgres -d "$DRILL_DB" -tAc \
  "SELECT count(*) FROM users" 2>/dev/null || echo QUERY_FAIL)"
[ "$SMOKE" != "QUERY_FAIL" ] || { echo "DRILL FAIL: smoke query on users failed"; exit 1; }
echo "OK smoke query: users row count = $SMOKE"

# Journal must equal the number of repo migration files post-apply.
REPO_FILES="$(ls "$REPO"/apps/api/drizzle/[0-9][0-9][0-9][0-9]_*.sql | wc -l)"
J1="$(docker exec "$DRILL_NAME" psql -U postgres -d "$DRILL_DB" -tAc \
  "SELECT count(*) FROM drizzle.__drizzle_migrations")"
if [ "$J1" -ne "$REPO_FILES" ]; then
  echo "DRILL FAIL: journal rows $J1 != repo migration files $REPO_FILES"
  exit 1
fi
echo "OK journal == repo files: $J1 (drill ran against commit $(git -C "$REPO" rev-parse --short HEAD))"

echo "══════════════════════════════════════════════════════════"
echo "A2 DRILL GREEN"
echo "  tables:           $TABLES"
echo "  journal rows:     $J0 -> $J1"
echo "  dump used:        $DUMP"
echo "  preserved copy:   $PRESERVED"
echo "  throwaway db URI: $DRILL_URI (container removed on exit)"
echo "══════════════════════════════════════════════════════════"
