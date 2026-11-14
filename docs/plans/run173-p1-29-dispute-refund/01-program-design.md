# Run #173 — Program Design (Gates 1–3 compact): P1-29 dispute refund side-effect

## Problem
Admin can resolve a dispute but no wallet credit/refund side-effect exists for the wronged
player (admin/disputes.service.ts:86 defers it). For paid bookings, resolution without
refund = support dead-end. Unblocked by the Moyasar sandbox decision (real ledger exists).

## User story
As an admin resolving a refund-warranted dispute (unrecognized_charge / pitch_condition /
double_booking), I can credit the reporter's wallet an explicit SAR amount in the SAME
transaction that closes the dispute, so the compensation is atomic with the decision,
idempotent against double-resolves, and visible in the player's wallet ledger.

## Scope
IN: refundAmountSar optional field on ResolveDisputeDto; in-tx CREDIT via creditWalletTx
(idempotency key `dispute-refund-<disputeId>`, per-DISPUTE because one decision closes one
dispute exactly once); admin UI refund field on the resolve form (only when outcome=resolved);
i18n EN+AR; evidence entry in the dispute history; specs.
OUT: player-facing refund request UX; refunds to respondent (fine flows); withdrawal/payout;
Moyasar external refund calls (wallet-internal only — sandbox money is demo money); fee_paid_sar
snapshot manipulation (that's the auto-cancel path's contract, not disputes').

## Architecture delta (no migration — every column/enum needed exists)
`transactions` ledger: type=CREDIT, reference_type=REFUND, reference_id=match_id (nullable →
null when dispute has no match), idempotency_key=`dispute-refund-<disputeId>` (UNIQUE column
gives atomicity + replay for free).

## API contract (Gate 3)
PATCH /admin/disputes/:id/resolve — request: { outcome: 'resolved'|'rejected',
decision?, internalNote?, refundAmountSar? (number >0, ≤2dp, ≤ MIN(TXN amount cap,999999)) }
Response: unchanged populated dispute shape + evidence entry appended:
{ action:'refund', amountSar: '12.50', key: 'dispute-refund-<id>' }.
Errors: refund with outcome=rejected → 400; already-decided → 400 (existing); replay →
original outcome, no double credit (evidence append is outside the money tx — a replayed
resolve hits `decided.length===0` → 400 before any side effect, so evidence is append-once).

TS signature: `async resolve(id: string, dto: ResolveDisputeDto & { refundAmountSar?: number }, adminId: string, ip?: string)`

## Frontend hook/UI contract
Admin: `[id]/page.tsx` resolve() adds `refundAmountSar` to the POST body when set (state +
input, visible when outcome==='resolved' && !CLOSED.has(status), 2dp numeric input, SAR label).
i18n keys (admin en+ar): `refundAmount` label, `refundAmountHint` helper, `refundApplied`
success suffix. Player PWA: none (wallet ledger already renders REFUND rows).

## i18n contract
- apps/admin/src/messages/en.json + ar.json: `disputes.refundAmount` = "Refund amount (SAR)" /
  "مبلغ الاسترداد (ريال)"; `disputes.refundAmountHint` = "Credited to the player's wallet when
  you resolve" / "يُضاف إلى محفظة اللاعب عند الحسم"; `disputes.refundApplied` = "Refunded SAR
  {amount}" / "تم استرداد {amount} ريال". ICU-free (simple interpolation).

## Observability (AGENTS.md §4)
- Pino: `logger.log(`dispute ${id} resolved with refund SAR ${amt}`)` on the credit path.
- Sentry: creditWalletTx failures throw inside the tx → rollback → existing resolve error path
  captures via the global filter. Evidence-append + audit failures stay best-effort (existing
  auditSafe pattern).

## Gate 3 checklist
- [x] Mutation returns populated shape (resolve() already returns this.findOne(id) after tx)
- [x] Admin DTO accepts the exact JSON the UI sends (optional numeric field)
- [x] No field silently undefined (refund evidence only when refund happened)
- [x] i18n keys both languages, listed above
- [x] Money in ONE tx with the status flip (guarded UPDATE runs FIRST — race loser throws
      before any side effect, so no double credit by construction)
- [x] Idempotency: per-dispute key + guarded status predicate (double-resolve 400s)
