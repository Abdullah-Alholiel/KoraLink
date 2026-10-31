# Run #79 — P2-116 Last-Admin Guard TOCTOU — Gate 0 Retrospective

**Cycle:** run #79 (2026-09-27, DB & Infra lane — rotation 79%4=3)
**Item:** P2-116 (Reviewer A IMPORTANT, run #78)

## Area audit (before touching code)

- `apps/api/src/modules/admin/users.service.ts` `update()` (142+): the last-admin
  guard was a plain `SELECT count(*)` (living-admin predicate, run #34 semantics)
  followed by a separate `UPDATE users` — not one transaction, no `FOR UPDATE`.
  Money/roster paths all carry `FOR UPDATE` (joinMatch :1757, startMatch/completeMatch
  3ea4a30, cancelMatch, removePlayer); this moderation guard never got the treatment.
- Precedent pattern: `transactions.service.ts:87-95` (refund) and P2-105
  (`deletePitch`, PR #35) — lock the guarded rows, re-assert, then write.
- Spec conventions in the module: `users.pdpl-guard.spec.ts` renders drizzle
  predicates with `PgDialect.sqlToQuery` and asserts SQL tripwires — reused for the
  new lock spec.
- Reviewer A (run #79, deleg_aaea6084 task-0) DB & Infra sweep: CLEAN — no
  `::uuid` casts, no `eq(col,null)`, journal 46/46 consistent, timestamps ascending,
  i18n parity exact (989/989 PWA, 613/613 admin). Reported `withTimestamp` leads at
  transactions.service.ts:133 / activities:323 / conversations:400 were **REFUTED as
  non-issues by parent verification**: `transactions`/`feed_items`/
  `conversation_participants` all carry `updated_at` with `$onUpdateFn` (schema.ts:270
  pattern), so a `withTimestamp` there is redundant, not a violation (and on
  `transactions` it would be a nonexistent-column trap — that table has NO
  `updated_at`).
- fix:feat ratio last 15 commits: docs/fix-heavy, healthy; no reactive-fix loop.

## Findings classification

- CRITICAL: none.
- IMPORTANT: P2-116 TOCTOU (this cycle's item). Reviewer A snapshot-prune lead =
  known P2-88 (PARTIAL, guard shipped run #71) — no new row. sw.js regeneration
  lead = SERWIST build regenerates it (fallback-*.js churn is the documented
  artifact) — refuted.
- MINOR: bare `.set()` sites relying on `$onUpdateFn` — convention note only, no
  board row.

## Reviewer B (run #79, deleg_aaea6084 task-1)

- Run #78 claims BOTH VERIFIED → P2-104 + P2-114 promoted DONE (nit: correct test
  count is 683, not 685 — commit message is authoritative).
- Product-gap leads all deduped/refuted against the board (see BOARD.md run #79
  header): payments → P0-2, push handler → existing P0-9/P2-76 family, waitlist →
  REFUTED (ships since run #64 note), presence → P2-99, partner self-serve →
  P1-6/P1-12, refund UX → owner-gated with P0-2, admin wallet ledger view →
  backlog line (added).

## Decision

Proceed Gate 1→4 autonomously on P2-116 (small, single tx + spec, zero owner input).
