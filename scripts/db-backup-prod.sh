#!/usr/bin/env bash
# KoraLink PROD Neon nightly backup (board P1-18, owner go 2026-11-03).
# Dumps prod Neon (ep-rapid-mud) via a PG17 pg_dump client inside the
# momentum-db container (pg_dump major version must be >= server major).
# URI comes from /home/ubuntu/.hermes/profiles/koralink/prod-db-uri.env (0600)
# and is passed to the container via env — never in argv or logs.
# Scheduled by systemd user timer: koralink-backup-prod.timer (03:20 UTC daily).
#
# D-20261121-06 (run #221): ATOMIC writes. The dump lands at $OUT.tmp and is
# promoted to $OUT with mv ONLY after the gzip -t / size / table-count checks
# pass; an EXIT trap removes the tmp on every failure path. Rationale
# (2026-11-21): a Neon-quota failure left a 20-byte koralink-prod-20261121-*.sql.gz
# in the backup dir — a corrupted newest-file that a cutover restore could pick.
set -euo pipefail

ENV_FILE="/home/ubuntu/.hermes/profiles/koralink/prod-db-uri.env"
CLIENT_CONTAINER="momentum-db"
BACKUP_DIR="/home/ubuntu/backups/koralink-prod"
RETENTION_DAYS=30
STAMP="$(date -u +%Y%m%d-%H%M%S)"
OUT="$BACKUP_DIR/koralink-prod-$STAMP.sql.gz"
TMP="$OUT.tmp"

cleanup() { rm -f "$TMP"; }
trap cleanup EXIT

[ -r "$ENV_FILE" ] || { echo "BACKUP FAIL: cannot read $ENV_FILE" >&2; exit 1; }
# shellcheck disable=SC1090
. "$ENV_FILE" 2>/dev/null || true
# Fallback: literal KEY=VALUE parse (immune to shell-special chars in the URI).
[ -n "${MIGRATE_DATABASE_URL:-}" ] || MIGRATE_DATABASE_URL=$(python3 -c "
import sys
for line in open('$ENV_FILE'):
    k, eq, v = line.strip().partition('=')
    if k == 'MIGRATE_DATABASE_URL' and eq:
        print(v.strip().strip('\\\"').strip(\"'\")); break
")
[ -n "${MIGRATE_DATABASE_URL:-}" ] || { echo "BACKUP FAIL: MIGRATE_DATABASE_URL empty" >&2; exit 1; }

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

# Dump inside the container (client pg17), compress on the host stream —
# written to the TMP name; the final name appears only after ALL checks pass.
docker exec -e PGURL="$MIGRATE_DATABASE_URL" "$CLIENT_CONTAINER" \
  sh -c 'pg_dump --no-owner --no-privileges --encoding=UTF8 -d "$PGURL"' | gzip > "$TMP"
chmod 600 "$TMP"

# Integrity: gzip decodes cleanly, non-trivial size, contains schema DDL.
gzip -t "$TMP"
SIZE=$(stat -c%s "$TMP")
if [ "$SIZE" -lt 10000 ]; then
  echo "BACKUP FAIL: dump suspiciously small ($SIZE bytes) — tmp discarded, final name untouched" >&2
  exit 1
fi
TABLES=$(zgrep -c '^CREATE TABLE' "$TMP" || true)
if [ "${TABLES:-0}" -lt 20 ]; then
  echo "BACKUP FAIL: only $TABLES CREATE TABLE statements — dump looks truncated; tmp discarded" >&2
  exit 1
fi

# Promote: the only place the final name is ever created.
mv "$TMP" "$OUT"
chmod 600 "$OUT"

# Retention: delete local prod dumps older than N days.
find "$BACKUP_DIR" -name 'koralink-prod-*.sql.gz' -mtime +$RETENTION_DAYS -delete

echo "BACKUP OK: $OUT ($SIZE bytes, $TABLES tables, retention ${RETENTION_DAYS}d)"
