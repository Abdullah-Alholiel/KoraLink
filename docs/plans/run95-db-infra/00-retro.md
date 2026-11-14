# Run #95 — Gate 0 Retrospective (DB & Infra lane, 95%4=3)

**Date:** 2026-10-02T10:15Z · **Branch:** staging @ 5a2ff98 → 40ea6a7 (PR #64 merge) → +PR #65

## Carry-in state
- PR #64 (run #94 residual) still OPEN: transfer-venue DRY import; CI webhook never delivered
  for its SHAs (b413fef/a36490e). Empty-commit, close/reopen, workflow_dispatch (PAT 403) all
  failed in run #94.
- Run #94 claims unverified (id-shape.ts, 5 DTOs, SlotWindowQueryDto, spec counts).
- Sentry/journal: no new signatures (API lastSeen ≤09-25 CORS probes; web frozen 09-14).

## Audit findings (this run's area: DB & Infra)
1. **Webhook-flake lesson (process):** the only delivery event that ever worked on this repo is a
   real branch push (`synchronize`). Fix for stuck PRs: merge origin/staging INTO the lane branch
   (resolves any drift honestly) and push — delivered in ~60s after 5 failed nudge types across
   2 runs. Also found `gh pr checks` showed PR #63's green checks on the PR #64 page (branch-run
   attribution) — always verify the run's `headSha` equals the PR head before trusting checks.
2. **Run #94 report accuracy (Reviewer B):** "15/11 test cases" overstated — actual `it(` counts
   13+10 (no `it.each`); jest suites PASS regardless (39 tests across 4 dto-cap suites). Report
   template should carry grep-verifiable numbers.
3. **Id-shape drift completion (Reviewer A):** `app.gateway.ts:35` still carried a private
   `const UUID_SHAPE` copy after PRs #63/#64 — same drift class, WS side. `transfer-venue` fixed
   by PR #64 (merged 40ea6a7 this run).
4. **withTimestamp flags REFUTED:** `transactions` and `feed_items` tables have NO `updated_at`
   column (schema.ts) — the `.set({status:'Reversed'})` / `.set({is_read:true})` updates are
   safe; no withTimestamp trap.
5. **Journal health good:** 46 entries ↔ 46 .sql files, no orphans, no future-dated `when`
   (Reviewer A programmatic check). FK index coverage complete (Reviewer B ran
   scripts/fk-index-report.mjs live: 42 FK columns, 100 indexes, every FK leads an index).
6. **P1-18 stands:** nightly VPS backup timer live (last run 2026-10-02T03:04Z, dumps through
   today), but offsite leg still pending owner storage account (scripts/db-backup.sh header).

## Fix:feat ratio
No new features; 2 refactor/test commits (PR #64 merge + gateway dedup PR #65). Healthy.

## Recommendation
Proceed: reconcile #64 (done), build gateway id-shape dedup + tripwire as the run's vertical
slice, then board/docs.
