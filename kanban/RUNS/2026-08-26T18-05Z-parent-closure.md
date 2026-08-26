# Factory Supplement — Parent-session closure before run #2 (2026-08-26T18:05Z)

**Mode:** parent-session cleanup between run #1 and run #2 (not a factory tick).
**Purpose:** leave the tree clean and STATE.json truthful so run #2 picks up from a stable handoff.

## What was closed (left-behind items from run #1)

1. **P1-3 chat idempotency — completed end-to-end** (run #1 generated migration `0014` +
   applied it to the live DB but never committed it; unique index was live with NO code using
   it → concurrent retried sends would 500 on unique violation).
   - `6351726` feat(db): migration 0014 (match_messages_match_created_idx keyset + partial
     unique match_messages_client_msg_uidx) + schema + journal.
   - `65bac93` fix(api): `onConflictDoNothing()` + winner re-read in BOTH send paths
     (matches.service.ts REST fallback + app.gateway.ts WS /lobby handler).
   - Verified: tsc 0 errors, jest 30/30, vitest 217/217, turbo build 3/3, dist grep-verified,
     API restarted, health 200, unique index confirmed live via pg_indexes (migration 14).
2. **P0-2 wallet top-up — Abdullah decision "keep dummy for now" → interim prod-gate.**
   - `f109cf6` feat(wallet): POST /wallet/topup throws 403 when NODE_ENV=production (mirrors
     dev-login gate); dev/test path unchanged. PWA surfaces `wallet.topupDisabled` (en+ar) on
     403; optimistic rollback intact. New spec wallet.controller.spec.ts (dev credits / prod
     403). Live E2E: dev-login 200 → topup 201 credited 25 SAR.
   - Board: P0-2 BLOCKED → WIP (dummy kept in dev; real provider still tracked).
3. **graphify-out refresh committed** (`974c449`) — run #1's `graphify update` output was
   sitting uncommitted; refreshed against latest code (4229 nodes) and committed so the tree
   is clean and the index reflects chat + wallet changes.

## Runbook patches (from these incidents)

- Phase 4.5 "No half-slices left behind": a migration is never applied to the live DB without
  its code in the same run; end-of-run sweep commits or reverts every own artifact; incomplete
  slices are reverted cleanly, not abandoned.

## Handoff state

- Working tree: CLEAN (only sibling graphify-out handled; no foreign files touched).
- STATE.json: last_run_commits extended through 974c449; in_review_items = P0-1 + P1-3;
  open_blockers = P0-2 (interim mitigation, provider still pending).
- Next: run #2 verifies P0-1 + P1-3 claims, then builds P1-4 (hot-FK indexes) or P1-1 (scheduler).
