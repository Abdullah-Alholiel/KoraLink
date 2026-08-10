# Gate 2 — Architecture: Player of the Match

**Date:** 2026-08-10
**Status:** ✅ APPROVED (proceeding per user directive)

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                         API (NestJS)                                 │
│                                                                      │
│  matches.module.ts                                                   │
│  ├── POST /matches/:id/vote     → castVote(userId, matchId, candidateId) │
│  ├── GET  /matches/:id/pom-result → getPomResult(matchId)           │
│  └── GET  /users/me (extended)  → pom_count field                   │
│                                                                      │
│  schema.ts                                                           │
│  ├── match_votes (NEW)     → voter_id, candidate_id, match_id        │
│  └── player_of_match (NEW) → computed result after window closes     │
└─────────────────────────────────────────────────────────────────────┘
                                ↕
┌─────────────────────────────────────────────────────────────────────┐
│                       PWA (Next.js)                                  │
│                                                                      │
│  match/[id]/page.tsx                                                 │
│  ├── PostMatchSection (NEW) — voting UI / result display            │
│  └── Uses usePomStatus + useVote hooks                               │
│                                                                      │
│  profile/page.tsx                                                    │
│  └── Trophy count badge (reads pom_count from /users/me)            │
└─────────────────────────────────────────────────────────────────────┘
```

## Data Flow

### Voting Flow
1. Host completes match → status = 'Completed', `completed_at` set
2. Player opens match detail → sees voting section
3. Player taps a teammate → `POST /matches/:id/vote { candidateId }`
4. API validates: user attended, not no-show, not self, window open
5. Vote recorded (upsert — one vote per voter per match)
6. After 24h, `GET /matches/:id/pom-result` returns winner

### Result Determination
- Triggered on-demand when `GET /matches/:id/pom-result` is called
- If `now() < completed_at + 24h`: return `{ status: 'voting_open', hasVoted, candidates }`
- If `now() >= completed_at + 24h`: count votes, determine winner, return result
- Tie → no winner declared

## Schema Changes

### New table: `match_votes`
```sql
CREATE TABLE match_votes (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  match_id VARCHAR(36) NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  voter_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  candidate_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(match_id, voter_id)  -- one vote per voter per match
);
```

### Column addition: `matches.completed_at`
```sql
ALTER TABLE matches ADD COLUMN completed_at TIMESTAMPTZ;
```
Set when `completeMatch()` transitions status to 'Completed'.

## Files Changed

### Backend
| File | Change |
|------|--------|
| `schema.ts` | Add `match_votes` table, `completed_at` column on matches |
| `matches.service.ts` | Add `castVote()`, `getPomResult()`, update `completeMatch()` to set `completed_at` |
| `matches.controller.ts` | Add `POST :id/vote`, `GET :id/pom-result` endpoints |
| `dto/vote.dto.ts` | New DTO: `{ candidateId: string }` |
| `users.service.ts` | Add `pom_count` to `getProfile()` |
| `users.controller.ts` | Return `pom_count` in `GET /users/me` |

### Frontend
| File | Change |
|------|--------|
| `api-adapter.ts` | Add `pom_count` to `UserProfileApi` |
| `hooks/usePom.ts` (NEW) | `useVote`, `usePomResult` hooks |
| `components/matches/PostMatchSection.tsx` (NEW) | Voting UI + result display |
| `match/[id]/page.tsx` | Render PostMatchSection when status=completed |
| `profile/page.tsx` | Add trophy count badge in stats row |
| `messages/en.json` + `ar.json` | All POM i18n keys |
