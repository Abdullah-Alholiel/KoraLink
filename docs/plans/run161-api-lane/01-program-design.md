# Run #161 — Program Design (Gate 2/3)

## Item 1 — P2-244b cancelMatch refund unification

### Change
`apps/api/src/modules/matches/matches.service.ts` cancelMatch, koralink-slot block
(:3362-3388): replace the hand-rolled `UPDATE users SET wallet_balance = wallet_balance + X`
+ `INSERT transactions` with:

```ts
await creditWalletTx(
  tx, userId, refundSar, `refund-${matchId}`, 'REFUND', matchId,
);
```

- Import already present (used for joiner refunds ~24 lines above).
- Key stays `refund-<matchId>` — same key P2-244 chose for the auto-cancel path; a
  match can reach only ONE of the two paths (manual cancel vs auto-cancel both flip
  status via guarded predicates), so keys cannot collide across paths for the same match.
- `creditWalletTx` behavior on failure: replay prior-key → idempotent no-op; vanished
  user row → throws (tx rolls back, whole cancel fails loudly — no ledger-only commit);
  racing UNIQUE violation → clean 409 mapping (added by run #157).

### Specs (match-fees spec file family / matches credit-guard spec)
1. cancel koralink-slot path calls creditWalletTx with key `refund-<matchId>` + amount =
   match.pitch_cost_sar (values pin).
2. vanished user → whole cancel tx rejects (no partial commit).
3. 23505 race on the key → ConflictException (existing mapping covers the rethrow).

### Contract verification checklist (Gate 3)
- [x] Mutation return contract: cancelMatch already returns `this.findOne(matchId)` outside
  the tx — untouched.
- [x] No endpoint shape change; no DTO change; no i18n keys.
- [x] Money sweep rule (Phase 4 pitfall): cancel path already sweeps joiner refunds +
  payout flip + slot release; this change only swaps the HOST credit implementation.
- [x] `refundSar > 0` guard preserved (creditWalletTx no-ops on 0 — free rows still fine).

## Item 2 — P2-246 bulk blackout

### API contract
`POST /api/v1/partner/pitches/:pitchId/slots/blackout` (JwtCookieAuthGuard + PartnerGuard
via controller-level guard already on the partner controller)

Request:
```json
{ "from": "2026-11-01", "to": "2026-11-05", "mode": "instances" }
```
- `from`/`to`: ISO dates (YYYY-MM-DD), required, from <= to, to <= from + 62 days.
- `mode`: enum `instances | series | all`, default `instances`.

Response:
```json
{
  "pitchId": "…",
  "closedInstances": 12,
  "skippedBooked": 2,
  "closedSeries": 0
}
```

### Semantics
- instance blackout: `UPDATE pitch_slots SET is_active=false, updated_at=now()
  WHERE pitch_id=$1 AND is_active=true AND is_booked=false
  AND slot_date BETWEEN $from AND $to` — skippedBooked = COUNT of rows matching range but
  is_booked=true (reported, never touched).
- series blackout: `UPDATE pitch_slot_series SET is_active=false, updated_at=now()
  WHERE pitch_id=$1 AND is_active=true AND series_start_date <= $to
  AND (series_end_date IS NULL OR series_end_date >= $from)` + close FREE instances
  generated from those series (same instance predicate as above — any free instance in
  range; instances keep their series_id linkage so a future "regenerate from series" can
  restore).
- `all` = both updates.
- is_active semantics: verify the live close-one-by-one implementation (existing single-slot
  close in partner.service) and mirror ITS column exactly — if it deletes or flips a
  different flag, adopt that (single source of truth for what "closed" means).

### Files
- `apps/api/src/modules/partner/partner.dto.ts` — BlackoutSlotsDto (class-validator).
- `apps/api/src/modules/partner/partner.service.ts` — blackoutSlots() + specs.
- `apps/api/src/modules/partner/partner.controller.ts` — POST route.
- `apps/api/test/partner.blackout.spec.ts` (or colocated spec, matching existing layout).

### Specs
1. happy path instances: 3 free + 1 booked in range → closedInstances=3, skippedBooked=1,
   booked row untouched (is_booked still true).
2. out-of-range free slots untouched.
3. ownership: pitch of another partner → NotFoundException (parity with existing routes).
4. validation: from > to → 400; range > 62 days → 400.
5. series mode: series flipped is_active=false + free instances closed; booked instance
   of the same series skipped+counted.
6. empty range (nothing matches) → 200 with zeros (idempotent no-op, not 404).

### Contract verification checklist (Gate 3)
- [x] New mutation returns a plain summary object (leaf operation — no relations to join;
  documented in the DTO comment; consistent with generate-slots' summary shape).
- [x] No PWA/admin consumption this slice → no adapter/hook/i18n obligations.
- [x] Ownership guard = same pattern as existing partner slot routes (verify at build time).
- [x] No schema migration needed (column already exists — verified against schema.ts).

## Verification plan (both items)
- `npx jest <touched suites>` per slice; full jest at the end.
- `npx tsc --noEmit -p apps/api/tsconfig.json`.
- `npx turbo run build --concurrency=1` (full gate, once, end of run).
- PR flow: lane branches from ORIGIN/staging → push → gh pr create --base staging →
  gh pr checks → PR-Agent triage → squash-merge → API restart + live probe.

## Verification results
- Item 1: (pending)
- Item 2: (pending)
