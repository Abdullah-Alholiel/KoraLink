# Gate 0: Retrospective — Ended Game Today Visibility & POTM Access

> Analysis of why completed matches from today disappeared from the feed.

---

## 1. Defect Analysis

| Component | Issue Description | Root Cause |
|---|---|---|
| NestJS `matches.service.ts` (`findNearby`) | Participated users could not see matches that ended today on the Play screen feed. | SQL `WHERE` clause hardcoded `m.status IN ('Open', 'Full', 'InProgress')`. When a match status became `Completed`, it was immediately filtered out of the feed query. |
| PWA `MatchCard.tsx` | Completed matches from today displayed generic `View Details` gray buttons. | `MatchCard` did not distinguish between regular completed history vs. a completed match from today where the user participated and needs to vote for POTM. |
| PWA `my-games/page.tsx` | Completed games were moved to history section. | Games completed today should remain prominent in the active games list so participants can vote for POTM for the rest of the day. |

---

## 2. Technical Contracts

1. **SQL Feed Contract**: `findNearby` MUST include matches scheduled for today (`m.scheduled_at >= CURRENT_DATE`) that have ended/completed if `currentUserId` is a participant (host or joined player).
2. **Match Card UX Contract**: When a completed match from today appears on the feed for a participant, `MatchCard` MUST display a `🏆 POTM` badge and an amber `Vote POTM` action button.
3. **My Games Contract**: `my-games/page.tsx` MUST classify completed matches from today under active games for participant visibility.
