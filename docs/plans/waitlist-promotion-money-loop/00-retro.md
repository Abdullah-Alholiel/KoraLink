# Waitlist Promotion Money Loop — Gate 0 Retro (run #200, 2026-11-11)

## Area audit (apps/api/src/modules/matches + wallet + PWA wallet adapter)

- Range reviewed: 5f13dbd..2735687 (run #199 merges) + reviewers A/B on HEAD.
- Reviewer A: green — 3 MINORs (reviews dir-toggle doesn't reset page 1; earnings cadence
  query not parallelized; `dir`-alone contract nit). Boarded as P2-341 candidates, none blocking.
- Reviewer B: 1 CRITICAL + 5 IMPORTANT. Parent code-verified the money two (claims ≠ facts pass):
  - **CONFIRMED CRITICAL** — `waitlist.service.ts` `promoteNextInTx` paid path: underfunded
    queue head → `chargeMatchFeeTx` throws `BadRequestException` (match-fees.ts:93) → the
    CALLER's leave/cancel tx ROLLS BACK. A leaver is wedged while any underfunded player
    sits at the queue head.
  - **CONFIRMED IMPORTANT** — free-seat leaks: `matches.service.ts:1971` (leave ≥4h path)
    and `:4089` (host-kick path) call `promoteNextInTx(tx, matchId)` WITHOUT `feePriceSar`
    → a promoted player gets a PAID seat charged SAR 0. Violates the slice-2 invariant
    "a paid seat can never exist without its payment" (PaymentSheet.tsx:89-91).
- Standing debt in the touched area: wallet history renders `Match Payment #a3b2c1d4`
  (raw reference-id slice) — no match name anywhere (this run's P2-333 surface half).
- Tech-debt note: waitlist has no per-match cap/anti-flood (Reviewer B P2) — NOT boarded as
  build item this run; noted for a later hardening cycle.

## Decision

Build P2-333 re-scoped as "waitlist promotion money loop": fix the wedge + both leaks +
ship the charge surface (push amount + wallet match-title). This is money-path code —
every change is pinned by new/updated specs; PR flow on lane branch; no direct push.

## ADMIN STATE CHECK

Not an admin item (matches/waitlist/wallet/PWA adapter only). `git status` clean at run start.
