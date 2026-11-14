# Run #193 — Gate 0 Retrospective (API modules lane, security lens; 193%4=1)

## Scope audited
Recent-change API surfaces on staging HEAD 3d10f0c: admin audit-list (P2-292 lift, run
#186), wallet (topup verify/reconcile/receipt), gateway (P1-70 eviction, PR #209),
matches (fan-out guards + waitlist subquery). Ledger (kanban/DECISIONS.md) read FIRST —
no design/UX change this cycle touches a ledger row. Fresh owner directive (2026-11-05):
P0-11 Coolify = PLAN FIRST (plan already exists, docs/plans/prod-on-vps.md, approvals
A1-A8 pending owner).

## Findings
- **[IMPORTANT] audit-list pagination contract breach** (Reviewer A #193,
  audit-list.service.ts:47): `ORDER BY a.created_at DESC` has NO unique tiebreaker —
  bulk admin actions stamp the same ms, so rows straddle/duplicate across pages.
  Same query set runs a SECOND `SELECT COUNT(*)` scan instead of `COUNT(*) OVER()`
  in the outer query (the §2026-09-22 pagination standard's exact anti-pattern;
  in-tree precedent: conversations.service.ts:175, reports.service.ts:110).
  → P2-318, built this run.
- Standing bug-class sweep CLEAN (::uuid casts 0 · eq(col,null) 0 · console.* 0 ·
  unguarded mutations 0 — Reviewer A full report). FOR UPDATE present at all money
  serialization points. Hex lane: clean, all 10 metrics at baseline 41/341/26/35/68.
- Sentry triage: 3 signatures, all RESOLVED-CLASS (1C quota lastSeen 10-31 = P1-52
  closure holds; 1F push-subscriptions DELETE failed ONLY during the 10-31 quota
  storm — same root cause, no new bug; CORS-B lastSeen 10-13 = pre-P2-110-fix noise,
  fix proven working). No board additions from triage.
- P2-242/243 verified FIXED in code (match-fees.ts replay pre-check + guarded
  increment; autoCompletePastMatches try/catch fan-out) — board rows closed with
  evidence this run.

## Admin state check (mandatory — candidates touched admin surface)
`git status --short apps/admin apps/api/src/modules/partner apps/api/src/modules/admin*`
→ CLEAN (no in-flight owner work). koralink-admin.service active. Proceed.

## Pick decisions (Phase 3.5)
- P2-278 (fetcher origin allowlist) — already DONE run #176 (PR #194, isApiOrigin gate
  live at fetcher.ts:98); cron-notepad directive was stale. No rebuild.
- Storage slice (pick-order 5) — already built run #170 (PR #186 SeaweedFS +
  media routes + admin upload). Pick-order queue exhausted.
- Pick 1 (hardening, API lane): **P2-318** audit-list pagination + window count.
- Pick 2 (user-visible, P2-152): **P2-257b** Arabic-Indic money numerals outside
  wallet (PaymentSheet/CostFooter/PublishWarningSheet → formatMoney routing).
- Lane (Phase 3.6): SKIPPED — both items are small parent-built slices; lane
  worktree+install overhead disproportionate (precedent: run-#192 parent-built
  P2-317). Recorded per v1.5.0 mandate.
