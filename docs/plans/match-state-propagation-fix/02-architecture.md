# Gate 2 — Architecture: Match State Propagation Fix

**Feature:** `match-state-propagation-fix`  
**Date:** 2026-08-09  
**Input:** Gate 0 Retrospective + Gate 1 Product Spec

---

## 1. Data/API Contracts — Solving the Empty Roster

### Problem

`findNearby` returns flat SQL rows with `spots_filled` (count) but zero player identity data. The frontend adapter hardcodes `roster: []`. Without knowing WHO is in the match, the UI cannot determine if the current user is joined.

### Solution: Add `is_joined` boolean to feed query

**Approach:** Modify the `findNearby` SQL to LEFT JOIN `match_players` for the **authenticated user**, returning a boolean `is_joined` column. This is the lightest possible change — one extra column, no array aggregation, no N+1 query.

**Why not `playerIds` array?** The feed cards only need to know "am I in this match?" — not who else is. Loading full roster for every feed card would bloat the response and slow the query. The roster is available on the detail page via `GET /matches/:id`.

### API Contract Change

**`GET /matches` — new response field:**

```typescript
// NearbyMatchRow (matches.service.ts) — ADD:
is_joined: boolean;  // TRUE if current user has a match_players row for this match
```

**SQL change in `findNearby`:**
```sql
SELECT
  m.id, m.title, ...,
  COUNT(mp.id) FILTER (WHERE mp.is_host = false)::int AS spots_filled,
  -- NEW: check if the authenticated user is in the match
  EXISTS(
    SELECT 1 FROM match_players mu
    WHERE mu.match_id = m.id AND mu.user_id = ${currentUserId}
  ) AS is_joined,
  ...
FROM matches m
...
```

**Controller change:** `findNearby` must receive `@CurrentUser()`:
```typescript
// matches.controller.ts
findNearby(@CurrentUser() user: { sub: string }, @Query() dto: GetMatchesDto) {
    return this.matchesService.findNearby(dto, user.sub);
}
```

**Service signature change:**
```typescript
async findNearby(dto: GetMatchesDto, currentUserId?: string): Promise<NearbyMatchRow[]>
```

**Same change for `getMyMatches`** (already returns user's matches, but needs `is_joined` for consistency — will always be `true`):
```sql
TRUE AS is_joined   -- user is always joined in their own my-matches list
```

### Frontend Type Change

```typescript
// api-adapter.ts — NearbyMatchApi: ADD
is_joined: boolean;
```

---

## 2. Frontend Adapter — Stop Hardcoding `roster: []`

### `adaptNearbyMatch` changes

```typescript
export function adaptNearbyMatch(row: NearbyMatchApi): Match {
  return {
    ...
    filledSpots: row.spots_filled,
    isJoined: row.is_joined,     // ← NEW: from API
    isUserHost: row.host_id === currentUserId, // ← NEW: host check at adapter level
    roster: [],                   // ← kept empty (feed doesn't need full roster)
    ...
  };
}
```

Wait — `adaptNearbyMatch` doesn't have access to `currentUserId`. The host check needs to happen elsewhere.

**Better approach:** Add `is_joined` and `is_user_host` to the `Match` type, and populate them in the adapter directly from the API response.

**Actually, even better:** The `is_joined` comes from the API. The `is_user_host` can be computed on the frontend by comparing `match.hostId === storeUser.id`. But doing this in the adapter couples it to the store.

**Final decision: Two new optional fields on the `Match` type:**

```typescript
export interface Match {
    ...
    isJoined?: boolean;    // populated by adaptNearbyMatch from API is_joined field
    isUserHost?: boolean;  // populated by adaptNearbyMatch by comparing hostId
    ...
}
```

`adaptNearbyMatch` receives the raw row and the `currentUserId`:
```typescript
export function adaptNearbyMatch(row: NearbyMatchApi, currentUserId?: string): Match {
  return {
    ...
    isJoined: row.is_joined,
    isUserHost: currentUserId ? row.host_id === currentUserId : false,
    ...
  };
}
```

`adaptMatchList` passes `currentUserId` through:
```typescript
export function adaptMatchList(rows: NearbyMatchApi[], currentUserId?: string): Match[] {
  return rows.map(row => adaptNearbyMatch(row, currentUserId));
}
```

---

## 3. State Management — How `MatchCard` Accesses User

### Decision: Pass `currentUserId` as prop from page level

**Why props over store:** `MatchCard` is used in multiple contexts (Play feed, My Games, Messages). Each page already has access to the store. Passing `currentUserId` as a prop makes the component testable and explicit about its dependencies.

```typescript
// MatchCard.tsx
interface MatchCardProps {
    match: Match;
    currentUserId?: string;  // ← NEW
}
```

**Page-level usage:**
```typescript
// PlayPage.tsx
const storeUser = useAppStore(selectUser);
const currentUserId = storeUser?.id;

<MatchCard match={match} currentUserId={currentUserId} />
```

**Inside MatchCard — state-aware button:**
```typescript
const isJoined = match.isJoined || match.roster.some(p => p.userId === currentUserId);
const isHost = match.isUserHost || match.hostId === currentUserId;
const isCompleted = ['completed', 'cancelled'].includes(match.status);

let buttonLabel, buttonStyle;
if (isCompleted) {
    buttonLabel = t('matchDetail.viewDetails');
    buttonStyle = 'bg-gray-100 text-gray-600';
} else if (isHost) {
    buttonLabel = t('matchDetail.yourMatch');
    buttonStyle = 'bg-amber-100 text-amber-800 border border-amber-300';
} else if (isJoined) {
    buttonLabel = t('matchDetail.view');
    buttonStyle = 'bg-brand-green/10 text-brand-green border border-brand-green';
} else {
    buttonLabel = t('matchDetail.joinMatch');
    buttonStyle = 'bg-brand-green text-white';
}
```

---

## 4. Cancel/Leave Endpoints — Proper Sheets

### API Routes (already exist)

| Method | Path | Auth | Status |
|--------|------|------|--------|
| `POST` | `/matches/:id/cancel` | JWT (host only) | ✅ Exists, returns populated match |
| `DELETE` | `/matches/:id/leave` | JWT | ✅ Exists, returns populated match |

### New Frontend Hooks

**`useCancelMatch` — NEW in `useMatchActions.ts`:**
```typescript
export function useCancelMatch() {
  const queryClient = useQueryClient();
  return useMutation<MatchDetailApi, FetchError, string>({
    mutationFn: (matchId) => fetcher(`/matches/${matchId}/cancel`, { method: 'POST' }),
    onSuccess: (_, matchId) => {
      queryClient.invalidateQueries({ queryKey: ['matches'] });
      queryClient.invalidateQueries({ queryKey: ['match', matchId] });
      queryClient.invalidateQueries({ queryKey: ['user', 'my-matches'] });
    },
  });
}
```

### New Bottom Sheet Components

**`CancelMatchSheet.tsx`** — host cancel confirmation:
- Props: `isOpen`, `onClose`, `onConfirm`, `matchTitle`, `matchTime`
- Shows: ⚠️ icon, "Cancel Match?" title, match info, "All players will be refunded" warning
- Actions: "Cancel Match" (red, calls `onConfirm`) + "Keep Match" (gray, calls `onClose`)

**`LeaveMatchSheet.tsx`** — player leave confirmation:
- Props: `isOpen`, `onClose`, `onConfirm`, `matchTitle`, `matchTime`
- Shows: 🚪 icon, "Leave Match?" title, match info, refund policy note
- Actions: "Leave Match" (red, calls `onConfirm`) + "Stay" (gray, calls `onClose`)

### Wiring in Match Detail Page

```typescript
// Replace browser confirm() with sheet state:
const [showCancelSheet, setShowCancelSheet] = useState(false);
const [showLeaveSheet, setShowLeaveSheet] = useState(false);

// Leave button:
<button onClick={() => setShowLeaveSheet(true)}>Leave Match</button>
<LeaveMatchSheet
  isOpen={showLeaveSheet}
  onClose={() => setShowLeaveSheet(false)}
  onConfirm={() => { leaveMatch.mutate(id); setShowLeaveSheet(false); }}
  matchTitle={match.title}
  matchTime={`${match.date}, ${match.time}`}
/>

// Cancel button:
<button onClick={() => setShowCancelSheet(true)}>Cancel Match</button>
<CancelMatchSheet
  isOpen={showCancelSheet}
  onClose={() => setShowCancelSheet(false)}
  onConfirm={() => { cancelMatch.mutate(id); setShowCancelSheet(false); }}
  matchTitle={match.title}
  matchTime={`${match.date}, ${match.time}`}
/>
```

---

## 5. New i18n Keys Required

| Key | English | Arabic |
|-----|---------|--------|
| `matchDetail.viewDetails` | View Details | عرض التفاصيل |
| `matchDetail.yourMatch` | Your Match | مباراتك |
| `matchDetail.view` | View | عرض |
| `cancelMatch.title` | Cancel Match? | إلغاء المباراة؟ |
| `cancelMatch.warning` | All players will be notified and refunded. This cannot be undone. | سيتم إشعار جميع اللاعبين واسترداد المبالغ. لا يمكن التراجع. |
| `cancelMatch.confirm` | Cancel Match | إلغاء المباراة |
| `cancelMatch.keep` | Keep Match | الاحتفاظ بالمباراة |
| `leaveMatch.title` | Leave Match? | مغادرة المباراة؟ |
| `leaveMatch.info` | Your spot will be released. Refund policy applies. | سيتم تحرير مقعدك. تطبق سياسة الاسترداد. |
| `leaveMatch.confirm` | Leave Match | مغادرة المباراة |
| `leaveMatch.stay` | Stay | البقاء |

---

## 6. Files Changed

| Layer | File | Change |
|-------|------|--------|
| **API** | `matches.service.ts` | `findNearby` + `getMyMatches`: add `is_joined` column |
| **API** | `matches.controller.ts` | Pass `@CurrentUser()` to `findNearby` |
| **Adapter** | `api-adapter.ts` | `NearbyMatchApi` + `is_joined`; `adaptNearbyMatch` + `isJoined`/`isUserHost`; `adaptMatchList` + `currentUserId` param |
| **Types** | `types/index.ts` | `Match` + `isJoined?`, `isUserHost?` |
| **Component** | `MatchCard.tsx` | + `currentUserId` prop; state-aware button logic |
| **Component** | `CancelMatchSheet.tsx` | NEW — host cancel confirmation bottom sheet |
| **Component** | `LeaveMatchSheet.tsx` | NEW — player leave confirmation bottom sheet |
| **Hook** | `useMatchActions.ts` | NEW `useCancelMatch` hook |
| **Page** | `play/page.tsx` | Pass `currentUserId` to `MatchCard` |
| **Page** | `my-games/page.tsx` | Pass `currentUserId` to `MatchCard` |
| **Page** | `match/[id]/page.tsx` | Replace `confirm()` with sheet components; wire cancel hook |
| **i18n** | `en.json`, `ar.json` | 12 new keys |

---

## 7. Data Flow Diagram

```
┌──────────────────────────────────────────────────────┐
│ BACKEND: findNearby(currentUserId)                    │
│                                                       │
│ SELECT ..., EXISTS(SELECT 1 FROM match_players        │
│   WHERE match_id = m.id AND user_id = $userId)        │
│   AS is_joined                                        │
│                                                       │
│ Returns: { ..., is_joined: true/false }               │
└────────────────────┬─────────────────────────────────┘
                     ▼
┌──────────────────────────────────────────────────────┐
│ ADAPTER: adaptNearbyMatch(row, currentUserId)         │
│                                                       │
│ Match {                                              │
│   isJoined: row.is_joined,                           │
│   isUserHost: row.host_id === currentUserId,         │
│   ...                                                 │
│ }                                                     │
└────────────────────┬─────────────────────────────────┘
                     ▼
┌──────────────────────────────────────────────────────┐
│ PAGE: PlayPage / MyGamesPage                          │
│                                                       │
│ const currentUserId = useAppStore(selectUser)?.id     │
│ <MatchCard match={m} currentUserId={currentUserId} />│
└────────────────────┬─────────────────────────────────┘
                     ▼
┌──────────────────────────────────────────────────────┐
│ COMPONENT: MatchCard                                  │
│                                                       │
│ if (completed) → "View Details" (gray)                │
│ if (isHost)    → "Your Match" (amber)                 │
│ if (isJoined)  → "Joined" badge + "View" (green)     │
│ else           → "Join Match" (green filled)          │
└──────────────────────────────────────────────────────┘
```

---

**⏸️ STOP — Architecture defined across all 4 layers. Gate 2 ready for review.**
