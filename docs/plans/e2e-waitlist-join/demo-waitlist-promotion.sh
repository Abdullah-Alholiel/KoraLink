#!/usr/bin/env bash
# ============================================================================
# Live demo: waitlist auto-promotion on wl-e2e-a-full (14/14 FULL)
# Queue (FIFO): #1 WL E2E Player 15 → #2 Ahmed Al-Rashid → #3 Yousef Al-Qahtani
# Three roster players leave via the REAL API; each leave must auto-seat the
# queue head. Roster stays 14/14; queue drains 3 → 0.
# ============================================================================
set -euo pipefail
API="http://localhost:3001/api/v1"
A="wl-e2e-a-full"
PASS=0; FAIL=0
ck() { if [ "$2" = "$3" ]; then PASS=$((PASS+1)); echo "   PASS $1 [$3]"; else FAIL=$((FAIL+1)); echo "   FAIL $1 — expected [$2], got [$3]"; fi; }
q() { docker exec koralink-postgres psql -U koralink -d koralink -t -A -c "$1"; }
roster() { q "SELECT count(*) FROM match_players WHERE match_id='$A'"; }
status()  { q "SELECT status FROM matches WHERE id='$A'"; }
queue_names() { q "SELECT COALESCE(string_agg(u.full_name || ' (#' || w.position || ')', ' -> ' ORDER BY w.position), '(empty)') FROM match_waitlist w LEFT JOIN users u ON u.id=w.user_id WHERE w.match_id='$A'"; }
in_roster() { q "SELECT count(*) FROM match_players WHERE match_id='$A' AND user_id='$1'"; }
parity() { q "SELECT count(*) FILTER (WHERE team='Home') || 'H/' || count(*) FILTER (WHERE team='Away') || 'A' FROM match_players WHERE match_id='$A'"; }

P15='wl-e2e-p15'; AHMED='664476f0-b872-41d5-b3ef-d782d48bf170'; YOUSEF='8554bde2-7ad0-42e8-9620-3af05ad5f197'

echo "================ BEFORE ================"
echo "roster: $(roster)/14 · status: $(status) · parity: $(parity)"
echo "queue:  $(queue_names)"
ck "p15 not on roster yet" 0 "$(in_roster $P15)"
ck "Ahmed not on roster yet" 0 "$(in_roster $AHMED)"
ck "Yousef not on roster yet" 0 "$(in_roster $YOUSEF)"

# leave PHONE PROMOTED_USER LABEL
leave() {
  local phone=$1 promoted=$2 label=$3 jar resp code
  jar=$(mktemp)
  curl -sS -c "$jar" -X POST "$API/auth/dev-login" -H 'Content-Type: application/json' \
    -d "{\"phone\":\"$phone\",\"surface\":\"player\"}" -o /dev/null
  code=$(curl -sS -o /tmp/leave_resp.json -w '%{http_code}' -X DELETE "$API/matches/$A/leave" -b "$jar")
  rm -f "$jar"
  sleep 0.5
  echo
  echo "== $label left via DELETE /matches/:id/leave (HTTP $code) — seat auto-refilled from queue head:"
  ck "roster back to 14/14" 14 "$(roster)"
  ck "status still Full" "Full" "$(status)"
  ck "$label no longer on roster" 0 "$(in_roster "$(q "SELECT id FROM users WHERE phone='$phone'")")"
  ck "$promoted auto-seated" 1 "$(in_roster "$promoted")"
  echo "   queue now: $(queue_names) · parity: $(parity)"
}

leave '+966570000011' "$P15"   "p11 (roster)"
leave '+966570000012' "$AHMED" "p12 (roster)"
leave '+966570000013' "$YOUSEF" "p13 (roster)"

echo
echo "================ AFTER ================"
echo "roster: $(roster)/14 · status: $(status) · parity: $(parity)"
echo "queue:  $(queue_names)"
ck "queue fully drained" 0 "$(q "SELECT count(*) FROM match_waitlist WHERE match_id='$A'")"
echo
echo "The three former queuees now on the roster:"
docker exec koralink-postgres psql -U koralink -d koralink -c \
  "SELECT u.full_name, mp.team, mp.is_host FROM match_players mp JOIN users u ON u.id=mp.user_id WHERE mp.match_id='$A' AND mp.user_id IN ('$P15','$AHMED','$YOUSEF');"
echo
echo "RESULT: PASS=$PASS FAIL=$FAIL"
[ "$FAIL" = 0 ]
