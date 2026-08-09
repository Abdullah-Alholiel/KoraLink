# Gate 3 — Program Design: Profiles & Spots Remediation

**Feature:** `profiles-and-spots-remediation`  
**Date:** 2026-08-09  
**Input:** Gate 2 Architecture ([02-architecture.md](./02-architecture.md))

> 🔴 **This is the most critical gate.** It defines the exact API response shapes and TypeScript signatures. Every deviation from these contracts is a bug. The `createMatch` bare row bug happened because this gate was skipped.

---

## 1. Mutation Endpoint Contracts (CRITICAL-1, CRITICAL-2)

### 1.1 `POST /matches/:id/join` → `MatchDetailApi`

**Before (bug):**
```typescript
// Returns: { id, match_id, user_id, is_host, team, no_show, created_at }
return player; // bare match_players row
```

**After (fix):**
```typescript
async joinMatch(userId: string, matchId: string): Promise<MatchDetailApi> {
  return this.db.transaction(async (tx) => {
    // ... validation + insert within tx ...
    
    // Return after transaction commits — findOne reads committed state
  });
  
  // OUTSIDE the transaction:
  return this.findOne(matchId);
}
```

**Response shape (JSON):**
```json
{
  "id": "uuid",
  "title": "Friday Night 5v5",
  "host_id": "uuid",
  "match_type": "5v5",
  "gender_rule": "Mixed",
  "status": "Open",
  "scheduled_at": "2026-08-15T20:00:00.000Z",
  "duration_mins": 60,
  "price_per_player": "25.00",
  "max_players": 10,
  "host": {
    "id": "uuid",
    "full_name": "Ahmed",
    "handle": "@ahmed7",
    "avatar_url": null,
    "rating": 4.5,
    "karma_score": 120
  },
  "pitch": {
    "name": "Pitch A",
    "surface_type": "Artificial Turf",
    "size": "5v5",
    "venue": {
      "name": "Green Zone",
      "city": "Riyadh",
      "address": "Olaya St.",
      "amenities": ["parking", "floodlights"]
    }
  },
  "players": [
    {
      "id": "mp-uuid",
      "is_host": true,
      "team": "Home",
      "user": {
        "id": "host-uuid",
        "full_name": "Ahmed",
        "handle": "@ahmed7",
        "avatar_url": null,
        "rating": 4.5
      }
    },
    {
      "id": "mp-uuid-2",
      "is_host": false,
      "team": "Away",
      "user": {
        "id": "joiner-uuid",
        "full_name": "Mohammed",
        "handle": "@moh7",
        "avatar_url": null,
        "rating": 4.0
      }
    }
  ]
}
```

### 1.2 `DELETE /matches/:id/leave` → `MatchDetailApi`

Same return shape as `joinMatch` — fully populated match with updated roster (caller removed).

### 1.3 `POST /matches/:id/start` → `MatchDetailApi`

Same shape but `status: "InProgress"`.

### 1.4 `POST /matches/:id/complete` → `MatchDetailApi`

Same shape but `status: "Completed"`.

### 1.5 `POST /matches/:id/cancel` → `MatchDetailApi`

Same shape but `status: "Cancelled"`.

### Implementation Pattern (all 5 methods):

```typescript
// BEFORE (wrong):
return { message: 'Match started.', status: 'InProgress' };

// AFTER (correct):
async startMatch(userId: string, matchId: string): Promise<MatchDetailApi> {
  await this.db.transaction(async (tx) => {
    // 1. Validate match exists, user is host, status is Full
    // 2. Update status to InProgress within tx
  });
  // 3. Return populated match OUTSIDE tx (reads committed state)
  return this.findOne(matchId);
}
```

**Critical rule:** `return this.findOne(matchId)` is called AFTER the transaction completes, not inside it. Drizzle's `findFirst` with `with:` relations queries need committed data.

---

## 2. Feed Query Contract: `spots_filled` (IMPORTANT-4)

### `GET /matches` → `NearbyMatchApi[]`

**Before (bug):**
```sql
COUNT(mp.id)::int AS spots_filled  -- counts host as a "filled spot"
```

**After (fix):**
```sql
COUNT(mp.id) FILTER (WHERE mp.is_host = false)::int AS spots_filled
```

**`NearbyMatchApi` shape (unchanged):**
```typescript
interface NearbyMatchApi {
  id: string;
  title: string;
  match_type: string;
  gender_rule: string;
  status: string;
  scheduled_at: string | Date;
  duration_mins: number;
  price_per_player: number;
  max_players: number;
  spots_filled: number;  // ← NOW excludes host (was: included host)
  distance_m: number | null;
  host_id: string;
  host_name: string | null;
  host_avatar: string | null;
  pitch_id: string;
  pitch_name: string;
  venue_name: string;
  venue_city: string;
}
```

**Frontend impact:**
- `MatchCard` shows `{match.filledSpots}/{match.totalSpots}` — displays 1 fewer spot
- `spotsLeft = totalSpots - filledSpots` — now correctly shows available spots for joiners
- Closing-soon logic (`spotsLeft <= 2`) triggers 1 spot earlier than before — correct behavior

**No adapter changes needed.** `adaptNearbyMatch` passes `row.spots_filled` through as-is.

---

## 3. Venue Detail Contract: `environment` (IMPORTANT-3)

### `GET /venues/:id` → `VenueDetailApi`

**Before (bug):**
```typescript
pitches: {
  columns: {
    id: true, name: true, size: true,
    surface_type: true, hourly_rate: true,
    // environment MISSING
  },
}
```

**After (fix):**
```typescript
pitches: {
  columns: {
    id: true, name: true, size: true,
    surface_type: true, hourly_rate: true,
    environment: true,  // ← ADDED
  },
}
```

**`VenueDetailApi` shape (already correct — just now populated):**
```typescript
interface PitchApi {
  id: string;
  name: string;
  size: string;
  surface_type: string;
  hourly_rate: string | number;
  environment?: string;  // ← NOW returned by API (was silently undefined)
}

interface VenueDetailApi extends VenueApi {
  owner?: { id: string; full_name: string | null; handle: string | null; avatar_url: string | null; rating: number };
  pitches?: PitchApi[];
}
```

**Frontend impact:** Club detail page (`clubs/[id]/page.tsx:103`) renders `{pitch.environment}` — this now shows actual data instead of nothing.

---

## 4. My Games Endpoint Contract (US-5, US-6)

### `GET /users/me/matches` → `MyMatchApi[]`

**Current shape (too sparse for `adaptNearbyMatch` reuse):**
```typescript
{
  id: string;
  title: string;
  status: string;
  scheduled_at: Date;
  max_players: number;
  price_per_player: number;
  spots_filled: number;
  venue_name: string;
  venue_city: string;
}
```

**Decision: Extend query** to return all `NearbyMatchApi` fields so the frontend can reuse `adaptMatchList()`. This requires adding 5 fields to the `getMyMatches` SQL query.

**New shape (matches `NearbyMatchApi`):**
```typescript
interface MyMatchApi {
  id: string;
  title: string;
  match_type: string;          // ← NEW
  gender_rule: string;          // ← NEW
  status: string;
  scheduled_at: string | Date;
  duration_mins: number;        // ← NEW — from matches.duration_mins
  price_per_player: number;
  max_players: number;
  spots_filled: number;
  distance_m: null;             // ← Always null (no geo context)
  host_id: string;              // ← NEW
  host_name: string | null;     // ← NEW
  host_avatar: string | null;   // ← NEW
  pitch_id: string;             // ← NEW
  pitch_name: string;           // ← NEW
  venue_name: string;
  venue_city: string;
}
```

**Updated SQL in `getMyMatches`:**
```sql
SELECT
  m.id,
  m.title,
  m.match_type,              -- NEW
  m.gender_rule,             -- NEW
  m.status,
  m.scheduled_at,
  m.duration_mins,           -- NEW
  m.max_players,
  m.price_per_player::float AS price_per_player,
  COUNT(mp2.id) FILTER (WHERE mp2.is_host = false)::int AS spots_filled,  -- FIXED
  NULL::float8 AS distance_m, -- always null
  u.id AS host_id,            -- NEW
  u.full_name AS host_name,   -- NEW
  u.avatar_url AS host_avatar,-- NEW
  p.id AS pitch_id,           -- NEW
  p.name AS pitch_name,       -- NEW
  v.name AS venue_name,
  v.city AS venue_city
FROM match_players my
INNER JOIN matches m ON m.id = my.match_id
INNER JOIN users u ON u.id = m.host_id           -- NEW
INNER JOIN pitches p ON p.id = m.pitch_id         -- NEW
INNER JOIN venues v ON v.id = p.venue_id
LEFT JOIN match_players mp2 ON mp2.match_id = m.id
WHERE my.user_id = ${userId}
GROUP BY m.id, u.id, p.id, v.id
ORDER BY m.scheduled_at DESC
LIMIT 50
```

---

## 5. Frontend Hook Contracts

### 5.1 `useMyMatches()`

```typescript
// File: apps/player-pwa/src/hooks/useUser.ts

import { useQuery } from '@tanstack/react-query';
import { fetcher, FetchError } from '@/lib/fetcher';
import type { NearbyMatchApi } from '@/lib/api-adapter';

export function useMyMatches() {
  return useQuery<NearbyMatchApi[], FetchError>({
    queryKey: ['user', 'my-matches'],
    queryFn: () => fetcher<NearbyMatchApi[]>('/users/me/matches'),
    staleTime: 30_000, // 30s — matches change frequently
  });
}
```

**Return type:** `UseQueryResult<NearbyMatchApi[], FetchError>`  
**Adapted via:** `adaptMatchList(data)` → `Match[]` (reuses existing adapter)

### 5.2 `useJoinMatch` (no change needed)

The mutation return type changes from `unknown` to `MatchDetailApi`, but the hook already uses `unknown` which is compatible. The `onSuccess` callback already invalidates `['match', matchId]` which triggers a refetch. After the backend fix, the mutation response IS the full match — but we'll keep the invalidation pattern for safety (belt-and-suspenders).

```typescript
// apps/player-pwa/src/hooks/useMatchActions.ts — NO CHANGES NEEDED
export function useJoinMatch() {
  return useMutation<MatchDetailApi, FetchError, string>({  // type updated for docs
    mutationFn: (matchId) =>
      fetcher(`/matches/${matchId}/join`, { method: 'POST' }),
    onSuccess: (_, matchId) => {
      queryClient.invalidateQueries({ queryKey: ['matches'] });
      queryClient.invalidateQueries({ queryKey: ['match', matchId] });
    },
  });
}
```

---

## 6. My Games Page Component Contract

### `MyGamesPage`

```typescript
// File: apps/player-pwa/src/app/[locale]/(main)/my-games/page.tsx

'use client';

export default function MyGamesPage() {
  // State:
  //   activeTab: 'active' | 'history'
  // Data:
  //   useMyMatches() → Match[] (adapted via adaptMatchList)
  // Derived:
  //   activeMatches = data.filter(m => ['open','full','in_progress'].includes(m.status))
  //   historyMatches = data.filter(m => ['completed','cancelled'].includes(m.status))
  //   currentList = activeTab === 'active' ? activeMatches : historyMatches
  
  // UI States:
  //   Loading: <Loader2 spinner>
  //   Error: <AlertTriangle + retry button>
  //   Empty (active tab): "No active matches" + "Join a match" CTA → /play
  //   Empty (history tab): "No match history yet"
  //   Populated: MatchCard[] list
  
  // Navigation:
  //   Back button → router.back()
  //   MatchCard tap → /match/:id
  //   Empty CTA → /play
}
```

### Profile Link Change

```typescript
// File: apps/player-pwa/src/app/[locale]/(main)/profile/page.tsx:164
// BEFORE:
href={`/${locale}/play`}
// AFTER:
href={`/${locale}/my-games`}
```

---

## 7. TypeScript Signature Summary

| Symbol | Location | Change |
|--------|----------|--------|
| `MatchesService.joinMatch()` return | `matches.service.ts` | `player` → `this.findOne(id)` → inferred as match with relations |
| `MatchesService.leaveMatch()` return | `matches.service.ts` | `{ message }` → `this.findOne(id)` |
| `MatchesService.startMatch()` return | `matches.service.ts` | `{ message, status }` → `this.findOne(id)` |
| `MatchesService.completeMatch()` return | `matches.service.ts` | `{ message, status }` → `this.findOne(id)` |
| `MatchesService.cancelMatch()` return | `matches.service.ts` | `{ message, status }` → `this.findOne(id)` |
| `NearbyMatchApi.spots_filled` semantics | `api-adapter.ts` | Includes host → **Excludes host** |
| `PitchApi.environment` | `useVenues.ts` | Was `undefined` → **Now populated** |
| `useMyMatches()` | `useUser.ts` | **NEW** — returns `NearbyMatchApi[]` |
| `MyGamesPage` | `my-games/page.tsx` | **NEW** — renders `Match[]` from adapted data |

---

## 8. i18n Key Contract

```json
// en.json additions
{
  "myGames": {
    "title": "My Games",
    "active": "Active",
    "history": "History",
    "empty": "No matches yet",
    "emptyActive": "You have no active matches",
    "emptyHistory": "No match history yet",
    "emptyCta": "Find a match",
    "loading": "Loading your matches..."
  }
}

// ar.json additions
{
  "myGames": {
    "title": "مبارياتي",
    "active": "النشطة",
    "history": "السابقة",
    "empty": "لا توجد مباريات بعد",
    "emptyActive": "ليس لديك مباريات نشطة",
    "emptyHistory": "لا يوجد سجل مباريات بعد",
    "emptyCta": "ابحث عن مباراة",
    "loading": "جاري تحميل مبارياتك..."
  }
}
```

---

## 9. Contract Verification Checklist

Before Gate 4 implementation begins, verify:

- [ ] `MatchDetailApi` type accepts the full response shape from `findOne`
- [ ] `adaptMatchDetail()` maps all `MatchDetailApi` fields (already verified — line 266-298)
- [ ] `adaptNearbyMatch()` handles `spots_filled` correctly with new semantics (passes through unchanged)
- [ ] `VenueDetailApi.pitches[].environment` is typed as `string?` (already verified — line 28)
- [ ] `MyMatchApi` ≡ `NearbyMatchApi` so `adaptMatchList()` works unchanged
- [ ] `useMyMatches()` query key `['user', 'my-matches']` doesn't collide with `['user', 'profile']` or `['user', 'stats']`
- [ ] Profile `href` change doesn't break existing navigation tests

---

**⏸️ STOP — Waiting for Gate 3 approval. This is the most critical gate. No code will be written until contracts are locked.**
