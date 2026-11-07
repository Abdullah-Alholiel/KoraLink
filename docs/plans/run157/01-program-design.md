# Run #157 — Program Design (Gates 1-3 compact)

**Item:** P2-242 creditWalletTx guards + forfeit ADJUSTMENT retype · P2-243 auto-cancel
post-commit fan-out wrap · **Lane:** `lane/run157-credit-guard` → PR → staging.

## Gate 1 — Product spec

**Problem.** Every refund / forfeit / payout credit in the match money engine flows through
`creditWalletTx`, which (a) did not detect sequential replays of its idempotency key, (b) wrote
the balance increment without checking the user row exists, and (c) surfaced concurrent
same-key races as raw 23505 → 500. A second family of defects: post-commit notification
fan-out in the auto-cancel scheduler path was unguarded — a push-provider throw propagated as
an error after the cancel + refunds had durably committed.

**User story.** As a player being refunded, concurrent actions on my roster episode must never
500 or double-credit me; as an operator, ledger `REFUND` volume must mean money actually
returned to payers (forfeits are host adjustments, not refunds); as the scheduler, an
unreachable push provider must not turn a completed cancellation into an error.

**Scope.** IN: creditWalletTx guards, forfeit reference_type retype, auto-cancel fan-out
try/catch, contract spec. OUT: auto-cancel koralink-slot raw insert unification (P2-244,
later pass), wallet withdraw rail (owner-gated), review moderation (P2-245 backlog).

## Gate 2 — Architecture delta

- `match-fees.ts creditWalletTx` — add replay pre-select (idempotency_key+user_id), wrap
  insert+update in try/catch mapping 23505 → ConflictException, `.returning()` the balance
  UPDATE and 400 on missing row. Mirrors chargeMatchFeeTx exactly (same catch shape; message
  distinct so logs disambiguate join-races from credit-races).
- `matches.service.ts leaveMatch` — forfeit branch: `'REFUND'`/`forfeit:<id>` →
  `'ADJUSTMENT'`/`<episodeId>`. ReferenceType enum already carries ADJUSTMENT (schema.ts:83);
  no migration needed.
- `matches.service.ts autoCompletePastMatches loop` — wrap roster-notify and waitlist-clear
  blocks in try/catch with logger.error; behavior otherwise identical.

## Gate 3 — Contracts

- `creditWalletTx(tx, userId, amountSar, idempotencyKey, referenceType, referenceId):
  Promise<void>` — signature UNCHANGED (all call sites compile untouched). On replay: returns
  normally, zero writes. On vanished user: throws BadRequestException (caller tx rolls back —
  ledger row cannot commit). On 23505: throws ConflictException.
- Ledger contract: UNIQUE(idempotency_key) (schema.ts:548) is the concurrency gate; keys
  unchanged (`refund-join-<episode>`, `host-forfeit-<episode>`).
- reference_id consumers: admin transactions list + users.service anonymization pass-through
  only — no content branching; forfeit retype breaks nothing (verified by grep).
- Spec contract: 5 cases in `matches.credit-guard.spec.ts` (happy / replay no-op / vanished
  row 400 / race 409 / non-23505 untouched).

## Gate 3 verification checklist

- [x] Mutation endpoints unaffected — no signature/return changes; findOne-outside-tx rule untouched.
- [x] Frontend types accept the JSON the backend produces — zero PWA-facing shape change.
- [x] No field silently undefined — n/a (no API shape change).
- [x] i18n keys — none needed (no user-facing strings; log/error messages are internal).
- [x] Enum value exists pre-deployment — ADJUSTMENT in ReferenceType since the original enum.
- [x] Existing money specs still green (refund-matrix, money-notify, wallet, auto-cancel-atomicity).

## Gate 4 — Slices

1. Slice 1 (this PR): guards + retype + wrap + 5-case contract spec. Gates: jest 123/1151,
   turbo 3/3 (sequential), vitest 1041/1041 — all on the lane with a REAL npm ci.
