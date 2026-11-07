# Run #138 — Gate 0 Retrospective (Admin lane, 2026-10-16T15:16Z)

## DECISIONS.md check (Gate-0 supremacy)
Read first. No contradiction with either item: payout REQUEST moves no external money
(no PSP) — admin `pay()` remains the only external settlement action (P0-2 untouched).
Drawer/bell/i18n standards unaffected.

## ADMIN STATE CHECK (mandatory, runbook Phase 3.5 step 0)
- `git status --short apps/admin apps/api/src/modules/partner` → CLEAN (no owner WIP).
- Recent admin commits: 0c8603e (P2-199 a11y sweep, PR #135), ebd9fd4 (P2-192 optimistic
  version tokens), ac969b5 (P2-178 earnings CSV). Admin service active (port 3002).
- Conclusion: NO HOLD. Admin-lane items buildable.

## Reviewer findings this run (GLM 5.3 Flash ×2, 143s/171s, zero timeouts)
- Reviewer A: 0 CRITICAL / 2 IMPORTANT / 3 MINOR. Both IMPORTANTs are money-path:
  1. `partner.service.ts:327` — dashboard `revenueToday` uses
     `date_trunc('day', scheduled_at) = CURRENT_DATE` (server UTC) while the same
     endpoint's trend uses the Riyadh axis (P2-109). Around 21:00–24:00 UTC the two
     disagree about "today".
  2. `partner.service.ts:661-665` — `totalPending`/`totalPaid` reduce settlement money
     through JS `Number(r.amount)` float arithmetic (P2-4 class). Fix: SQL
     `SUM::numeric(12,2)::text`.
- Reviewer B: run #137 claims PARTIAL-TRUE (substantively verified; nit count drift:
  cors-origin.spec has 16 its not 13; 6 checks not 5; ws-origin.spec lives in
  modules/gateway/). Product P0s boarded: one-click refund without confirmation +
  swallowed failure (transactions/page.tsx:49,244); missing route-level error/loading
  files; a11y gaps on settings/dashboard pages.
- MINORs recorded on board rows (not built): empty-state revenueToday type lie,
  runFullExport silent null, runPrebuilt trackEvent timing.

## Tech debt observed
- Board status cells for P2-145/146 corrupted by backtick-pipe content (row parse broke
  mid-run era); repair this run's Phase 3.
- Stale directive rows (P2-146/147/148 marked as picks in the run notepad) were already
  DONE in runs #103–#108 — pick list drift; corrected in report.

## Item selection (Phase 3.5 mandate)
- USER-VISIBLE: P2-3 partner payout request (replaces read-only dead-end; partner earns
  a real action; admin gets a live-gated approval queue item).
- HARDENING (≤1): Reviewer-A IMPORTANT duo (money display correctness + timezone axis).
- Refused (owner-gated): P2-134, P2-144, P2-145. Refused (dup-PR guard): P2-110/205/207
  (PRs #139/#140/#137 open). P2-208 still RED → queue HOLD stands.
