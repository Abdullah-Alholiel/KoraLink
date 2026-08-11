# Gate 3 — Program Design: Match Lifecycle, My Games, POM Voting UX

Date: 2026-08-11 | Cycle: `match-lifecycle-pom`

## 1. API Contracts

### 1.1 Virtual Status Helper

```typescript
// matches.service.ts — NEW static helper
private static resolveEffectiveStatus(match: {
  status: string;
  scheduled_at: Date;
  duration_mins: number;
  completed_at: Date | null;
}): string {
  // If already in terminal state, return as-is
  if (['Completed', 'Cancelled'].includes(match.status)) {
    return match.status;
  }
  // If past end time, treat as Completed
  const endTime = new Date(match.scheduled_at.getTime() + match.duration_mins * 60 * 1000);
  if (new Date() >= endTime) {
    return 'Completed';
  }
  return match.status;
}
```

### 1.2 Auto-Complete Startup Job

```typescript
// matches.service.ts — NEW method
async autoCompletePastMatches(): Promise<number> {
  const result = await this.db.execute(sql`
    UPDATE matches
    SET status = 'Completed',
        completed_at = scheduled_at + (duration_mins || '60')::text::interval,
        updated_at = NOW()
    WHERE status IN ('Open', 'Full', 'InProgress')
      AND scheduled_at + (duration_mins || '60')::text::interval < NOW()
  `);
  // result.rowCount contains number of rows updated
  return result.rowCount ?? 0;
}
```

### 1.3 findOne — Apply Virtual Status

```typescript
// matches.service.ts — MODIFIED findOne
// After line 208 (return match;), add:
const effectiveStatus = MatchesService.resolveEffectiveStatus({
  status: match.status,
  scheduled_at: match.scheduled_at,
  duration_mins: match.duration_mins,
  completed_at: match.completed_at,
});
match.status = effectiveStatus;
return match;
```

### 1.4 getPomResult — Apply Virtual Status

```typescript
// matches.service.ts — MODIFIED getPomResult (line 762)
// BEFORE:
if (match.status !== 'Completed') {
  return { status: 'not_completed' as const };
}

// AFTER:
const effectiveStatus = MatchesService.resolveEffectiveStatus({
  status: match.status,
  scheduled_at: match.scheduled_at as Date,
  duration_mins: match.duration_mins as number,
  completed_at: match.completed_at,
});
if (effectiveStatus !== 'Completed') {
  return { status: 'not_completed' as const };
}
```

### 1.5 getMyMatches — Remove Cancelled Filter

```sql
-- users.service.ts:155 — REMOVE this line:
-        AND m.status != 'Cancelled'

-- users.service.ts:159 — UPDATE ordering:
-        CASE WHEN m.status IN ('Open', 'Full', 'InProgress') AND m.scheduled_at >= date_trunc('day', NOW()) THEN 0
+        CASE WHEN m.status IN ('Open', 'Full', 'InProgress') AND m.scheduled_at >= date_trunc('day', NOW()) THEN 0
+             WHEN m.status = 'Cancelled' THEN 1
+             WHEN m.status = 'Completed' THEN 2
+             ELSE 3 END,
```

### 1.6 findNearby — No Change

```typescript
// findNearby already filters scheduled_at >= NOW() and status = 'Open'
// No change needed — past matches already excluded from feed
```

### 1.7 castVote — Apply Virtual Status Check

```typescript
// matches.service.ts:667 — MODIFY status check
// BEFORE:
if (match.status !== 'Completed') {

// AFTER:
const effectiveStatus = MatchesService.resolveEffectiveStatus({
  status: match.status,
  scheduled_at: match.scheduled_at as Date,
  duration_mins: match.duration_mins as number,
  completed_at: match.completed_at,
});
if (effectiveStatus !== 'Completed') {
```

---

## 2. Frontend Contracts

### 2.1 PomVotingSheet Props

```typescript
// PomVotingSheet.tsx — NEW component
interface PomVotingSheetProps {
  open: boolean;
  onClose: () => void;
  candidates: PomCandidate[];       // from usePomResult
  hasVoted: boolean;
  votedFor: string | null;
  isPending: boolean;               // mutation.isPending
  onVote: (candidateId: string) => void;
  onConfirm: (candidate: PomCandidate) => void; // opens confirmation
}

// PomCandidate (from usePom.ts — unchanged)
interface PomCandidate {
  id: string;
  fullName: string;
  avatarUrl: string | null;
}
```

### 2.2 PomConfirmModal Props

```typescript
// PomConfirmModal.tsx — NEW component
interface PomConfirmModalProps {
  open: boolean;
  candidate: PomCandidate | null;
  onConfirm: () => void;
  onCancel: () => void;
  isPending: boolean;
}
```

### 2.3 PostMatchSection — Refactored

```typescript
// PostMatchSection.tsx — MODIFIED
// The "voting open" state now renders a trigger button + PomVotingSheet
// instead of inline candidate list

// Voting open state:
<button onClick={() => setShowVoting(true)}>
  Vote for Player of the Match
</button>

<PomVotingSheet
  open={showVoting}
  onClose={() => setShowVoting(false)}
  candidates={pom.candidates}
  hasVoted={pom.hasVoted}
  votedFor={pom.votedFor}
  isPending={voteMutation.isPending}
  onVote={(id) => voteMutation.mutate(id)}
  onConfirm={(candidate) => {
    setSelectedCandidate(candidate);
    setShowConfirm(true);
  }}
/>

<PomConfirmModal
  open={showConfirm}
  candidate={selectedCandidate}
  onConfirm={() => {
    voteMutation.mutate(selectedCandidate!.id);
    setShowConfirm(false);
    setShowVoting(false);
  }}
  onCancel={() => setShowConfirm(false)}
  isPending={voteMutation.isPending}
/>
```

---

## 3. i18n Key Contracts

| Key | en.json | ar.json |
|-----|---------|---------|
| `pom.voteTrigger` | "Vote for Player of the Match" | "صوّت لأفضل لاعب" |
| `pom.voteConfirmTitle` | "Player of the Match" | "أفضل لاعب في المباراة" |
| `pom.voteConfirmBody` | "Vote for {name} as Player of the Match?" | "هل تصوت لـ {name} كأفضل لاعب؟" |
| `pom.confirmVote` | "Confirm Vote" | "تأكيد التصويت" |
| `pom.selectPlayer` | "Select a player" | "اختر لاعباً" |

---

## 4. Exact JSON Response Shapes (No Change)

### GET /matches/:id/pom-result (voting_open)
```json
{
  "status": "voting_open",
  "completedAt": "2026-08-11T18:00:00.000Z",
  "votingClosesAt": "2026-08-12T18:00:00.000Z",
  "hasVoted": false,
  "votedFor": null,
  "candidates": [
    { "id": "uuid-1", "fullName": "Khalid", "avatarUrl": null },
    { "id": "uuid-2", "fullName": "Faisal", "avatarUrl": null }
  ]
}
```

### GET /matches/:id/pom-result (completed)
```json
{
  "status": "completed",
  "winner": { "id": "uuid-1", "fullName": "Khalid", "avatarUrl": null },
  "voteCount": 3
}
```

### POST /matches/:id/vote
```json
// Request
{ "candidateId": "uuid-1" }

// Response
{ "matchId": "match-uuid", "votedFor": "uuid-1", "message": "Vote cast successfully." }
```

---

## 5. Contract Verification Checklist

- [ ] `resolveEffectiveStatus` handles all 5 statuses (Open, Full, InProgress, Completed, Cancelled)
- [ ] Auto-complete updates `completed_at` correctly = `scheduled_at + duration_mins` interval
- [ ] `findOne` returns effective status without mutating DB row
- [ ] `getPomResult` uses effective status for completion check
- [ ] `castVote` uses effective status for completion check
- [ ] Cancelled matches appear in `getMyMatches` response
- [ ] Cancelled matches sorted after active, before completed
- [ ] POM sheet receives same `PomCandidate[]` shape from existing `usePomResult`
- [ ] POM confirmation reuses `castVote` mutation — no new endpoint
- [ ] i18n keys exist in both ar.json and en.json
- [ ] Build passes with zero errors
- [ ] Tests pass (no regressions)
