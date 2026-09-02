#!/usr/bin/env bash
# KoraLink nightly DB backup — CTO review 2026-09-02 (board P1-18)
# Dumps koralink DB from the koralink-postgres container to local disk,
# 30-day retention. Encrypted offsite copy: PENDING (needs Abdullah's
# storage account — see BOARD.md P1-18).
#
# Scheduled by systemd user timer: koralink-backup.timer (03:00 UTC daily).
set -euo pipefail

BACKUP_DIR="/home/ubuntu/backups/koralink"
CONTAINER="koralink-postgres"
DB_USER="koralink"
DB_NAME="koralink"
RETENTION_DAYS=30
STAMP="$(date -u +%Y%m%d-%H%M%S)"
OUT="$BACKUP_DIR/koralink-$STAMP.sql.gz"

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

# Dump inside the container, compress on the host stream.
docker exec "$CONTAINER" sh -c "pg_dump -U $DB_USER -d $DB_NAME --no-owner" | gzip > "$OUT"
chmod 600 "$OUT"

# Integrity: the gzip must decode cleanly and be non-trivial in size.
gzip -t "$OUT"
SIZE=$(stat -c%s "$OUT")
if [ "$SIZE" -lt 10000 ]; then
  echo "BACKUP FAIL: $OUT suspiciously small ($SIZE bytes)" >&2
  exit 1
fi

# Retention: delete local dumps older than N days.
find "$BACKUP_DIR" -name 'koralink-*.sql.gz' -mtime +$RETENTION_DAYS -delete

echo "BACKUP OK: $OUT ($SIZE bytes, retention ${RETENTION_DAYS}d)"
