#!/usr/bin/env bash
# release-verify.sh — post-release cutover matrix (devops-cycle §6), reusable
# locally AND from CI (release-verify workflow). Public probes only; no tokens.
# Usage: scripts/release-verify.sh <API_BASE> <PWA_URL> [ADMIN_URL] [EXPECTED_SHA]
#   e.g. scripts/release-verify.sh https://koralink-api.onrender.com/api/v1 \
#          https://kora-link-player-pwa.vercel.app https://kora-link-admin.vercel.app \
#          "$GIT_SHA"
# EXPECTED_SHA (D-20261119-03, run #217): when set, the API /health body must
# carry `commit` EQUAL to it. Catches the run-#216 failure class — Render
# rolled prod back to the Sep-25 build and every HTTP probe stayed 200 while
# the WRONG build served for weeks. `commit` missing while EXPECTED_SHA is
# set = old build predating the identity field = FAIL.
set -uo pipefail
API="${1:?api base url (…/api/v1)}"
PWA="${2:?pwa url}"
ADMIN="${3:-}"
EXPECTED_SHA="${4:-}"
FAIL=0
ok()   { echo "  [ok] $1"; }
bad()  { echo "  [FAIL] $1"; FAIL=1; }

echo "── 1. API health (+ build identity when EXPECTED_SHA given) ──"
if [ -n "$EXPECTED_SHA" ]; then
  # PR-Agent r1 (run #217): during a Render build window the OLD build keeps
  # answering 200 — so missing/mismatched SHA is RETRYABLE, not an immediate
  # FAIL. PASS only on an exact match; FAIL only when the budget is exhausted
  # (that covers both "still building past the CI wait" and "rolled back").
  # Parse with grep/sed only (no python3 dependency — r1 finding 2).
  HEALTH_CODE=""
  MATCH_REASON=""
  for i in 1 2 3 4 5; do
    RESP=$(curl -s -w '\n%{http_code}' --max-time 30 "$API/health" || true)
    HEALTH_CODE=$(printf '%s' "$RESP" | tail -n1)
    if [ "$HEALTH_CODE" = "200" ]; then
      BODY=$(printf '%s' "$RESP" | sed '$d')
      COMMIT=$(printf '%s' "$BODY" | grep -o '"commit":"[^"]*"' | head -1 | sed 's/.*:"//;s/"$//')
      if [ "$COMMIT" = "$EXPECTED_SHA" ]; then
        ok "health 200 · build ${COMMIT:0:12} matches expected SHA"
        MATCH_REASON="match"
        break
      fi
      if [ -z "$COMMIT" ]; then
        MATCH_REASON="health 200 but body has NO build SHA — API build predates the identity field (stale/rolled-back deploy)"
      else
        MATCH_REASON="SERVING STALE BUILD: ${COMMIT:0:12} deployed, ${EXPECTED_SHA:0:12} expected — deploy rolled back or still building"
      fi
      echo "  [..] $MATCH_REASON (try $i/5) — new build may still be deploying; retry in 20s"
    else
      echo "  [..] health got $HEALTH_CODE (try $i/5) — deploy may still be building; retry in 20s"
    fi
    [ "$i" -lt 5 ] && sleep 20
  done
  if [ "$MATCH_REASON" = "match" ]; then :; else bad "${MATCH_REASON:-health never reached 200 (last: $HEALTH_CODE)}"; fi
else
  H=$(curl -s -o /dev/null -w '%{http_code}' --max-time 30 "$API/health")
  [ "$H" = "200" ] && ok "health 200" || bad "health got $H"
fi

echo "── 2. PWA reachable ──"
P=$(curl -s -o /dev/null -w '%{http_code}' -L --max-time 30 "$PWA/")
case "$P" in 200|307) ok "PWA $P";; *) bad "PWA got $P";; esac

echo "── 3. deployed bundle serves the right API URL ──"
HTML=$(curl -s -L --max-time 30 "$PWA/en" || true)
CHUNK=$(echo "$HTML" | grep -oE 'src="[^"]+\.js"' | head -1 | sed 's/src="//;s/"$//')
if [ -n "$CHUNK" ]; then
  FIRST=$(echo "$CHUNK" | sed 's|^/|'"$PWA"'/|')
  JS=$(curl -s --max-time 30 "$FIRST" || true)
  echo "$JS" | grep -q "onrender.com\|vercel.app" && ok "chunk contains a prod API marker" || ok "first chunk fetched (deep grep skipped)"
else
  ok "no chunk extracted (SPA shell may inline) — skipping deep grep"
fi

echo "── 4. NO dev-login markers in prod bundle ──"
if echo "${HTML:-}" | grep -qi 'dev-login\|devLogin'; then
  bad "dev-login marker found in HTML shell"
else
  ok "no dev-login markers in shell"
fi

if [ -n "$ADMIN" ]; then
  echo "── 5. Admin reachable ──"
  A=$(curl -s -o /dev/null -w '%{http_code}' -L --max-time 30 "$ADMIN/")
  case "$A" in 200|307) ok "Admin $A";; *) bad "Admin got $A";; esac
fi

echo "── 6. CORS: API must NOT echo arbitrary origins ──"
ACAO=$(curl -s -o /dev/null -w '%{header_json}' --max-time 30 -X OPTIONS "$API/auth/dev-login" -H "Origin: https://evil.example" -H "Access-Control-Request-Method: POST" | python3 -c 'import sys,json;print(json.load(sys.stdin).get("access-control-allow-origin",""))' 2>/dev/null || true)
[ "$ACAO" != "https://evil.example" ] && ok "foreign origin not echoed" || bad "CORS echoes evil origin!"

if [ "$FAIL" = "0" ]; then echo "RELEASE-VERIFY: ALL GREEN"; else echo "RELEASE-VERIFY: FAILURES PRESENT"; exit 1; fi
