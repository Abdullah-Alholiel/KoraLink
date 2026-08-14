# Gate 0: Retrospective — Ongoing Game Join & Status Handling

> Analysis of current match joining constraints and status handling.

---

## 1. Defect & Behavior Analysis

| Defect / Requirement | Component | Issue Description | Root Cause |
|---|---|---|---|
| **Ongoing Game Joining** | `match/[id]/page.tsx` & NestJS `matches.service.ts` | Non-participating users could not see or click `Join Match` on `in_progress` games. | `showJoin` was gated strictly to `match.status === 'open'`. Backend NestJS `joinMatch` threw `BadRequestException` if status was not `Open` or `Full`. |
| **User Notification** | `OngoingGameJoinSheet.tsx` | Non-participating users had no clear warning dialog explaining that the game is already in progress. | Missing standardized ongoing game join sheet modal. |

---

## 2. Technical Contracts

1. **Backend Service Contract**: `joinMatch` in `matches.service.ts` MUST accept `InProgress` matches with available spots (`openSpots > 0`).
2. **Frontend UI Contract**: `showJoin` on `match/[id]` MUST evaluate to `true` for non-participating users when `openSpots > 0`, regardless of whether `status` is `open` or `in_progress`.
3. **Ongoing Join Sheet Standard**: Joining an ongoing game MUST trigger `OngoingGameJoinSheet`, presenting a standardized confirmation sheet before proceeding to payment or direct roster insertion.
