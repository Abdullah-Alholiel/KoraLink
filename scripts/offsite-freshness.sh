#!/usr/bin/env bash
# Watchdog §8 extension: OFFSITE freshness (D-20261124-01, F9).
# Red: no successful offsite upload ever, or newest success >48h old.
# Amber: newest success >26h old (backup produced but offsite lagging).
# State file: /home/ubuntu/backups/koralink-prod/.offsite/last-success
# The push script appends the newest digest-file mtime on success.
set -u
OFFSITE_DIR="/home/ubuntu/backups/koralink-prod/.offsite"
STATE="$OFFSITE_DIR/last-success"

if [ ! -f "$STATE" ]; then
  echo "OFFSITE RED: no successful offsite upload recorded (state file missing)"
  exit 0
fi
LAST=$(cat "$STATE" 2>/dev/null)
[ -n "$LAST" ] || { echo "OFFSITE RED: empty offsite state"; exit 0; }
LAST_TS=$(date -u -d "$LAST" +%s 2>/dev/null) || { echo "OFFSITE RED: unparseable state '$LAST'"; exit 0; }
AGE_S=$(( $(date -u +%s) - LAST_TS ))
if [ "$AGE_S" -ge 172800 ]; then
  echo "OFFSITE RED: last successful offsite upload $((AGE_S/3600))h ago (>48h)"
elif [ "$AGE_S" -ge 93600 ]; then
  echo "OFFSITE AMBER: last successful offsite upload $((AGE_S/3600))h ago (>26h)"
fi
exit 0
