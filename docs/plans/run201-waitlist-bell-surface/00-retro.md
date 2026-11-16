# Run #201 — Gate 0 Retrospective: waitlist bell surface (P2-348)

**Cycle:** waitlist bell visibility — routed pushes, live bell rows, complete verb labels
**Item:** Reviewer B run-#201 P1 ×3 (verified parent-side) + Reviewer A IMPORTANT-2 context
**Date:** 2026-11-11 (API-modules lane, 201%4=1)

## Owner standards check (DECISIONS.md first)
- No design/UX reversal involved: this closes gaps in the run-#200 waitlist surface
  (bell + push are the P2-333/P2-347 contracted delivery channels — DECISIONS.md has
  no contradicting standard; error/notify copy follows the established
  what/why/next + localized standard, self-directed verbs use name-free copy per the
  `wallet_refunded`/`payout_paid` precedent).
- Promote health: 427 ahead of main · last promote 2026-09-25 · pending migrations: none
  new (0060 rides PR #178, already applied to staging) · P2-51 migrate-first runbook stands.

## What landed since last run (context)
- `93829b2` PR #238 (P2-333): waitlist promotion money loop — underfunded heads skipped,
  free-seat leaks closed, charge surfaced in push + wallet history.
- `a3d3869` PR #239 (P2-347): paid-backfill eviction now notifies (push `waitlist_removed`
  + activity row). **Both LIVE-verified this run** (enum object-check, wallet-history
  `match_title` probe on :3001 with 10/10 rows carrying titles).

## Tech debt found THIS cycle (evidence-cited)
1. **[P1] `waitlist-removed` push tap dead-ends at home** — worker/index.js has no branch
   for `data.type === 'waitlist-removed'` (grep: 12 routed types, not this one); the
   structure test `test/structure/push-notification-click.test.ts:121-136` enumerates the
   contract and was not extended in #239. Run-#24 bug class re-introduced by the newest
   push type — exactly what the test exists to prevent.
2. **[P1] `waitlist_removed` bell row written but invisible** — activities.service.ts
   DIRECTED_VERBS (:56-75) gates BOTH bell queries (:237, :263) + ranking (:297);
   `waitlist_removed` absent → the P2-347 "bell" leg lands nowhere.
3. **[P1] `waitlist_promoted` bell rows render blank since P1-17** — verb IS in
   DIRECTED_VERBS, but the PWA `ActivityVerb` union (useFeed.ts:7-28) lacks it, so
   `VERB_LABEL[item.verb]` → undefined → `t(undefined)` blank row in ActivityCard
   (:35-54) and NotificationSheet (:58-77). Same for `match_rescheduled` (in
   DIRECTED_VERBS since the reschedule feature, never labeled in PWA).
4. **[P2, boarded not built] A-IMPORTANT-2:** waitlist.service.ts:289 `headWallet &&`
   treats a missing users-row as funded → chargeMatchFeeTx aborts the caller tx.
   Forward-looking (purge window), one-line guard — deferred to board row P2-349.
5. **[P2, boarded not built] A-IMPORTANT-1:** matches.service.ts:1987 eviction
   accumulation `?? evicted` overwrite vs sibling `.concat()` — cosmetic asymmetry,
   board row P2-350.

## Precedent applied
- "Fix the pattern, not the instance" (LIKE-escape lesson): the verb-label class covers
  waitlist_promoted + match_rescheduled (live blanks) — all fixed in one slice, with a
  parity tripwire test so the next verb addition cannot ship unlabeled.
- `waitlist_closed` push: VERIFIED NO ACTION — matches.service.ts:1015 reuses the
  ROUTED `match-cancelled` data type; the worker branch exists. Reviewer B's P2 was a
  false alarm on the data contract (copy key ≠ data type).
- venue_ownership verbs: intentionally NOT added to DIRECTED_VERBS this run — they have
  an email channel (mailer.copy.ts:292+) covering the venue-owner audience; documented
  on the board row as accepted scope.

## Verdict
PROCEED to Gate 1. Tracer-bullet sized, no owner dependency, money code untouched.
