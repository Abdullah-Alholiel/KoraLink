# run217-release-verify — D-20261119-03 (stale-deploy detection)

## Gate 0 (retro, compact)
Run #216 P0: promote #276's Render deploy crashed at boot; Render rolled back
to the Sep-25 build; every public probe stayed HTTP 200 for weeks. Root cause
of the blind spot: `scripts/release-verify.sh` (and its CI wrapper) verified
reachability only — never WHICH build served. Life-OS worker request
D-20261119-03 (2026-11-19, not an owner decision) asked for exactly this fix.

## Gates 1-3 (program design, compact)
- **Problem**: release-verify cannot distinguish "prod up" from "prod up on
  the RIGHT build".
- **Fix shape**:
  1. `health.controller.ts` adds `commit: process.env.RENDER_GIT_COMMIT`
     (omitted when unset — Render injects it at boot; local/CI boots stay
     field-free so the script can distinguish mismatch vs unknown-build).
  2. `release-verify.sh` gains optional 4th arg `EXPECTED_SHA`. When set:
     health 200 + body must carry `commit == EXPECTED_SHA` (bounded poll
     5×30s for cold-build lag). Missing field OR mismatch = FAIL.
     Unset = legacy behavior byte-identical.
  3. Call-sites updated: `.github/workflows/release-verify.yml` passes
     `${{ github.sha }}`; `scripts/wait-release-deploys.py` passes its known
     `SHA`. Coolify re-point = swap the API_BASE argument only.

## Contract verification
- [x] 3-arg calls (legacy) behave exactly as before — verified live vs local
      services (ALL GREEN, exit 0).
- [x] 4-arg call FAILS on stale prod — verified live: prod (still Sep-25
      build, P0-12 owner GO pending) → `health 200 but body has NO build SHA`
      → exit 1. This is the demanded proof against current prod.
- [x] `health.controller.spec.ts` 4/4 (set/unset/empty + shape), env restored
      delete-when-unset (run-#213 lesson).
- [x] `npx tsc --noEmit` exit 0 (apps/api).
- [x] `bash -n scripts/release-verify.sh` clean.

## Post-promote behavior (the actual guard)
Next promote merge → Render deploys a post-fix SHA → health carries that
commit → script passes ONLY when the NEW build is live. A rollback (the
run-#216 shape) now stamps `release-verify/prod: failure` on the promote
commit and the factory promote-health re-probe sees it.
