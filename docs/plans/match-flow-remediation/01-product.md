# Gate 1 — Product Spec: Match Flow & State Remediation

**Feature:** `match-flow-remediation`  
**Date:** 2026-08-09

---

## User Stories

| ID | Story | Priority |
|----|-------|----------|
| US-1 | As a player, tapping anywhere on a match card navigates to match detail | P0 |
| US-2 | As a player, after joining a match, the UI immediately shows "Joined" with roster update | P0 |
| US-3 | As a player, my wallet transactions (join payment) appear in history | P0 |
| US-4 | As a player, "My Games" updates immediately after joining/leaving a match | P1 |
| US-5 | As a joined player, I can tap "View Match Rules" to see rules in a bottom sheet | P1 |
| US-6 | As a joined player, I can open the match discussion chat | P1 |

## Acceptance Criteria

| # | Criterion |
|---|-----------|
| AC-1 | Tapping any area of MatchCard (title, avatar, spots, price) navigates to `/match/:id` |
| AC-2 | Wallet page shows all transactions including match join payments |
| AC-3 | After joining, My Games shows the joined match without manual refresh |
| AC-4 | After joining, match detail shows "Joined" badge within 2 seconds |
| AC-5 | "View Match Rules" opens a bottom sheet with match rules |
| AC-6 | Messages icon on joined match detail navigates to discussion chat |
| AC-7 | `turbo run build` zero errors |
| AC-8 | `npx vitest run` 85/85 pass |

## Mockups

See `docs/plans/match-flow-remediation/mockups/`:
- `joined-state.html` — Match detail after joining
- `rules-sheet.html` — Match Rules bottom sheet
