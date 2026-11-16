# Run #158 — Program Design (Gates 1–3 compact): P2-244

## Problem (Gate 1)
The underfill auto-cancel (`autoCancelExpiringRow`) refunded the host's koralink
slot cost via a hand-rolled ledger INSERT + unguarded balance UPDATE
(matches.service.ts ~925, key `refund-<matchId>`). Every other credit path uses
`creditWalletTx` (replay pre-check, user-existence guard, 23505→409). A vanished
user row would commit a CREDIT ledger row with zero balance movement; a racing
same-key caller would 500 on an unhandled 23505.

User story: as a host whose match is auto-cancelled, my slot refund must behave
exactly like every other refund — idempotent on retry, never a silent
ledger/balance divergence, never a raw 500.

Scope IN: unify the auto-cancel host refund onto creditWalletTx. Scope OUT:
partner settlement batching (P2-241-class), P2-245 moderation Gate cycle,
any schema/i18n/UI change (none needed — API-internal).

## Architecture delta (Gate 2)
No new modules, no schema change, no API shape change. matches.service.ts drops
its direct `transactions`/`users`-refund statements inside the koralink branch
and calls the existing `creditWalletTx` helper (already imported, line 163).
Slot release logic unchanged. Post-commit refund push unchanged (P2-193 shape).

## Contract (Gate 3)
- Signature: `creditWalletTx(tx, row.host_id, refundSar, `refund-${row.id}`,
  'REFUND', row.id)` → Promise<void>; throws BadRequestException (vanished user)
  / ConflictException (23505 race) — caller tx rolls back, `guardWon` path
  returns `cancelled: 0`, nothing durable.
- Amounts: `moneyToNumber(row.pitch_cost_sar)` in, `toFixed(2)` persisted
  (was `.toString()` → '120'; now '120.00' — same numeric value).
- Idempotency key UNCHANGED (`refund-<matchId>`) — historical replays stay
  valid; no migration, no live-data backfill.
- Verification checklist: ledger-first order pinned by spec; 5-case credit-guard
  contract green; 9-case atomicity suite green (7 legacy + 2 new); 38/38 across
  the five auto-cancel/money suites; full API jest 123/123.
