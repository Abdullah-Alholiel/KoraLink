#!/usr/bin/env bash
# deploy-staging.sh — canonical VPS staging deploy (KoraLink).
# Contract: docs/plans/environment-segregation/03-program-design.md (Contract 1)
# Order is FIXED: preflight → sync(ff-only) → deps → build → migrate → assets → restart → verify.
# Exit codes: 0 ok · 1 verify fail · 2 wrong branch · 3 unsafe tree/diverged · 4 build fail · 5 migrate fail
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
TS_NET="aa.tail2948f9.ts.net"

say() { echo "==> $*"; }
die() { echo "[FAIL] $1" >&2; exit "${2:-1}"; }
probe() { # probe <name> <cmd...> — 3 tries, 2s apart
  local name="$1"; shift
  for i in 1 2 3; do
    if "$@" >/dev/null 2>&1; then echo "    [ok] $name"; return 0; fi
    [ "$i" -lt 3 ] && sleep 2
  done
  echo "    [FAIL] $name"; return 1
}

say "STEP 0: preflight"
BRANCH="$(git rev-parse --abbrev-ref HEAD)"
[ "$BRANCH" = "staging" ] || die "deploy-staging must run on branch 'staging' (HEAD=$BRANCH)" 2
if [ -f kanban/LOCK.json ]; then
  die "factory run ACTIVE (kanban/LOCK.json present) — it owns the tree; concurrent builds corrupt .next. Retry after the run releases the lock." 6
fi
command -v node >/dev/null || die "node not found" 2
command -v npm  >/dev/null || die "npm not found" 2
DIRTY="$(git status --porcelain || true)"
if [ -n "$DIRTY" ]; then
  echo "    dirty shared factory tree (logged, never stashed/discarded — builds the tree as-is):"
  echo "$DIRTY" | sed 's/^/      /'
  echo "    safety: merge --ff-only refuses to touch any dirty file git would overwrite;"
  echo "    untracked files can never be clobbered by a merge. WIP deploys to staging by design."
fi

say "STEP 1: sync with origin/staging (fast-forward only — never clobbers dirty files)"
git fetch origin staging
HEAD_SHA="$(git rev-parse HEAD)"
ORIGIN_SHA="$(git rev-parse origin/staging)"
if [ "$HEAD_SHA" = "$ORIGIN_SHA" ]; then
  echo "    already up to date ($HEAD_SHA)"
elif git merge-base --is-ancestor "$HEAD_SHA" "$ORIGIN_SHA"; then
  git merge --ff-only origin/staging
  echo "    fast-forwarded to $ORIGIN_SHA"
elif git merge-base --is-ancestor "$ORIGIN_SHA" "$HEAD_SHA"; then
  echo "    local ahead of origin (unpushed commits) — proceeding with local tree"
else
  die "staging diverged from origin/staging (HEAD=$HEAD_SHA origin=$ORIGIN_SHA) — push or reconcile first" 3
fi

say "STEP 2: deps"
npm install --no-audit --no-fund

say "STEP 3: build (NODE_ENV unset — turbo dev-build trap)"
if ! env -u NODE_ENV npx turbo run build --filter=api --filter=player-pwa --filter=admin --force; then
  die "turbo build failed" 4
fi

say "STEP 4: migrate DB (before any restart — P0-10/P2-51 rule)"
# Anti-foot-gun (same class as the NODE_ENV trap): an ambient
# MIGRATE_DATABASE_URL (Neon runbook, CI drills) must NEVER redirect a
# staging deploy. Staging migrates the .env database, unconditionally.
unset MIGRATE_DATABASE_URL
if ! node scripts/migrate-vps.mjs; then
  die "migration step failed" 5
fi

say "STEP 5: static assets into standalone dirs (PWA hot-edit trap)"
rsync -a --delete apps/player-pwa/public/ apps/player-pwa/.next/standalone/apps/player-pwa/public/
if [ -d apps/admin/public ]; then
  rsync -a --delete apps/admin/public/ apps/admin/.next/standalone/apps/admin/public/
else
  echo "    (no apps/admin/public — skipped)"
fi

say "STEP 6: restart services (order: API → PWA → Admin)"
systemctl --user restart koralink-api.service
systemctl --user restart koralink-pwa.service
systemctl --user restart koralink-admin.service
sleep 4
for svc in koralink-api koralink-pwa koralink-admin; do
  systemctl --user is-active --quiet "$svc.service" || die "$svc not active after restart" 1
  echo "    [ok] $svc active"
done

say "STEP 7: health matrix"
FAIL=0
probe "H1 api /api/v1/health" \
  bash -c "curl -sf --max-time 10 https://$TS_NET:8443/api/v1/health | grep -q '\"status\":\"ok\"'" || FAIL=1
probe "H2 api /health alias" \
  bash -c "curl -sf --max-time 10 https://$TS_NET:8443/health | grep -q 'ok'" || FAIL=1
probe "H3 pwa :9450" \
  bash -c "c=\$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 https://$TS_NET:9450/); [ \"\$c\" = 200 ] || [ \"\$c\" = 307 ]" || FAIL=1
probe "H4 admin :9451" \
  bash -c "c=\$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 https://$TS_NET:9451/); [ \"\$c\" = 200 ] || [ \"\$c\" = 307 ]" || FAIL=1
probe "H5 dev-login (staging only)" \
  bash -c "curl -sf --max-time 10 -X POST https://$TS_NET:8443/api/v1/auth/dev-login -H 'Content-Type: application/json' -d '{\"phone\":\"+966500000001\"}' | grep -q token" || FAIL=1
probe "H6 docker postgres" \
  bash -c "docker exec koralink-postgres pg_isready -U koralink -d koralink 2>&1 | grep -q 'accepting connections'" || FAIL=1

if [ "$FAIL" -ne 0 ]; then
  die "health matrix has failures (see [FAIL] lines above)" 1
fi
echo "[OK] staging deploy complete on $(git rev-parse --short HEAD)"
