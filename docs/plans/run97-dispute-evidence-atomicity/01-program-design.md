# Run #97 — Program Design (Gates 1-3 compact)

## Problem (user story)
As a player appealing a no-show mark, when two appeal writes race (double-tap, or my
appeal landing while an admin closes the dispute), my appeal reason must never silently
vanish from the evidence timeline. As an admin reopening a decided dispute, a player
appeal appended during my reopen must survive.

## Scope
IN: atomic (locked, status-predicated) evidence append on both write sites;
`booking_slot_id` DTO shape cap; mock upgrades; new concurrency spec; dto-caps block.
OUT: money flows (PARKED), dispute decision logic, notifications, i18n (no user-facing
copy changes — evidence entries are internal), schema/migrations (json column stays).

## Architecture delta (no new modules)
`MatchesService` gains private `appendDisputeEvidenceAtomically(disputeId, entry)`:
```ts
return this.db.transaction(async (tx) => {
  const [locked] = await tx.select({ id, status, evidence }).from(disputes)
    .where(eq(disputes.id, disputeId)).for('update').limit(1);
  if (!locked) throw new NotFoundException('Dispute not found.');
  if (locked.status !== 'opened' && locked.status !== 'under_review')
    throw new ConflictException('Dispute is no longer open.');
  const evidence = Array.isArray(locked.evidence) ? [...locked.evidence, entry] : [entry];
  const [updated] = await tx.update(disputes)
    .set({ evidence: evidence as never })
    .where(and(eq(disputes.id, disputeId),
               inArray(disputes.status, ['opened', 'under_review'])))
    .returning();
  return toMyDispute(updated);
});
```
- Both `createDispute` call-sites (fast path :3587, winner path :3624) delegate to it.
- Plain insert path + winner re-read logic unchanged (run #8 idempotency preserved).
- RMW inside the same tx as the lock = no lost update; predicate = no append-after-close.

`AdminDisputesService.reopen()`: wrap read+append+update in `this.db.transaction`;
lock the row `.for('update')`; keep the `inArray(status,['resolved','rejected'])`
predicate and zero-rows → 400; `audit.log` + `realtime.broadcastOps` AFTER the tx;
audit before/after snapshots keep using full-row `findOne` reads (outside tx).

## API contract (UNCHANGED shapes — Gate 3 checklist)
- `POST /matches/:id/disputes` → `toMyDispute(row)` `{ id, type, status, decision,
  has_appealed, created_at, updated_at }` — byte-identical.
- `GET /matches/:id/disputes/mine` unchanged.
- `POST /admin/disputes/:id/reopen` response = `findOne(id)` full row — unchanged.
- New failure mode: concurrent close during player appeal → 409 ConflictException
  ('Dispute is no longer open.') instead of silent lost append (surfaced via existing
  error pipeline; no new i18n — matches existing plain-Message exceptions on this path).
- ✓ mutation returns fully-populated shape (toMyDispute / findOne) ✓ no field undefined
  ✓ no adapter/i18n deltas.

## TS signatures
```ts
private appendDisputeEvidenceAtomically(
  disputeId: string,
  entry: { action: string; reason?: string; by?: string; at: string },
): Promise<ReturnType<typeof toMyDispute>>;
```

## Tests (jest, apps/api)
1. NEW `matches.dispute-evidence-concurrency.spec.ts` (6-8 cases, hand-rolled mocks per
   dispute-idempotency style): tx used + `.for('update')` lock; resolved → Conflict,
   zero updates; missing row → NotFound; appended array = locked-read + entry (shape
   `{action:'appeal', reason, at}`); fast + winner paths delegate; plain path unaffected.
2. dto-caps.spec.ts: `CreateMatchDto` booking_slot_id block (source assertions:
   `@MaxLength(36)` + `@Matches(` + no `@IsUUID`; validateSync accept valid/uppercase,
   reject 37-char + malformed).
3. Upgrade tx support in dispute-contract + dispute-idempotency mocks (no assertion churn).

## Gates
`npx jest disputes dto-caps` green · `npx tsc --noEmit -p apps/api/tsconfig.json` 0 ·
`npx turbo run build --concurrency=1` 3/3 · PWA vitest green (untouched-area proof).
Delivery: lane branch → PR → bot checks → triage → squash.
