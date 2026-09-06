#!/usr/bin/env bash
# ============================================================================
# KoraLink — E2E RUNNER: full-match JOIN / waitlist-gap pack
# Drives the REAL API (DB → API → HTTP contract) through the join lifecycle:
#   S1 join open match            S5 stale-Full revert + join
#   S2 duplicate join rejected    S6 leave frees a spot (Full → Open)
#   S3 fill to full (Full flip)   S7 host cancel + join-after-cancel
#   S4 join FULL match  → EXPECTED 400 — this IS the P1-17 waitlist gap
# Usage   : bash docs/plans/e2e-waitlist-join/run_e2e.sh
# Env     : API_BASE (default http://localhost:3001/api/v1)
# Needs   : curl, python3, docker (koralink-postgres up), DEV_LOGIN_ENABLED=true
# Never sources apps/api/.env (NODE_ENV leak trap) — DB access via docker exec.
# ============================================================================
set -uo pipefail

BASE="${API_BASE:-http://localhost:3001/api/v1}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
SEED="$ROOT/docs/plans/e2e-waitlist-join/seed_waitlist_e2e.sql"
M1='e2e-waitlist-match-0001'   # FULL 12/12
M2='e2e-waitlist-match-0002'   # CONTROL 5/12
M3='e2e-waitlist-match-0003'   # STALE FULL 6/12

PASS=0; FAIL=0
ok()  { PASS=$((PASS+1)); echo "  ✅ PASS — $1"; }
bad() { FAIL=$((FAIL+1)); echo "  ❌ FAIL — $1"; }

jsonget() { # $1=file $2=path  e.g. ".status" | ".players|length" | ".message"
  python3 - "$1" "$2" <<'PY'
import json, sys
try:
    d = json.load(open(sys.argv[1]))
except Exception:
    print(""); raise SystemExit
v = d
for part in sys.argv[2].lstrip(".").split("|"):
    if part == "length" and isinstance(v, list):
        v = len(v); continue
    if isinstance(v, dict):
        v = v.get(part)
    else:
        v = None; break
print(v if v is not None else "")
PY
}

login() { # $1=user-id → cookie jar /tmp/e2e-wl-$1.jar; echoes phone used
  local uid="$1" jar="/tmp/e2e-wl-$1.jar" phone
  phone=$(docker exec koralink-postgres psql -U koralink -d koralink -t -A -c \
    "SELECT phone FROM users WHERE id='$uid'")
  curl -s -c "$jar" -H 'Content-Type: application/json' \
    -d "{\"phone\":\"$phone\",\"surface\":\"player\"}" \
    "$BASE/auth/dev-login" > /tmp/e2e-wl-login.json
  [ -n "$(jsonget /tmp/e2e-wl-login.json '.token')" ]
}

api() { # $1=jar $2=method $3=path [$4=body] → body in /tmp/e2e-wl-resp.json
  local jar="$1" method="$2" path="$3" body="${4:-}" code
  if [ -n "$body" ]; then
    code=$(curl -s -o /tmp/e2e-wl-resp.json -w '%{http_code}' -b "$jar" -X "$method" \
      -H 'Content-Type: application/json' -d "$body" "$BASE$path")
  else
    code=$(curl -s -o /tmp/e2e-wl-resp.json -w '%{http_code}' -b "$jar" -X "$method" "$BASE$path")
  fi
  # POST mutations return 201 Created (API standard §3) — normalize to 200.
  [ "$method" = "POST" ] && [ "$code" = "201" ] && code=200
  echo "$code"
}

echo "═══ KoraLink E2E — join / waitlist pack ═══"
echo "API: $BASE"

echo "── [0] preflight"
command -v curl >/dev/null || { echo "curl missing"; exit 1; }
command -v python3 >/dev/null || { echo "python3 missing"; exit 1; }
docker ps --format '{{.Names}}' | grep -q '^koralink-postgres$' \
  || { echo "koralink-postgres container not running"; exit 1; }
HEALTH=$(curl -s -o /tmp/e2e-wl-health.json -w '%{http_code}' "$BASE/health")
[ "$HEALTH" = "200" ] && ok "health 200" || bad "health → $HEALTH"

echo "── [1] seed (idempotent)"
docker exec -i koralink-postgres psql -U koralink -d koralink \
  -v ON_ERROR_STOP=1 -q < "$SEED" > /tmp/e2e-wl-seed.log 2>&1 \
  && ok "seed applied" || { bad "seed failed"; tail -20 /tmp/e2e-wl-seed.log; exit 1; }
tail -8 /tmp/e2e-wl-seed.log

echo "── [2] logins (dev-login, player surface)"
for u in e2e-wl-owner e2e-wl-u01 e2e-wl-u02 e2e-wl-u03 e2e-wl-u04 e2e-wl-u05 \
         e2e-wl-u06 e2e-wl-u07 e2e-wl-u08 e2e-wl-u10 e2e-wl-u12; do
  login "$u" && ok "login $u" || bad "login $u (dev-login disabled? check DEV_LOGIN_ENABLED)"
done

echo "── [3] S1: join CONTROL match ($M2, 5/12 → 6/12)"
code=$(api /tmp/e2e-wl-e2e-wl-u12.jar POST "/matches/$M2/join")
players=$(jsonget /tmp/e2e-wl-resp.json '.players|length')
[ "$code" = "200" ] && [ "$players" = "6" ] \
  && ok "u12 joined, roster 6/12" || bad "join → HTTP $code, players=$players"

echo "── [4] S2: duplicate join rejected"
code=$(api /tmp/e2e-wl-e2e-wl-u12.jar POST "/matches/$M2/join")
msg=$(jsonget /tmp/e2e-wl-resp.json '.message')
[ "$code" = "400" ] && echo "$msg" | grep -qi 'already joined' \
  && ok "400 'already joined'" || bad "→ HTTP $code msg=$msg"

echo "── [5] S3: fill CONTROL to full (6 joiners → 12/12, Full flip)"
for n in 01 02 04 06 07 10; do
  code=$(api "/tmp/e2e-wl-e2e-wl-u$n.jar" POST "/matches/$M2/join")
  [ "$code" = "200" ] || bad "u$n join → HTTP $code: $(jsonget /tmp/e2e-wl-resp.json '.message')"
done
status=$(jsonget /tmp/e2e-wl-resp.json '.status')
players=$(jsonget /tmp/e2e-wl-resp.json '.players|length')
[ "$status" = "Full" ] && [ "$players" = "12" ] \
  && ok "12/12, status flipped to Full" || bad "status=$status players=$players"

echo "── [6] S4: join FULL match ($M1) → THE P1-17 WAITLIST GAP PROBE"
code=$(api /tmp/e2e-wl-e2e-wl-u12.jar POST "/matches/$M1/join")
msg=$(jsonget /tmp/e2e-wl-resp.json '.message')
if [ "$code" = "400" ] && echo "$msg" | grep -qi 'full'; then
  ok "400 'Match is full.' — no queue path exists (P1-17 gap CONFIRMED live)"
else
  bad "expected 400 full-guard, got HTTP $code msg=$msg"
fi

echo "── [7] S5: stale-Full match ($M3, 6/12) reverts + admits join"
code=$(api /tmp/e2e-wl-e2e-wl-u07.jar POST "/matches/$M3/join")
status=$(jsonget /tmp/e2e-wl-resp.json '.status')
players=$(jsonget /tmp/e2e-wl-resp.json '.players|length')
[ "$code" = "200" ] && [ "$status" = "Open" ] && [ "$players" = "7" ] \
  && ok "reverted Full→Open, u07 in, 7/12" \
  || bad "→ HTTP $code status=$status players=$players"

echo "── [8] S6: leave frees a spot (Full → Open)"
code=$(api /tmp/e2e-wl-e2e-wl-u06.jar DELETE "/matches/$M2/leave")
status=$(jsonget /tmp/e2e-wl-resp.json '.status')
players=$(jsonget /tmp/e2e-wl-resp.json '.players|length')
[ "$code" = "200" ] && [ "$status" = "Open" ] && [ "$players" = "11" ] \
  && ok "u06 left, back to Open 11/12" \
  || bad "→ HTTP $code status=$status players=$players"

echo "── [9] S7a: re-fill then host cancels"
api /tmp/e2e-wl-e2e-wl-u06.jar POST "/matches/$M2/join" > /dev/null
code=$(api /tmp/e2e-wl-e2e-wl-owner.jar POST "/matches/$M2/cancel")
status=$(jsonget /tmp/e2e-wl-resp.json '.status')
[ "$code" = "200" ] && [ "$status" = "Cancelled" ] \
  && ok "host cancelled, status Cancelled" \
  || bad "→ HTTP $code status=$status msg=$(jsonget /tmp/e2e-wl-resp.json '.message')"

echo "── [10] S7b: join after cancel rejected"
code=$(api /tmp/e2e-wl-e2e-wl-u02.jar POST "/matches/$M2/join")
msg=$(jsonget /tmp/e2e-wl-resp.json '.message')
[ "$code" = "400" ] && echo "$msg" | grep -qi 'no longer open' \
  && ok "400 'no longer open for joining'" || bad "→ HTTP $code msg=$msg"

echo "── [11] DB cross-check (source of truth)"
docker exec koralink-postgres psql -U koralink -d koralink -c \
  "SELECT m.id, m.status, count(mp.id) AS players, m.max_players
     FROM matches m LEFT JOIN match_players mp ON mp.match_id = m.id
    WHERE m.id LIKE 'e2e-%' GROUP BY m.id, m.status, m.max_players ORDER BY m.id;"

echo "═══ RESULT: $PASS passed, $FAIL failed ═══"
[ "$FAIL" = "0" ]
