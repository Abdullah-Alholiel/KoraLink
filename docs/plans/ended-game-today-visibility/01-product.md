# Gate 1: Product Spec — Ended Game Today Visibility & POTM Access

> Requirements and acceptance criteria for showing today's ended games to participated players.

---

## 1. Product Story

- **As a** player who participated in a match that ended today,
- **I want** that ended match to remain visible on my Play screen feed and My Games screen for the rest of the day,
- **So that** I can easily access the match details and vote for Player of the Match (POTM).

---

## 2. Acceptance Criteria

1. **Feed Visibility**:
   - For authenticated participated users, matches scheduled for today that have completed or ended are included in `GET /matches`.
   - For non-participating users, completed matches are excluded from the discovery feed.
2. **Match Card Styling**:
   - For completed matches from today where the user is a participant, `MatchCard` renders a `🏆 POTM` badge and a `Vote POTM` action button.
3. **My Games Visibility**:
   - `my-games` page groups matches completed today under active games for high-priority visibility.
