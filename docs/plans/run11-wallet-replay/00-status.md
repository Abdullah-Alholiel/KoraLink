# Run #11 Cycle — Wallet replay idempotency (P2-10)

## Gate 0 — Retrospective (compact)

Area audited: `apps/api/src/modules/wallet/wallet.service.ts`, `wallet.controller.ts`, related board items.

- Fix:feat ratio healthy (run #10 built P2-17; no fix-of-fix loops in wallet).
- Reviewer A's 4 findings were independently verified this run: 2 were false
  positives created by phone/display masking of tool output (seed phones,
  push handler), 2 were real-but-minor contract debt (createSlot /
  createDispute bare-row returns — consumers refetch, harmless today).
- Standing bug classes checked in the touched area: no `::uuid` casts, no
  `eq(col, null)`, idempotency already inside the tx (TOCTOU fixed earlier),
  no console.* in API paths.

## Gates 1–3 — Program design (compact)

Problem: `recordTransaction` threw `ConflictException` (409) when a request
reused an `idempotency_key`. A payment-gateway webhook retry — the exact
scenario the key exists for — got an error instead of its original result,
and any concurrent double-fire 500'd on the unique constraint.

User story: as an integrating webhook client, when I retry a delivery with
the same idempotency key, I get the original transaction outcome (201, same
ledger entry) and the wallet is NOT double-moved.

Scope:
- IN: `WalletService.recordTransaction` replay semantics (sequential
  pre-check + concurrent unique-violation race), specs.
- OUT: payment provider integration (P0-2, Abdullah-blocked), controller
  changes, schema changes (no migration needed).

Contract (exact shapes):
- Fresh insert → `201 { ledgerEntry: {...row}, wallet_balance: "726.00" }`
  (unchanged).
- Replay (sequential or race-loser) →
  `201 { replayed: true, ledgerEntry: <ORIGINAL row incl. original id,
  amount, created_at>, wallet_balance: <current balance> }`.
- Insufficient balance → 400 (unchanged). Other unique violations → rethrown
  (not swallowed). Status stays 201 for replays (Stripe-style: the operation
  as-a-whole succeeded exactly once).

TS: `ReplayResult { replayed: true; ledgerEntry: unknown; wallet_balance:
string }`; `isUniqueViolation(err, constraint)` structural guard
(SQLSTATE 23505 + constraint name — no driver-class import).

Gate 3 checklist:
- [x] Mutation still returns fully populated entry (`ledgerEntry` row) —
      replay path returns the ORIGINAL committed row, fresh path unchanged.
- [x] No frontend consumer depends on the 409 (grep: useWallet.ts has no
      Conflict handling; both /wallet/topup and /wallet/pay funnel through
      recordTransaction).
- [x] i18n: no user-facing strings added (API-only contract change).
- [x] No schema change → no migration (Phase 4.5 rule satisfied trivially).

## Gate 4 — Slices

- Slice 1 (this run, complete): replay semantics + 5 new specs + live
  end-to-end probe (dev-login → topup → same-key replay → balance check).
  Verification: jest 112/112 (18 suites), vitest 227/227, `tsc --noEmit` 0
  errors, `turbo run build` 3/3, live replay probe: call2 → 201
  `replayed:true` same ledger id, balance 725→726→726 (no double-credit),
  API restarted AFTER build (00:08:32 > dist 00:06:59).

## Observability note

No new user-facing paths; error paths unchanged (Pino/Sentry already capture
service throws). Replay is a success-path response, intentionally not an
error event.

## Status

| Gate | Name | Status |
|------|------|--------|
| 0 | Retrospective | ✅ DONE |
| 1–3 | Program design (compact) | ✅ DONE |
| 4 | Vertical slice 1 | ✅ DONE (verified live) |
