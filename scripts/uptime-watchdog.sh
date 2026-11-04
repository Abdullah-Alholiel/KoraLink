#!/usr/bin/env bash
# KoraLink uptime watchdog — CTO review 2026-09-02 (board P1-20)
# Checks every 5 min (systemd timer): the three app services, disk space,
# last-nightly-backup freshness. Status lines append to
# /home/ubuntu/.local/state/koralink-watchdog.log (rotated by size below).
# Abdullah-facing escalation (Telegram/email) attaches when the observability
# slice lands — board P1-20 rider; for now failures are visible in the log
# and in `systemctl --user status koralink-watchdog.timer`.
set -u

STATE_DIR="/home/ubuntu/.local/state"
LOG="$STATE_DIR/koralink-watchdog.log"
BACKUP_DIR="/home/ubuntu/backups/koralink"
MAXLOG=1048576 # 1 MiB

mkdir -p "$STATE_DIR"
[ -f "$LOG" ] && [ "$(stat -c%s "$LOG" 2>/dev/null || echo 0)" -gt "$MAXLOG" ] && : > "$LOG"

say() { echo "$(date -u '+%Y-%m-%dT%H:%M:%SZ') $*" >> "$LOG"; }

FAIL=0

# 1. App services must be 'active'.
for svc in koralink-api koralink-pwa koralink-admin; do
  if systemctl --user is-active --quiet "$svc"; then
    say "OK $svc active"
  else
    say "FAIL $svc NOT active"
    FAIL=1
  fi
done

# 2. Postgres container must be running.
if docker inspect -f '{{.State.Running}}' koralink-postgres 2>/dev/null | grep -q true; then
  say "OK koralink-postgres running"
else
  say "FAIL koralink-postgres NOT running"
  FAIL=1
fi

# 3. Disk: root filesystem >85% used is a warning, >92% a failure.
DISK=$(df --output=pcent / | tail -1 | tr -dc '0-9')
if [ "$DISK" -gt 92 ]; then
  say "FAIL disk ${DISK}% full"
  FAIL=1
elif [ "$DISK" -gt 85 ]; then
  say "WARN disk ${DISK}% full"
else
  say "OK disk ${DISK}%"
fi

# 4. Backup freshness: newest dump must be <26h old (nightly + slack).
if [ -d "$BACKUP_DIR" ]; then
  LATEST=$(ls -t "$BACKUP_DIR"/koralink-*.sql.gz 2>/dev/null | head -1)
  if [ -n "$LATEST" ]; then
    AGE=$(( $(date -u +%s) - $(stat -c%Y "$LATEST") ))
    if [ "$AGE" -gt 93600 ]; then
      say "FAIL last backup ${AGE}s old (>26h): $LATEST"
      FAIL=1
    else
      say "OK backup age ${AGE}s"
    fi
  else
    say "FAIL no backups found in $BACKUP_DIR"
    FAIL=1
  fi
fi

# 4b. PROD backup freshness (P2-303, run #184): the Neon prod dumps land via
# koralink-backup-prod.timer (03:20 UTC → /home/ubuntu/backups/koralink-prod).
# Section 4 only watches the STAGING dir — a silently dead prod timer would
# never alarm here. Same 26h threshold (nightly + slack).
PROD_BACKUP_DIR="/home/ubuntu/backups/koralink-prod"
if [ -d "$PROD_BACKUP_DIR" ]; then
  PROD_LATEST=$(ls -t "$PROD_BACKUP_DIR"/koralink-prod-*.sql.gz 2>/dev/null | head -1)
  if [ -n "$PROD_LATEST" ]; then
    PROD_AGE=$(( $(date -u +%s) - $(stat -c%Y "$PROD_LATEST") ))
    if [ "$PROD_AGE" -gt 93600 ]; then
      say "FAIL last PROD backup ${PROD_AGE}s old (>26h): $PROD_LATEST"
      FAIL=1
    else
      say "OK prod backup age ${PROD_AGE}s"
    fi
  else
    say "FAIL no prod backups found in $PROD_BACKUP_DIR"
    FAIL=1
  fi
else
  say "FAIL prod backup dir missing: $PROD_BACKUP_DIR"
  FAIL=1
fi

if [ "$FAIL" -eq 1 ]; then
  say "=== WATCHDOG: FAILURES DETECTED ==="
  exit 1
fi
exit 0
