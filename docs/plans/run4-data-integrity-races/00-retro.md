# Run #4 — Data-Integrity Races + Moderation Correctness

## Gate 0 — Retrospective (cycle `run4-data-integrity-races`)

**Baseline (verified live this run):** build 3/3 · API jest 64/64 (9 suites) · PWA vitest 217/217 (29 files) · API tsc 0 errors. Services all active, `/api/v1/health` 200, 0 journal errors in 5h.

**Previous-run IN-REVIEW verification (claims ≠ facts):**
- P1-6 Admin partner-portal scope — **CONFIRMED** (partner.service.ts:319 `assertPitchAccess`; `getDashboard`/`getEarnings` accept `actorRole` with `Admin → sql\`true\`` scoping).
- P1-7 markNoShow guard order — **CONFIRMED** (`if (!player)` NotFoundException at matches.service.ts:1415 precedes `wasFlagged = player.no_show` at :1419).
→ Both promote to DONE ✅ this run.

**Area audit (reviewer `deleg_29111c51` + self-verification):**

1. **`AdminSettlementsService.pay` TOCTOU** (settlements.service.ts:65-91): reads `before`, checks `status !== 'pending'`, then UPDATEs with `WHERE eq(id)` — **no `WHERE status='pending'`**. Two concurrent pays both pass the read-check and both write `paid` → double-payout / double-audit. (P2-9.)
2. **`AdminSettlementsService.generatePending` non-atomic + no unique constraint** (settlements.service.ts:99-150): `NOT EXISTS` guard lives in the SELECT; inserts happen in a per-venue loop **outside any transaction**, and `settlements` has **no unique index on `(venue_id, period_start)`**. Concurrent runs double-insert pending rows for the same venue+period. (P2-9.)
3. **`ReportsService.create` dedup TOCTOU** (reports.service.ts:19-56): `select … where status in ('open','reviewing')` then `insert` outside a transaction; no unique index on `(reporter_id, subject_type, subject_id)` for open/reviewing. Concurrent submissions create duplicate reports. (NEW.)
4. **Unban wrong verb** (users.service.ts:188-194): `verb: updates.banned_at ? 'account_banned' : 'account_suspended'` — when an admin **unbans** (`banned_at → null`), the ternary is false → emits `account_suspended`. A reinstated user is told they are *suspended*. (NEW.)

**Root cause pattern:** read-then-write race (`SELECT` guard → `INSERT`/`UPDATE`) not protected by a unique constraint or a `WHERE status=` predicate. Same class as the P1-1 scheduler `eq(col, null)` and the migration-0014 idempotency work already landed.

## Decision

Build the data-integrity races (slices 1-2, backend-only) + the unban verb fix (slice 3, full-stack vertical slice). Each slice committed separately, build+jest+vitest green before each commit.
