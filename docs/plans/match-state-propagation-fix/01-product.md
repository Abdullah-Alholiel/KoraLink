# Gate 1 — Product Spec: Match State Propagation Fix

**Feature:** `match-state-propagation-fix`  
**Date:** 2026-08-09  
**Input:** Gate 0 Retrospective ([00-retrospective.md](./00-retrospective.md))

---

## Problem Statement

Cycle 6 failed because `MatchCard` has no user awareness and feed data contains empty rosters. Every match card shows "Join Match" regardless of whether the user has already joined, is the host, or the match is completed. The cancel/leave flow uses browser `confirm()` dialogs with missing i18n keys. The messages icon navigates to the wrong destination.

---

## User Stories

| ID | Story | Priority |
|----|-------|----------|
| US-1 | As a player, I see "Join Match" on feed cards only for matches I haven't joined | P0 |
| US-2 | As a joined player, feed cards show "Joined" with a green badge instead of a Join button | P0 |
| US-3 | As a host, my own match cards show "Your Match" instead of Join | P0 |
| US-4 | As a user, completed/cancelled matches show "View Details" instead of Join | P1 |
| US-5 | As a host, I can cancel my match with a proper confirmation sheet (not browser popup) | P0 |
| US-6 | As a joined player, I can leave a match with a proper confirmation sheet | P1 |
| US-7 | As a joined player, the messages icon opens the match-specific discussion | P1 |

---

## Success Criteria

| # | Criterion | Verification |
|---|-----------|-------------|
| SC-1 | Feed cards show context-sensitive button based on join/host/status | Visual inspection of Play + My Games |
| SC-2 | After joining a match, feed cards update to "Joined" within 2 seconds | Join then navigate to /play |
| SC-3 | Host's own match cards show "Your Match" | Create match, view /play |
| SC-4 | Cancel Match opens a confirmation bottom sheet, calls API on confirm | Tap Cancel → sheet opens → confirm → match cancelled |
| SC-5 | No `MISSING_MESSAGE` errors in console | Check browser console |
| SC-6 | Messages icon navigates to match-specific chat | Tap messages icon on joined match |
| SC-7 | `turbo run build` zero errors | Terminal output |
| SC-8 | `npx vitest run` 85/85 pass | Test runner output |

---

## Mockups

See `docs/plans/match-state-propagation-fix/mockups/`:

| File | Content |
|------|---------|
| `matchcard-join.html` | Default state — user not joined, match Open |
| `matchcard-joined.html` | User is in roster — green "Joined" badge |
| `matchcard-host.html` | User is the host — "Your Match" badge |
| `matchcard-completed.html` | Match completed — "View Details" button |
| `cancel-sheet.html` | Host cancel confirmation bottom sheet |
| `leave-sheet.html` | Player leave confirmation bottom sheet |
