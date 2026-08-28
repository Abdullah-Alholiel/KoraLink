# Run #8 — createDispute idempotency (Program Design, Gates 1-3 compact)

## Problem
A player double-tapping "appeal no-show" (or two devices, or a network retry) can open two
identical disputes for the same (match, reporter, type) because `createDispute` dedupes with a
non-atomic select-then-insert and no unique constraint.

## Scope (IN / OUT)
- **IN:** partial unique index `disputes_open_uidx` + `onConflictDoNothing` insert + winner
  re-read that attaches the appeal as evidence; reconcile stale migration tracking so
  `db:migrate` works again.
- **OUT:** the dispute return-contract (bare row — already tracked P2-5), dispute message
  replies (P2-2), settlement money-as-numeric (P2-4).

## Contract (Gate 3)

### Index (schema.ts `disputes` table)
```sql
CREATE UNIQUE INDEX "disputes_open_uidx" ON "disputes" (match_id, reporter_id, type)
WHERE status IN ('opened','under_review');
```
Drizzle:
```ts
uniqueIndex('disputes_open_uidx')
  .on(t.match_id, t.reporter_id, t.type)
  .where(sql`${t.status} IN ('opened','under_review')`),
```

### `createDispute` behavior
| Path | Behavior |
|------|----------|
| First appeal | insert (`.onConflictDoNothing().returning()`), `broadcastOps('disputes')`, return created row |
| Sequential retry (existing found) | attach `{action:'appeal', reason, at}` to evidence, return updated row (no insert) |
| Concurrent loser (insert returns 0 rows) | re-read winner by `(match_id, reporter_id, type)` + open status, attach appeal, return winner row (no broadcast) |
| Concurrent loser, no winner | `throw new ConflictException('Dispute conflicted; retry.')` |

## Files changed
- `apps/api/src/database/schema.ts` — add `disputes_open_uidx`.
- `apps/api/src/modules/matches/matches.service.ts` — `createDispute` idempotency.
- `apps/api/src/modules/matches/matches.dispute-idempotency.spec.ts` — 4 jest cases.
- `apps/api/drizzle/0020_medical_norman_osborn.sql` + meta (generated).

## Verification
- `npx tsc --noEmit -p apps/api/tsconfig.json` → 0 errors
- `npx jest` (API) green
- `npm run build` (root) → 3/3
- `npx vitest run` (PWA) green (unaffected)
- `db:migrate` applies 0020 only; live `pg_indexes` shows `disputes_open_uidx`.
