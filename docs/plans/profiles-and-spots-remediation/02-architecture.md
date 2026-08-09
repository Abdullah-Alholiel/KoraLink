# Gate 2 — Architecture: Profiles & Spots Remediation

**Feature:** `profiles-and-spots-remediation`  
**Date:** 2026-08-09  
**Input:** Gate 1 Product Spec ([01-product.md](./01-product.md))

---

## 1. Architecture Overview

This feature has **zero new database tables** and **zero new NestJS modules**. It is a pure **contract-fix + wiring** cycle. All affected code already exists — we are fixing return types, adjusting queries, and wiring an existing endpoint to a new route.

```
┌─────────────────────────────────────────────────────┐
│                    FRONTEND (PWA)                     │
│                                                       │
│  /my-games (NEW)     /match/:id      /profile         │
│  useMyMatches()    useMatch()      useUserStats()     │
│       │                 │                │             │
│       ▼                 ▼                ▼             │
│  /users/me/matches  /matches/:id   /users/me/stats    │
│       │                 │                │             │
├───────┼─────────────────┼────────────────┼─────────────┤
│       ▼                 ▼                ▼             │
│              BACKEND (NestJS API)                      │
│                                                       │
│  UsersController    MatchesController  VenuesController│
│       │                 │                │             │
│  UsersService      MatchesService    VenuesService    │
│  getMyMatches()    joinMatch() → ✅  findOne() → ✅   │
│  ✅ (unchanged)    leaveMatch() → ✅  (add environment)│
│                    startMatch() → ✅                   │
│                    completeMatch()→✅                  │
│                    cancelMatch() → ✅                  │
│                    findNearby()  → ✅ (fix spots)     │
│       │                 │                │             │
│       ▼                 ▼                ▼             │
│              PostgreSQL + Drizzle ORM                  │
└─────────────────────────────────────────────────────┘
```

---

## 2. Component Changes

### 2.1 Backend: `MatchesService` — Mutation Return Types

**All 5 mutation methods** currently return bare rows or plain objects. Each will be changed to return `this.findOne(matchId)` — the fully populated match with `host`, `pitch.venue`, and `players.user` relations.

| Method | Current Return | New Return | Risk |
|--------|---------------|------------|------|
| `joinMatch()` | `player` (bare match_players row) | `this.findOne(matchId)` | Transaction must commit before findOne reads |
| `leaveMatch()` | `{ message }` | `this.findOne(matchId)` | Same — tx must commit first |
| `startMatch()` | `{ message, status }` | `this.findOne(matchId)` | Same |
| `completeMatch()` | `{ message, status }` | `this.findOne(matchId)` | Same |
| `cancelMatch()` | `{ message, status }` | `this.findOne(matchId)` | Same |

**Critical detail:** `this.findOne()` runs OUTSIDE the transaction. This is correct because:
1. The transaction commits the mutation
2. `findOne` reads the committed state with all relations
3. Drizzle's `findFirst` with `with:` clauses does NOT work inside a transaction that hasn't committed yet (the relations query needs committed data)

For `joinMatch`, the current code already calls `findOne` at the end for `createMatch` (line 400). Same pattern applies.

### 2.2 Backend: `MatchesService.findNearby()` — Spots Accuracy

**Change the `spots_filled` calculation** to exclude the host:

```sql
-- Current (includes host):
COUNT(mp.id)::int AS spots_filled

-- New (excludes host):
COUNT(mp.id) FILTER (WHERE mp.is_host = false)::int AS spots_filled
```

This ensures a newly created match shows "0/N spots" instead of "1/N spots", since the host is the organizer, not a "filled spot."

**Product decision (from Gate 1 Q1):** `max_players` includes the host. So `max_players = 10` means host + 9 joinable spots.

### 2.3 Backend: `VenuesService.findOne()` — Missing Field

Add `environment` to the pitch column selection:

```typescript
// Current (line 107-114):
pitches: {
  columns: {
    id: true, name: true, size: true,
    surface_type: true, hourly_rate: true,
  },
}

// New:
pitches: {
  columns: {
    id: true, name: true, size: true,
    surface_type: true, hourly_rate: true,
    environment: true,  // ← ADDED
  },
}
```

### 2.4 Frontend: New Route — `/my-games`

**Route:** `apps/player-pwa/src/app/[locale]/(main)/my-games/page.tsx`  
**Data source:** `GET /users/me/matches` (already exists at controller line 44)  
**Navigation:** Profile "My Games" menu item → `/my-games`

**Component tree:**
```
MyGamesPage
├── MobileFrame
├── Header ("My Games" + back button)
├── Status Tabs (Active | History) — client-side filter
├── MatchCard[] (reused component)
│   └── Uses adaptNearbyMatch() — same adapter as feed
└── Empty State (no matches yet)
```

**Hooks:**
- `useMyMatches()` — new hook in `hooks/useUser.ts`
- Uses existing `fetcher` calling `/users/me/matches`
- Returns the same shape as `NearbyMatchApi[]` → adapted via `adaptMatchList()`

### 2.5 Frontend: Profile "My Games" Link

Change the `MenuItem` `href` from `/${locale}/play` to `/${locale}/my-games` in `profile/page.tsx` line 164.

### 2.6 Frontend: Match Detail — Roster After Join

The `useJoinMatch` hook already invalidates `['match', matchId]` after mutation. Once the backend returns the full match from `joinMatch`, React Query will refetch the detail and the roster will update automatically. **No frontend changes needed for US-1 and US-2** — the existing invalidation pattern handles it.

### 2.7 Descoped: MatchCard Roster Avatars

The Gate 1 recommendation to add roster avatars to feed cards is **descoped from this cycle**. Reason: the feed query (`findNearby`) does not include player data, and adding it would require either:
- A heavy subquery (N+1 per match in the feed)
- A separate batch endpoint

This is better handled in a future "Feed UX Enhancement" cycle with a dedicated API design.

---

## 3. Data Flow

### Flow A: Join Match → Updated UI

```
User taps "Join Match"
  ↓
PaymentSheet → confirm
  ↓
POST /matches/:id/join
  ↓
backend: joinMatch() → tx.commit() → this.findOne(matchId)
  ↓
response: { id, title, host: {...}, pitch: { venue: {...} }, players: [{user: {...}}], ... }
  ↓
useJoinMatch.onSuccess → invalidateQueries(['match', matchId])
  ↓
useMatch(id) refetches → adaptMatchDetail() → roster updated
  ↓
UI re-renders: user appears in roster, spots count updates, "Joined" badge shows
```

### Flow B: My Games → Match Detail

```
User taps "My Games" on profile
  ↓
Navigate to /my-games
  ↓
useMyMatches() → GET /users/me/matches
  ↓
adaptMatchList() → Match[]
  ↓
Render MatchCard[] (reused)
  ↓
User taps a card → navigate to /match/:id
  ↓
useMatch(id) → GET /matches/:id → adaptMatchDetail() → full detail
```

---

## 4. Files Changed

### Backend (3 files)
| File | Change |
|------|--------|
| `apps/api/src/modules/matches/matches.service.ts` | joinMatch, leaveMatch, startMatch, completeMatch, cancelMatch → return `this.findOne()`; findNearby → `FILTER (WHERE is_host = false)` |
| `apps/api/src/modules/venues/venues.service.ts` | findOne → add `environment` to pitch columns |

### Frontend (4 files)
| File | Change |
|------|--------|
| `apps/player-pwa/src/app/[locale]/(main)/my-games/page.tsx` | NEW — My Games page |
| `apps/player-pwa/src/hooks/useUser.ts` | NEW — `useMyMatches()` hook |
| `apps/player-pwa/src/app/[locale]/(main)/profile/page.tsx` | "My Games" link → `/my-games` |
| `apps/player-pwa/src/messages/ar.json` | NEW i18n keys for My Games page |
| `apps/player-pwa/src/messages/en.json` | NEW i18n keys for My Games page |

### No Changes
- No new DB migrations
- No new NestJS modules/controllers
- No new Drizzle schema changes
- No new Zustand slices
- No changes to `lib/fetcher.ts` or `lib/api-adapter.ts`

---

## 5. i18n Keys (New)

| Key | English | Arabic |
|-----|---------|--------|
| `myGames.title` | My Games | مبارياتي |
| `myGames.active` | Active | نشطة |
| `myGames.history` | History | السابقة |
| `myGames.empty` | No matches yet | لا توجد مباريات بعد |
| `myGames.emptyCta` | Join a match to get started | انضم لمباراة للبدء |
| `myGames.loading` | Loading your matches... | جاري تحميل مبارياتك... |

---

## 6. Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| `findOne()` inside transaction may not see committed data | Call `findOne` OUTSIDE the transaction (after `tx` completes) — same pattern as `createMatch` line 400 |
| `spots_filled` change breaks existing UI math | Only `MatchCard` and `MatchDetailPage` use this — both use `totalSpots - filledSpots`. If we change `filledSpots` to exclude host, total `spotsLeft` increases by 1. Update `MatchCard` closing-soon logic accordingly |
| `leaveMatch` tx reads then writes then reads outside — race condition | Single-user operation (user leaves their own membership). No concurrent access issue. |
| New `/my-games` page has no BottomNav highlight | Add `my-games` to BottomNav or leave unhighlighted (profile is the parent nav item) |

---

## 7. Build & Test Impact

- **Build:** No new dependencies. `turbo run build` should remain green.
- **Tests:** No test files changed. Existing 85 tests should continue to pass.  
- **New tests needed:** Integration test for `joinMatch` returning full match shape (future enhancement).

---

**⏸️ STOP — Waiting for Gate 2 approval. Proceed to Gate 3 only after explicit user confirmation.**
