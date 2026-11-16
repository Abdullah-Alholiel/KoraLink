# DB Conventions — Transaction Isolation & Lock Ordering (money paths)

> Status: **factory-built (owner-optional)** — P2-179b, run #127 (2026-10-13).
> Review checklist line referenced by `koralink-api-standards`. Cite this doc in review
> findings instead of scattered comments.

## Why this exists

Every money/state race fixed to date (P2-9 settlement/report TOCTOU, P1-15 dispute dedup,
P2-49 join/leave locks, P1-13 reschedule slot locks, P2-140 transition predicates) was
caught AFTER the code shipped. The rules below are the pre-emptive version of those fixes.
A money-path PR that violates them should fail review with a pointer to this file.

## Rule 1 — Race safety = guarded UPDATE first, lock where read-modify-write spans rows

KoraLink runs READ COMMITTED (Postgres default). We do **not** use SERIALIZABLE or
explicit isolation levels (`grep -rn isolationLevel apps/api/src` = 0 hits — deliberate).
Correctness comes from making the WRITE carry its own predicate, not from the tx level:

```ts
// The status transition itself refuses to fire unless the row is still valid.
const started = await tx
  .update(matches)
  .set({ status: 'InProgress', ... })
  .where(and(eq(matches.id, matchId), eq(matches.status, 'Full')))
  .returning({ id: matches.id });
if (started.length === 0) throw new ConflictException(...); // race loser, BEFORE side effects
```

Precedents: startMatch/completeMatch/cancelMatch (P2-140, f278415), disputes resolve
(admin/disputes.service.ts:209), settlement pay.

## Rule 2 — Single-row read-modify-write → `SELECT … FOR UPDATE` as the FIRST tx statement

When logic must read the row then branch, lock it immediately — before ANY other
acquisition. Precedents: joinMatch/removePlayer (P2-49), cancelMatch wallet rows,
admin disputes :321/:436, admin reports :208, admin matches :192.

## Rule 3 — Multi-resource acquisition = SORTED lock order, always

Acquire multiple locks in one deterministic global order: **lexicographic by table name,
then by primary-key id inside the same table**. Canonical order:

`match_players` → `matches` → `pitch_slots` → `users` → `venue_favorites` → … (ASCII order
of the table names — `match_players` < `matches` because `_` < `e`).

- `rescheduleMatch` locks both target slots `ORDER BY id` (P1-13) — same-table ordering is
  by id, which IS this rule applied within `pitch_slots`.
- If a future path must lock `matches` + `pitch_slots` in one tx, take the `matches` lock
  FIRST, then the slots. Never acquire in two different orders anywhere in the codebase.

## Rule 4 — `creditWalletTx` / `debitWalletTx` caller contract

`creditWalletTx` (matches/match-fees.ts:112) runs INSIDE the caller's transaction and:
1. Requires an **idempotency key** derived from the EPISODE, not the user:
   `refund-join-<matchPlayerId>`, `host-payout-<matchId>` — a legal leave→rejoin gets a
   new episode id, never collides (P2-1 lesson).
2. Must be preceded (in the same tx) by a **guarded status/row UPDATE** so a concurrent
   double-call loses the race and throws BEFORE any ledger write (payout guard
   `host_payout_state = 'held'` + per-match PRIZE key, rowCount-checked).
3. Never re-derives amounts from `price_per_player` — use persisted snapshots
   (`pitch_cost_sar`, per-seat `fee_paid_sar`).

Callers today: cancelMatch refund sweep, completion payout, forfeit credits. A new caller
must cite this contract in its PR description.

## Rule 5 — Review checklist line (money-path PRs)

- [ ] Status predicates + returning-guards on every state-changing UPDATE (Rule 1)
- [ ] FOR UPDATE as first statement where read-modify-write branches (Rule 2)
- [ ] Multi-lock paths sorted, single order across the codebase (Rule 3)
- [ ] Idempotency keys are episode-derived; replay = same response, not double charge (Rule 4)
- [ ] Amounts from persisted snapshots, never re-derived (Rule 4.3)

## Non-goals

No isolation-level changes, no advisory locks, no new ORM features — the current
guarded-UPDATE + FOR UPDATE pattern is proven across runs #4–#126; this doc pins it.
