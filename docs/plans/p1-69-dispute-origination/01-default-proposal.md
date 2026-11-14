# P1-69 Player Dispute Origination — Gate 1/3 Compact (category taxonomy DEFAULT proposed, 48h veto clock starts run #164)

## Status
This run proposes the DEFAULT and STARTS THE 48h VETO CLOCK (per kanban/DECISIONS.md
2026-10-04 register). NO CODE BUILT. A later run (≥ run #166) builds the vertical slice
if no owner veto appears in chat/BOARD.

## Problem (Reviewer B run #163, re-verified run #164)
Players cannot originate a dispute/ticket in-product. Admin has a full disputes console;
urgent-cancel auto-opens tickets; but the only player-side support path is static
"contact support" copy. A player with a wrong refund or partner no-show has no channel.

## DEFAULT taxonomy proposal (the decision this run clocks)
Use the EXISTING `DisputeType` enum unchanged — no new taxonomy needed:
`no_show` · `double_booking` · `pitch_condition` · `unrecognized_charge` · `other`
(schema.ts:142-148). This is the zero-schema-change default: player-originated disputes
reuse the admin console's existing type/status/evidence model 1:1.

Default rationale: admin already triages by these 5; adding player-facing categories
would create a mapping layer with no product gain at current volume.

## Scope when built (NOT this run)
1. API: `POST /disputes` player-side (membership-guarded: reporter is a roster member of
   a match at the venue/match in question; rate-capped; evidence array reuse).
2. PWA: "Report a problem" entry from match-detail (post-match context) + status list
   surface (read-only tracking: opened/under_review/resolved/rejected rides existing
   status enum).
3. i18n: category labels ×2 locales (5 types + status verbs), error-copy standard.
4. Observability: Sentry capture on submit failures; PostHog dispute_opened event.
OUT: admin-side changes (console already complete); money side-effects (P1-29 stays
blocked on P0-2 PSP decision); partner surface (P2-245 fold).

## Success criteria (for the building run)
- Player can file from match-detail with category + evidence, gets localized success
  copy + a tracking surface.
- Admin console lists it immediately (same table, no migration).
- vitest + jest green; turbo 3/3; live probe on :3001.
