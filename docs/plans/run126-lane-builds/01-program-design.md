# Run #126 — Gates 1–3 Compact (P2-181 + P2-140)

## Problem
1. **P2-181 (user-visible):** Arabic-first players see ENGLISH success copy on the five core
   match flows (join/leave/cancel/start/complete) — violates the owner EN+AR standard.
2. **P2-140 (hardening, the run's 1-item cap):** the three match status UPDATEs carry no
   status predicate; a future refactor dropping the FOR UPDATE locks would let a losing
   transition silently double-apply side effects (waitlist clear, refund sweep, payout flip).

## User stories
- As an Arabic-first player, joining/leaving/cancelling/starting/completing a match shows
  success copy in my locale (AR natural, RTL-safe, emojis kept).
- As the system, a transition that loses a concurrent race throws 409 BEFORE any side effect.

## Scope
IN: 5 toast keys ×2 locales (`gameDetails.*Toast`), 5 `tMatch()` wirings; predicates +
`.returning({id})` guards + 409 `ConflictException` on startMatch/completeMatch/cancelMatch;
lock-spec mock tx stub extension. OUT: error paths (already localized), disputes.update
contract (by design), admin surfaces (owner WIP hold), DB changes (none).

## Architecture delta
None structural — P2-181 is copy plumbing through the existing next-intl ns; P2-140 mirrors
the disputes-resolve guard pattern (PR #105) inside the existing transactions. No schema,
no endpoints, no new i18n namespaces.

## Contracts (Gate 3 verification — all ✓)
- [✓] No API shape change: mutations still return `this.findOne(id)` OUTSIDE tx (untouched).
- [✓] 409 only when the row's status changed between check and write (previously silent
      double-write) — new failure mode is strictly safer; FE already surfaces ConflictException
      via classifyError ('server' kind detail) — no new FE key required.
- [✓] i18n: 5 new leaf keys in en.json == 5 in ar.json (programmatic parity check OK);
      `gameDetails` ns already mounted in both locales' files (same JSON tree).
- [✓] Lock-spec mock extended where()→{then, returning} — direct-await chains unaffected.
- [✓] Tests: API jest 115 suites/1000 green; PWA vitest 129 files/954 green; tsc 0 (api+pwa);
      type-check 0; turbo build 3/3 sequential on merged staging.

## Third-party APIs
None new (next-intl `useTranslations` and drizzle `inArray`/`returning` already in-repo —
no library reading needed).

## Status
| Gate | Name | Status |
|------|------|--------|
| 0 | Retrospective | ✅ (00-retro.md) |
| 1–3 | Compact design | ✅ this doc |
| 4 | Vertical slices | ✅ PR #119 (P2-140) + PR #120 (P2-181) squash-merged |
