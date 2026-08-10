# Gate 3 — Program Design: Player of the Match

**Date:** 2026-08-10
**Status:** ✅ APPROVED (proceeding per user directive)

---

## 1. Exact JSON Response Shapes

### POST /matches/:id/vote
**Request:**
```json
{ "candidateId": "8d0449c7-2a7f-443b-b0b6-e2301eb4b829" }
```
**Response (200):**
```json
{
  "matchId": "d6698b60-d85f-411b-8246-3633872fda3c",
  "votedFor": "8d0449c7-2a7f-443b-b0b6-e2301eb4b829",
  "message": "Vote recorded."
}
```

### GET /matches/:id/pom-result
**Response — voting still open (200):**
```json
{
  "status": "voting_open",
  "completedAt": "2026-08-10T15:00:00.000Z",
  "votingClosesAt": "2026-08-11T15:00:00.000Z",
  "hasVoted": true,
  "votedFor": "8d0449c7-2a7f-443b-b0b6-e2301eb4b829",
  "candidates": [
    {
      "id": "31e5650e-2a38-4781-9807-913b9c913c90",
      "fullName": "Yousef Al-Qahtani",
      "avatarUrl": null
    }
  ]
}
```

**Response — voting closed, winner exists (200):**
```json
{
  "status": "completed",
  "winner": {
    "id": "31e5650e-2a38-4781-9807-913b9c913c90",
    "fullName": "Yousef Al-Qahtani",
    "avatarUrl": "https://example.com/avatar.jpg"
  },
  "voteCount": 5
}
```

**Response — voting closed, tie or no votes (200):**
```json
{
  "status": "no_winner"
}
```

### GET /users/me (extended)
```json
{
  "id": "...",
  "phone": "...",
  "full_name": "...",
  "pom_count": 3,
  ...
}
```

---

## 2. TypeScript Signatures

### matches.service.ts
```typescript
async castVote(voterId: string, matchId: string, candidateId: string): Promise<VoteResult>
async getPomResult(matchId: string, userId: string): Promise<PomResult>
```

### dto/vote.dto.ts
```typescript
class CastVoteDto {
  @ApiProperty()
  @IsString()
  candidateId: string;
}
```

### Frontend hooks
```typescript
function useVote(matchId: string): UseMutationResult<VoteResult, FetchError, string>
function usePomResult(matchId: string, currentUserId?: string): UseQueryResult<PomResult, FetchError>
```

---

## 3. i18n Key Contracts

### en.json
```json
{
  "pom": {
    "title": "Player of the Match",
    "votePrompt": "Vote for Player of the Match",
    "voteSubtitle": "Pick the standout performer from today's game",
    "vote": "Vote",
    "voted": "You voted for",
    "changeVote": "Change Vote",
    "votingOpen": "Voting is open",
    "votingClosed": "Voting has ended",
    "winner": "Winner",
    "votes": "votes",
    "noWinner": "No winner this time",
    "noWinnerDescription": "Votes were tied — no Player of the Match was decided.",
    "matchCompleted": "Match Completed",
    "notAttended": "You didn't attend this match, so voting is unavailable.",
    "cannotVoteSelf": "You can't vote for yourself!"
  }
}
```

### ar.json
```json
{
  "pom": {
    "title": "أفضل لاعب في المباراة",
    "votePrompt": "صوّت لأفضل لاعب",
    "voteSubtitle": "اختر أفضل لاعب في مباراة اليوم",
    "vote": "صوّت",
    "voted": "صوّت لـ",
    "changeVote": "تغيير الصوت",
    "votingOpen": "التصويت مفتوح",
    "votingClosed": "انتهى التصويت",
    "winner": "الفائز",
    "votes": "أصوات",
    "noWinner": "لا يوجد فائز هذه المرة",
    "noWinnerDescription": "تعادل الأصوات — لم يتم تحديد أفضل لاعب.",
    "matchCompleted": "انتهت المباراة",
    "notAttended": "لم تحضر هذه المباراة، لذا التصويت غير متاح.",
    "cannotVoteSelf": "لا يمكنك التصويت لنفسك!"
  }
}
```

---

## 4. Contract Verification Checklist

- [x] `castVote()` returns `{ matchId, votedFor, message }` — not a bare row
- [x] `getPomResult()` returns discriminated union by status field
- [x] Frontend `PomResult` type matches backend response shapes exactly
- [x] `pom_count` is an integer in `/users/me` response
- [x] i18n keys exist for every user-facing string in both languages
- [x] `completeMatch()` sets `completed_at` timestamp (needed for voting window calc)
- [x] Vote endpoint validates: user attended, not no-show, not self, voting window open
- [x] One vote per voter per match (unique constraint)
