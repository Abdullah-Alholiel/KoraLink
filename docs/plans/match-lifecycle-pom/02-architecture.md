# Gate 2 — Architecture: Match Lifecycle, My Games, POM Voting UX

Date: 2026-08-11 | Cycle: `match-lifecycle-pom`

## 1. Architecture Overview

```
┌──────────────────────────────────────────────────────────┐
│                    API (NestJS)                           │
│                                                          │
│  ┌──────────────────┐    ┌─────────────────────────┐     │
│  │ Startup Hook     │    │ MatchesService           │     │
│  │ (onModuleInit)   │───▶│ - findOne (virtual)      │     │
│  │ autoCompletePast │    │ - findNearby (unchanged) │     │
│  │ Matches()        │    │ - getPomResult           │     │
│  └──────────────────┘    │ - castVote               │     │
│                          └──────────┬───────────────┘     │
│  ┌──────────────────┐              │                      │
│  │ UsersService      │              │                      │
│  │ - getMyMatches   │◀─────────────┘                      │
│  │   REMOVE !=Canc. │                                     │
│  └──────────────────┘                                     │
└──────────────────────────────────────────────────────────┘
                          │
                          ▼
┌──────────────────────────────────────────────────────────┐
│                    PWA (Next.js)                          │
│                                                          │
│  match/[id]/page.tsx                                     │
│  ├── LocationMap                                         │
│  ├── PostMatchSection  ← now opens PomVotingSheet        │
│  │   ├── PomVotingSheet.tsx    ← NEW bottom sheet        │
│  │   │   ├── TeamLineup (Home/Away)                      │
│  │   │   └── Player tap → PomConfirmModal               │
│  │   └── PomConfirmModal.tsx   ← NEW confirmation popup  │
│  └── TeamLineup                                          │
│                                                          │
│  (main)/my-games/page.tsx                                │
│  └── Now shows cancelled matches with badge              │
└──────────────────────────────────────────────────────────┘
```

## 2. Component Changes

### Backend

| File | Change | Why |
|------|--------|-----|
| `matches.service.ts` | Add `autoCompletePastMatches()` — bulk UPDATE for past Open/Full/InProgress → Completed | Cleans up DB state on startup |
| `matches.service.ts` | Add virtual status computation helper `resolveEffectiveStatus(match)` | Query-time: past matches return "Completed" without DB write |
| `matches.service.ts:findOne()` | Use `resolveEffectiveStatus` before returning | Past match detail shows Completed |
| `matches.service.ts:getPomResult()` | Use `resolveEffectiveStatus` — if resolved to Completed, allow POM flow | Users can vote on auto-completed matches |
| `matches.module.ts` | Add `onModuleInit` → call `autoCompletePastMatches()` | Boot-time cleanup |
| `users.service.ts:155` | Remove `AND m.status != 'Cancelled'` | Cancelled matches appear in history |
| `users.service.ts:159` | Update CASE ordering: Cancelled falls below active but above Completed | Correct sort order |

### Frontend

| File | Change | Why |
|------|--------|-----|
| `PostMatchSection.tsx` | Extract voting UI into PomVotingSheet; add "Vote for POM" trigger button | Opens drawer sheet instead of inline list |
| `PomVotingSheet.tsx` | **NEW** — bottom sheet with team lineup (Home/Away), player tap → confirm | Smooth drawer UX |
| `PomConfirmModal.tsx` | **NEW** — "Vote for [Name] as POM?" with Cancel/Confirm | User confirmation before casting vote |
| `my-games/page.tsx` | No change needed — `adaptMatchList` already handles cancelled status | Just needs backend data |

## 3. Data Flow

### Auto-Complete Flow
```
API Boot (onModuleInit)
  → autoCompletePastMatches()
  → UPDATE matches SET status='Completed', completed_at = scheduled_at + duration
    WHERE status IN ('Open','Full','InProgress')
      AND scheduled_at + (duration_mins || ' minutes')::interval < NOW()
  → Log: "Auto-completed N past matches"

GET /matches/:id
  → findOne(id)
  → resolveEffectiveStatus(match)
    → if match.scheduled_at + duration_mins < NOW() && status in (Open,Full,InProgress):
        return { ...match, status: 'Completed' }
  → Response with Completed status
```

### POM Voting Flow (new UX)
```
User visits completed match detail
  → PostMatchSection shows "Vote for Player of the Match" button
  → User taps button
  → PomVotingSheet opens (bottom sheet, z-[70])
    → Displays Home team roster + Away team roster
    → Each player: avatar, name, team badge
    → Non-eligible players (self, no-show) excluded
  → User taps a player → PomConfirmModal opens
    → "Vote for [Name] as Player of the Match?"
    → [Cancel] [Confirm Vote]
  → Confirm → POST /matches/:id/vote → sheet closes
  → "✓ Voted for [Name]" shown in PostMatchSection
```

## 4. Files Changed

| File | Type | Lines |
|------|------|-------|
| `apps/api/src/modules/matches/matches.service.ts` | Modify | +35 |
| `apps/api/src/modules/matches/matches.module.ts` | Modify | +10 |
| `apps/api/src/modules/users/users.service.ts` | Modify | -1, +3 |
| `apps/player-pwa/src/components/matches/PostMatchSection.tsx` | Modify | +15, -20 |
| `apps/player-pwa/src/components/matches/PomVotingSheet.tsx` | **New** | ~120 |
| `apps/player-pwa/src/components/matches/PomConfirmModal.tsx` | **New** | ~60 |
| `apps/player-pwa/src/messages/en.json` | Modify | +5 |
| `apps/player-pwa/src/messages/ar.json` | Modify | +5 |

## 5. i18n Keys Needed

| Key | en | ar |
|-----|----|----|
| `pom.voteTrigger` | "Vote for Player of the Match" | "صوّت لأفضل لاعب" |
| `pom.voteConfirmTitle` | "Player of the Match" | "أفضل لاعب في المباراة" |
| `pom.voteConfirmBody` | "Vote for {name} as Player of the Match?" | "هل تصوت لـ {name} كأفضل لاعب؟" |
| `pom.confirmVote` | "Confirm Vote" | "تأكيد التصويت" |
| `pom.selectPlayer` | "Select a player" | "اختر لاعباً" |

## 6. Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| Query-time status change breaks existing status checks (castVote checks `status === 'Completed'`) | `castVote` uses raw DB query, not `resolveEffectiveStatus` — add virtual status check |
| Auto-complete startup job slow on large DB | LIMIT to 1000 per batch; logging |
| POM sheet shows too many players (22 for 11v11) | Use compact layout; scrollable; group by team | 

## 7. Descoped

- Cron/scheduled recurring auto-complete (startup + query-time is sufficient)
- Refund logic for auto-completed matches
- POM voting over API/SMS
- Historical match stats on profile (already exists)
