# Run #13 — Cycle: auto-cancel refund atomicity (P0-4) + no-show clear vs under-review disputes (P1-21)

## Gate 0 — Retrospective (2026-08-29, pre-build audit)

**Baseline:** run #12 landed `12f9f2d` (time-of-day discovery filter) + `035bad9` (eslint fixes).
Since then (parent session, not this loop): `4b6e939`/`bf288a5` (docs), `fc19518`
(fix(matches): accurate no-show notifications + underfill protection — introduced the Pass-1/Pass-2
underfill scheduler logic this cycle audits).

**Fix:feat ratio (last 15 commits):** predominantly fixes + docs; no reactive loop (>1.5:1) detected.

**Target area audit — `checkMinPlayers` (matches.service.ts:340-460, scheduler tick `*/10`):**

- Pass 2 (auto-cancel below-minimum within 60 min) executes the refund path as **four separate
  auto-committed statements**: guarded status UPDATE → wallet credit → ledger insert → slot release.
  - The guard UPDATE commits FIRST. If any later statement throws (the catch at :409 logs and
    continues), the match is already `Cancelled`, the host's slot stays booked and the refund is
    never retried — **silent money loss in an automated path**.
  - Evidence in code: matches.service.ts:411-415 (guard), :421-437 (credit + ledger outside any tx),
    :439-441 (slot release), all inside a `try` whose catch just logs.
- Contrast: **manual `cancelMatch` (1579-1626) wraps all of it in `this.db.transaction()`** and
  refunds from the same `pitch_cost_sar` column with the same `refund-<matchId>` idempotency key.
  The scheduler path diverged from the manual pattern when `fc19518` added it.
- The `refund-<matchId>` idempotency key makes re-execution safe — the missing piece is only
  **atomicity** (all-or-nothing), not idempotency.
- Findings classification: **CRITICAL** (data-integrity/money), P0-4 on the board.
- Second verified finding (Reviewer A IMPORTANT #3, confirmed in code at :1757-1782): clearing a
  no-show mark force-closes disputes with `status IN ('opened','under_review')` → `rejected`,
  overwriting an **admin-in-flight review**. P1-21 (small slice, same file, bundled this run).

**Pre-gate verification (Gate 0 boundary):** root build + jest + vitest run AFTER implementation;
tree at cycle start: only foreign docs/architecture files (sibling, untouched).

**Recommendation:** proceed to Gates 1-3 (compact) then Gate 4.
