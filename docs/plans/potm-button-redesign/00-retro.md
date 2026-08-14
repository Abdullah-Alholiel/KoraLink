# Gate 0: Retrospective — POTM Card Button Redesign & Voted State

> Analysis of POTM card button sizing and voting state requirements.

---

## 1. Defect Analysis

| Component | Issue Description | Root Cause |
|---|---|---|
| PWA `MatchCard.tsx` | "Vote for Player of the Match" button was oversized and broke card visual hierarchy. | Button rendered full long string `t('pom.votePrompt')` ("Vote for Player of the Match") with extra padding. |
| API & Frontend | Card did not indicate when a user had already voted for POTM. | `findNearby` feed query did not return `has_voted` state for the current user. |

---

## 2. Technical Contracts

1. **API Feed Contract**: `findNearby` MUST include `EXISTS(SELECT 1 FROM match_votes...) AS has_voted` in the row result.
2. **Match Card Button Contract**: Card buttons MUST adhere to KoraLink compact pill standards (`text-xs font-semibold px-4 py-2 rounded-full`).
3. **Voted State Contract**: When `match.hasVoted` is true, button renders `✓ Voted` in subtle amber border styling. When false, renders `🏆 Vote` in vibrant amber fill styling.
