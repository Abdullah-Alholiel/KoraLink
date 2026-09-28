# Run #84 — Gate 0 Retrospective (PWA screens lane, 84%4=0)

**Baseline:** 92ecea4 (run #83 report). Recent cycle: PRs #44/#45/#46 (settings validation,
deletePitch owner-scope, offline chat fallback).

## What landed since last cycle
- PR #44 P2-115 settings validation + audit (verified DONE by run #83)
- PR #45 P2-120 deletePitch owner-scope-in-tx + journal 0043 alignment (DONE)
- PR #46 P2-121 offline chat-history fallback + logout cache purge (DONE — re-verified this run)

## Verification of run #83 claims (executed first, per STATE recipe)
- `conversation-messages-cache` in serving sw.js ✓ · `offlineCachedHistory` EN+AR ✓ ·
  `clearUserRuntimeCaches` in fetcher.ts ✓ · tsc 0 ✓ · pinned suites 32/32 ✓ · parity 992/992 ✓
- Reviewer B independently confirmed all 4 sub-claims (recipe shape, purge wiring, NetworkOnly
  money/auth isolation, i18n key). **P2-121 stays DONE ✅.**

## Tech debt / findings this cycle
- **Reviewer A IMPORTANT ×2 (real, fixed this run):** matches-feed-cache missing from logout
  purge; purge-vs-navigation race on the main sign-out paths. → PR #47.
- **Reviewer A MINOR (fixed this run):** profile purgeDate render-path `new Date()` (hydration
  class) → null-seeded + effect. → PR #47.
- Standing sweep clean: 0 `::uuid`, 0 `eq(col,null)`, 0 console.* (API), z-index lineage conform,
  money/auth NetworkOnly first-registered, parity exact.
- **P2-119 picked** (PWA lane, self-contained): wallet history export + date-range. Lane
  decision: USED (all preconditions: Pro auth ✓, zeroshot 10.7 ✓, non-admin-dirty ✓, no live-DB ✓).

## Reviewer-B product leads (recorded, not boarded as P0/P1)
- Wallet pending/status opacity + refund visibility (owner-gated with P0-2 money path)
- Chat unread/typing states (realtime UX backlog)
- Offline join queued-action state (offline backlog, P2-7-adjacent)
- CSV shape guidance folded INTO P2-119 (ISO timestamps; no balanceAfter promised — no snapshot
  column exists; status column deferred until real money rows exist).

## Admin state check
N/A for the picked item (PWA+API wallet only); spot-check clean anyway (no dirty admin files,
admin service active).
