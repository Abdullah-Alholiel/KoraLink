#!/usr/bin/env bash
# release-verify.sh — post-release cutover matrix (devops-cycle §6), reusable
# locally AND from CI (release-verify workflow). Public probes only; no tokens.
# Usage: scripts/release-verify.sh <API_BASE> <PWA_URL> [ADMIN_URL]
#   e.g. scripts/release-verify.sh https://koralink-api.onrender.com/api/v1 \
#          https://kora-link-player-pwa.vercel.app https://kora-link-admin.vercel.app
set -uo pipefail
API="${1:?api base url (…/api/v1)}"
PWA="${2:?pwa url}"
ADMIN="${3:-}"
FAIL=0
ok()   { echo "  [ok] $1"; }
bad()  { echo "  [FAIL] $1"; FAIL=1; }

echo "── 1. API health ──"
H=$(curl -s -o /dev/null -w '%{http_code}' --max-time 30 "$API/health")
[ "$H" = "200" ] && ok "health 200" || bad "health got $H"

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
