# Run #191 — Gate 0 Retro (DB & Infra rotation, 191%4=3)

**Date:** 2026-11-06T15:17Z · **Base:** origin/staging `b05b388` · Tree clean, lock held.

## DECISIONS.md check (ledger supremacy)
Read first — no design/UX change this cycle contradicts any owner standard. Owner-only items
untouched: promote merge (PR #178 stays owner-clicked), prod DB, PSP, credentials.

## Last-cycle state (run #190)
- PR #219 (P2-274 admin LoadingState) **MERGED 01:52Z as `1578dc9`**; Reviewer B verified tree
  + chunk evidence this run; admin service restarted 01:38:52Z on BUILD_ID stEMQZoUwuIEl0hATXqk2
  (postbuild), spinner markup in built chunks. in_review cleared.
- P0-11 plan-only confirmed (docs/plans/prod-on-vps.md §10 A1–A8; no infra touched).

## Health / Sentry (Phase 1.5/1.6)
- 3/3 services active; API health 200; **zero** err-level journald lines in 5h on all three.
- Sentry 24h: zero NEW signatures (1C lastSeen 10-31, 1F 10-31, B 10-13, web-6 10-25 — all
  stale/known). Prod backup fresh (03:23Z today).
- Strix: not due (Nov 6; Nov window satisfied 2026-11-03, `strix_scan=2026-11-03` in STATE).

## Fix:feat ratio / tech debt in the touched area
Dependency advisories are the debt: P2-300 (run #183 finding) recommended the upgrade lane two
runs ago; runs #189/#190 re-queued it. **security.yml `npm-audit` gate is `|| true` report-only
(P1-17a)** — criticals ride silently until the lane lands. This cycle IS the debt payment.

## Audit-lane duty (FIX before HUNT)
- run-4 R4-1 (fetcher Bearer on foreign origins): **FIXED** — `isApiOrigin` gate at
  fetcher.ts:98 + tripwire spec present on staging (P2-278, PR #194). R4-2/3/4 stay
  needs_validation (owner checklist).
- run-5: both findings fixed (PR #209) / boarded (P1-70b). No un-fixed confirmed records →
  no HUNT this run (budget: two build lanes).

## Reviewer findings folded into scope
- Reviewer A MINOR: 61 drizzle .sql files vs 60 journal entries — audited: the extra file is
  `gist_indexes.sql` (unjournaled scratch; 0036/0047 are the journaled GiST migrations) and the
  dup-0014 pair is the known P1-33 historical orphan. **Benign; documented here, no board row.**
- Reviewer A MINOR: socket.io-client manifest skew (pwa ^4.7.5 vs admin ^4.8.3, both lock
  4.8.3) → folded into the dependency slice.
- Reviewer B refutations: PWA per-category push prefs EXIST (P0-5 run #28, profile/page.tsx:499
  + categoryMutes:583) → B-P1-2 demoted, no board row. B-P1-1 (topup pending UX) dup of P2-279/
  P2-287. B-P1-3 (SW stale match-detail after join) → **NEW board row P2-315 (P2)**.
- Reviewer B P2-312 re-scope adopted: position exists on match detail only; gap = feed/my-games
  glanceability → slice ships `your_waitlist_position` on feed+my-matches + my-games chip.

## Verdict
Proceed to Gate 1 with two items: (1) dependency-upgrade lane (security-driven, all-CRITICAL
kill, non-major only), (2) P2-312 my-games waitlist chip (user-visible, PWA).
