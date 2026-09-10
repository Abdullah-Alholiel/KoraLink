#!/usr/bin/env bash
# KoraLink keep-warm ping — complements the uptime watchdog (2026-09-10 KSU fix).
#
# WHY: prod API runs on Render FREE, which SPINS DOWN when idle (~15 min).
# Overnight lulls killed the in-process underfill auto-cancel cron
# (check-min-players): the 60-min pre-kickoff band fell entirely inside a
# spin-down window, and the morning wake-up auto-COMPLETED underfilled
# matches instead (3 hits in prod). A ping every 10 minutes keeps the
# instance awake so ALL crons (auto-cancel, auto-complete, POTM finalize,
# start reminders) fire 24/7.
#
# Failures are logged, never alerted (the watchdog owns escalation; Render
# down at ping time is exactly what the code-level overdue net now covers).
set -u

STATE_DIR="/home/ubuntu/.local/state"
LOG="$STATE_DIR/koralink-keepwarm.log"
MAXLOG=262144 # 256 KiB
URL="https://koralink-api.onrender.com/api/v1/health"

mkdir -p "$STATE_DIR"
[ -f "$LOG" ] && [ "$(stat -c%s "$LOG" 2>/dev/null || echo 0)" -gt "$MAXLOG" ] && : > "$LOG"

say() { echo "$(date -u '+%Y-%m-%dT%H:%M:%SZ') $*" >> "$LOG"; }

if curl -fsS --max-time 25 "$URL" > /dev/null 2>&1; then
  say "OK ping"
else
  say "FAIL ping (instance down or waking — the overdue underfill net covers cron gaps)"
fi
