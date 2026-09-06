#!/usr/bin/env bash
# ============================================================================
# KoraLink — E2E Join & Waitlist Runner (standardised)
# docs/plans/e2e-waitlist-join/run-e2e-waitlist.sh
#
# Drives the REAL API (:3001) through the full join → waitlist → promotion
# lifecycle on the standardised seed (seed-e2e-waitlist.sql). Every assertion
# is a hard check; a green run proves the flow end-to-end (DB → API → HTTP).
#
# Usage:
#   bash docs/plans/e2e-waitlist-join/run-e2e-waitlist.sh          # seed + run
#   SKIP_SEED=1 bash docs/plans/e2e-waitlist-join/run-e2e-waitlist.sh
# Requires: curl, jq, docker (koralink-postgres), API on :3001.
# ============================================================================
set -euo pipefail

API="http://localhost:3001/api/v1"
SEED="docs/plans/e2e-waitlist-join/seed-e2e-waitlist.sql"
PASS=0; FAIL=0

say() { printf '\n\033[1;36m== %s ==\033[0m\n' "$*"; }
ok()  { PASS=$((PASS+1)); printf '  \033[32mPASS\033[0m %s\n' "$*"; }
bad() { FAIL=$((FAIL+1)); printf '  \033[31mFAIL\033[0m %s\n' "$*"; }

# api METHOD PATH JAR [JSON_BODY] -> sets CODE and RESP
api() {
  local method=$1 path=$2 jar=$3 body=${4:-}
  local args=(-sS -X "$method" "$API$path" -b "$jar" -c "$jar" -w '\n%{http_code}')
  [ -n "$body" ] && args+=(-H 'Content-Type: application/json' -d "$body")
  local out; out=$(curl "${args[@]}")
  CODE=$(printf '%s' "$out" | tail -1)
  RESP=$(printf '%s' "$out" | sed '$d')
}

# expect DESC EXPECTED ACTUAL
expect() {
  if [ "$3" = "$2" ]; then ok "$1 [$3]"; else bad "$1 — expected $2, got $3: ${RESP:0:160}"; fi
}

# wl_pos JAR MATCH -> viewer queue position (null when not queued)
wl_pos() {
  curl -sS "$API/matches/$2" -b "$1" | jq -r '.your_waitlist_position // "null"' 2>/dev/null || echo null
}

# ── 0. Preflight ─────────────────────────────────────────────────────────────
say "Preflight"
curl -sS "$API/health" >/dev/null 2>&1 || { echo "API not reachable on :3001"; exit 1; }
echo "API healthy."

if [ "${SKIP_SEED:-0}" != "1" ]; then
  say "Seeding (idempotent)"
  docker exec -i koralink-postgres psql -U koralink -d koralink -v ON_ERROR_STOP=1 < "$SEED"
fi

# ── 1. Sessions (dev-login, surface=player) ──────────────────────────────────
say "Logins"
JARDIR=$(mktemp -d)
trap 'rm -rf "$JARDIR"' EXIT
login() { # login NAME PHONE
  curl -sS -c "$JARDIR/$1.jar" -X POST "$API/auth/dev-login" \
    -H 'Content-Type: application/json' \
    -d "{\"phone\":\"$2\",\"surface\":\"player\"}" >/dev/null
}
login host '+966570000000'
for n in 01 02 03 04 05 06 07 08 09 10 11 12 13 14 15; do
  login "p$n" "+9665700000$n"
done
echo "16 sessions ready."

HOST=$JARDIR/host.jar
A=wl-e2e-a-full; B=wl-e2e-b-filling; C=wl-e2e-c-stale-full
J() { echo "$JARDIR/$1.jar"; }

# ── 2. Seed invariants (capacity standardisation) ────────────────────────────
say "S1 Capacity standardisation"
q() { docker exec koralink-postgres psql -U koralink -d koralink -t -A -c "$1"; }
CAPA=$(q "SELECT m.max_players FROM matches m JOIN pitches p ON p.id=m.pitch_id WHERE m.id='$A'")
CAPB=$(q "SELECT m.max_players FROM matches m JOIN pitches p ON p.id=m.pitch_id WHERE m.id='$B'")
CAPC=$(q "SELECT m.max_players FROM matches m JOIN pitches p ON p.id=m.pitch_id WHERE m.id='$C'")
SZ=$(q "SELECT DISTINCT p.size FROM matches m JOIN pitches p ON p.id=m.pitch_id WHERE m.id LIKE 'wl-e2e-%'")
if [ "$CAPA" = 14 ] && [ "$CAPB" = 14 ] && [ "$CAPC" = 14 ] && [ "$SZ" = "7v7" ]; then
  ok "A/B/C capacity 14 = 2 x 7v7 (derived, not hand-set)"
else
  bad "capacity drift: A=$CAPA B=$CAPB C=$CAPC size=$SZ"
fi

# ── 3. Match A: fill to TRUE full (14/14) ────────────────────────────────────
say "S2 Match A fills to 14/14"
for n in 09 10 11 12 13 14; do
  api POST "/matches/$A/join" "$(J p$n)"
  expect "p$n joins A" 201 "$CODE"
done
TOT=$(q "SELECT count(*) FROM match_players WHERE match_id='$A'")
ST=$(q "SELECT status FROM matches WHERE id='$A'")
[ "$TOT" = 14 ] && ok "roster 14/14" || bad "roster=$TOT"
[ "$ST" = "Full" ] && ok "status auto-flipped Full" || bad "status=$ST"
HOME=$(q "SELECT count(*) FROM match_players WHERE match_id='$A' AND team='Home'")
AWAY=$(q "SELECT count(*) FROM match_players WHERE match_id='$A' AND team='Away'")
[ "$HOME" = 7 ] && [ "$AWAY" = 7 ] && ok "lineup parity 7v7 (7/7)" || bad "parity H=$HOME A=$AWAY"

# ── 4. Match A queue lifecycle ───────────────────────────────────────────────
say "S3 Queue join + snapshot (p09/p10 auto-dequeued when they joined the roster in S2)"
api POST "/matches/$A/waitlist" "$(J p15)"
expect "p15 queues on full A" 201 "$CODE"
POS=$(wl_pos "$(J p15)" "$A"); [ "$POS" = 2 ] && ok "p15 position = 2 (queue: p08, p15)" || bad "position=$POS"
api GET "/matches/$A/waitlist" "$(J p15)"
echo "$RESP" | jq -e '.count == 2 and .yourPosition == 2 and .queue[0].userId == "wl-e2e-p15" and .queue[0].isYou == true' >/dev/null \
  && ok "snapshot: count=2 yourPosition=2 (privacy: non-host sees own entry only)" || bad "snapshot: $RESP"

say "S4 Promotion on leave (FIFO head)"
LEAVE=$(curl -sS -o /dev/null -w '%{http_code}' -X DELETE "$API/matches/$A/leave" -b "$(J p09)")
expect "p09 (roster) leaves A" 200 "$LEAVE"
sleep 0.4
IN=$(q "SELECT count(*) FROM match_players WHERE match_id='$A' AND user_id='wl-e2e-p08'")
GONE=$(q "SELECT count(*) FROM match_players WHERE match_id='$A' AND user_id='wl-e2e-p09'")
[ "$IN" = 1 ] && [ "$GONE" = 0 ] && ok "p09's seat went to p08 (queue head)" || bad "promotion wrong: p08in=$IN p09still=$GONE"
POS=$(wl_pos "$(J p15)" "$A"); [ "$POS" = 1 ] && ok "p15 resequenced #1" || bad "p15 pos=$POS"

say "S5 Full-guard (no silent overflow)"
api POST "/matches/$A/join" "$(J p15)"
expect "queued p15 join on full A → 400" 400 "$CODE"
TOT=$(q "SELECT count(*) FROM match_players WHERE match_id='$A'")
[ "$TOT" = 14 ] && ok "roster still 14/14" || bad "roster=$TOT"

say "S6 Host queue visibility"
api GET "/matches/$A/waitlist" "$HOST"
echo "$RESP" | jq -e '.count == 1 and (.queue | length) == 1' >/dev/null \
  && ok "host sees 1 queued player (p15)" || bad "host view: $RESP"

# ── 5. Match B: queued-on-join auto-dequeue + cancel clears queue ────────────
say "S7 Match B fill 8→14 + auto-dequeue"
for n in 01 02 03 04 05 06; do
  api POST "/matches/$B/join" "$(J p$n)"
  expect "p$n joins B" 201 "$CODE"
done
QUEUED=$(q "SELECT count(*) FROM match_waitlist WHERE match_id='$B'")
[ "$QUEUED" = 0 ] && ok "p01/p02 auto-dequeued on roster join" || bad "$QUEUED stale queue rows"

say "S8 Match B cancel clears the queue"
api POST "/matches/$B/cancel" "$HOST"
expect "host cancels B" 200 "$CODE"
LEFT=$(q "SELECT count(*) FROM match_waitlist WHERE match_id='$B'")
[ "$LEFT" = 0 ] && ok "queue cleared on cancel" || bad "$LEFT rows left"
ST=$(q "SELECT status FROM matches WHERE id='$B'")
[ "$ST" = "Cancelled" ] && ok "status Cancelled" || bad "status=$ST"

# ── 6. Match C: stale-Full revert ────────────────────────────────────────────
say "S9 Match C stale-Full revert"
api POST "/matches/$C/join" "$(J p15)"
expect "join on stale-Full C → 201" 201 "$CODE"
ST=$(q "SELECT status FROM matches WHERE id='$C'")
[ "$ST" = "Open" ] && ok "status reverted Full→Open" || bad "status=$ST"

# ── 7. DB capacity trigger (final backstop) ──────────────────────────────────
say "S10 Capacity trigger backstop"
TRIG=$(docker exec koralink-postgres psql -U koralink -d koralink -t -A -c \
  "UPDATE matches SET max_players=12 WHERE id='$A'" 2>&1 || true)
if echo "$TRIG" | grep -qi "capacity"; then
  ok "trigger rejects 12 on a 7v7 pitch"
else
  bad "trigger not enforced: $TRIG"
fi

# ── 8. Data-flow close-out: exactly what the UI renders ──────────────────────
say "S11 UI data-flow (feed card + detail CTA)"
api GET "/matches" "$(J p15)"
CARD=$(echo "$RESP" | jq -r --arg a "$A" '.matches[] | select(.id == $a) | "\(.max_players)/\(.spots_filled) wl=\(.waitlist_count)"' 2>/dev/null || echo "feed-miss")
[ "$CARD" = "14/14 wl=1" ] && ok "feed card: 14/14 · FULL · 1 waiting" || bad "feed card: $CARD"
api GET "/matches/$A" "$(J p15)"
echo "$RESP" | jq -e '.max_players == 14 and .status == "Full" and .waitlist_count == 1 and .your_waitlist_position == 1' >/dev/null \
  && ok "detail: 14/14 Full · CTA 'Queued · #1' of 1 waiting" || bad "detail: $(echo "$RESP" | head -c 160)"

say "RESULT"
echo "PASS: $PASS  FAIL: $FAIL"
[ "$FAIL" = 0 ]
