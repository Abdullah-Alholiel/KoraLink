# Gate 2 — Architecture: Feed Visibility & Chat Access Remediation

**Feature slug:** `feed-chat-access-fix`  
**Date:** 2026-08-09  
**Input:** Gate 1 Product Spec ([01-product.md](./01-product.md))

---

## 1. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        FRONTEND (Next.js PWA)                    │
│                                                                  │
│  Root Layout ([locale]/layout.tsx)                               │
│  └─ AuthBootstrap (NEW)  ← populates Zustand from cookie        │
│                                                                  │
│  ┌─ Play Page ─────────────────────────────────────────────┐    │
│  │  useMatches() → GET /matches                             │    │
│  │  adaptMatchList(rows) → Match[]                          │    │
│  │  MatchCard(match, currentUserId)                         │    │
│  │  Button state: isJoined (from API) / isUserHost (fallback)│   │
│  └──────────────────────────────────────────────────────────┘    │
│                                                                  │
│  ┌─ Messages Page ─────────────────────────────────────────┐    │
│  │  useMyMatches() → GET /users/me/matches                  │    │
│  │  adaptMatchList(rows) → Match[]                          │    │
│  │  Conditional label: isJoined ? "Open Chat" : "Join Chat" │    │
│  │  Navigate: /match/:id?chat=open                          │    │
│  └──────────────────────────────────────────────────────────┘    │
│                                                                  │
│  ┌─ Match Detail Page ─────────────────────────────────────┐    │
│  │  useMatch(id) → GET /matches/:id                         │    │
│  │  adaptMatchDetail(raw, currentUserId)                    │    │
│  │  match.isJoined / match.isUserHost (from adapter)        │    │
│  │  Hero: MessageSquare (joined) → opens ChatSheet          │    │
│  │  ChatSheet (NEW) → GET /matches/:id/messages             │    │
│  └──────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                        BACKEND (NestJS API)                       │
│                                                                  │
│  GET /matches                                                    │
│  └─ findNearby(dto, currentUserId)                               │
│     └─ BOOL_OR(mp.user_id = $1::uuid) AS is_joined  ← FIX       │
│                                                                  │
│  GET /users/me/matches                                           │
│  └─ getMyMatches(userId)                                         │
│     └─ TRUE AS is_joined  (unchanged)                            │
│                                                                  │
│  GET /matches/:id                                                │
│  └─ findOne(matchId) — returns full roster (unchanged)          │
│                                                                  │
│  GET /matches/:id/messages                                       │
│  └─ getMessages(matchId) — REST chat history (unchanged)        │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. Resolving the 6 Open Questions

### Q1: Feed SQL Fix — `BOOL_OR` replaces `EXISTS`

**Decision:** Replace the `EXISTS` subquery with a `BOOL_OR` aggregate function on the existing `LEFT JOIN match_players mp`.

**Why:** The `EXISTS(subquery)` inside Drizzle's `db.execute(sql`...`)` is the root cause of the empty feed. `BOOL_OR` is a standard PostgreSQL aggregate that returns `TRUE` if any row in the group satisfies the condition. It uses the existing `mp` JOIN — no additional subquery or table scan needed.

**Before (broken):**
```sql
EXISTS(
  SELECT 1 FROM match_players mu
  WHERE mu.match_id = m.id AND mu.user_id = ${currentUserId ?? null}::uuid
) AS is_joined
```

**After (fixed):**
```sql
COALESCE(BOOL_OR(mp.user_id = ${currentUserId}::uuid), FALSE) AS is_joined
```

**Edge cases handled:**
| Scenario | `BOOL_OR` result | `COALESCE` → |
|----------|-----------------|-------------|
| User is joined, match has players | `TRUE` | `TRUE` ✅ |
| User is not joined, match has players | `FALSE` | `FALSE` ✅ |
| Match has no players (brand new) | `NULL` (empty set) | `FALSE` ✅ |
| `currentUserId` is null (unauth) | `NULL` (= NULL is NULL) | `FALSE` ✅ |

**SQL placement:** The `BOOL_OR` expression sits alongside the existing `COUNT(...) AS spots_filled` in the SELECT list. Both reference `mp` from the existing `LEFT JOIN match_players mp ON mp.match_id = m.id`.

**Why not Drizzle query builder?** The `findNearby` query uses PostGIS functions (`ST_DWithin`, `ST_Distance`) and dynamic `WHERE` clauses (`geoClause`, `dateClause`). Migrating to `db.select()` would require wrapping every PostGIS call in `sql` fragments — same complexity, no benefit. The `BOOL_OR` fix is a 1-line change that keeps the existing raw SQL pattern.

### Q2: Chat UI Structure — `ChatSheet` Bottom Sheet

**Decision:** New `ChatSheet` bottom sheet component on the match detail page. Accessible via `?chat=open` query parameter for auto-open.

**Why a bottom sheet?**
- Keeps user on the match detail page (no navigation away)
- Reuses existing bottom sheet pattern (`CancelMatchSheet`, `LeaveMatchSheet`, `PaymentSheet`)
- Matches the mobile-first PWA design language
- REST-only for this cycle (real-time WebSocket deferred)

**Component contract:**
```
ChatSheet
├── Props: isOpen, onClose, matchId, matchTitle
├── Data: GET /matches/:id/messages → adaptMatchDetail().comments
├── States: Loading (spinner), Populated (message list), Empty ("No messages yet")
└── Send: Text input + send button → POST /matches/:id/messages (or WebSocket in future)
```

**Entry points:**
1. **Match detail hero icon** (MessageSquare): `onClick` → `setShowChatSheet(true)`
2. **Messages list "Open Chat"**: navigates to `/${locale}/match/${id}?chat=open` → detail page reads query param → auto-opens `ChatSheet`
3. **`?chat=open` auto-open**: `useEffect` on detail page checks `searchParams.get('chat')` → if `'open'` → `setShowChatSheet(true)`

**Why not a dedicated `/match/:id/chat` route?** OUT OF SCOPE for this cycle. The bottom sheet provides immediate chat access with zero new routes. A dedicated chat page with real-time WebSocket is a separate feature cycle.

### Q3: Zustand Cold-Load — `AuthBootstrap` Component

**Decision:** New `AuthBootstrap` client component in root `[locale]/layout.tsx`. On mount, checks if Zustand `user` is null. If null AND `isAuthenticated` is true (from persisted state) OR a cookie exists, calls `GET /users/me` and populates Zustand via `login()`.

**Why a top-level component?**
- Runs once on any page load, regardless of entry point
- Handles all cold-load scenarios: direct URL navigation, shared links, new tab
- Works with existing Zustand `persist` middleware (serves as fallback when localStorage is empty)

**Component behavior:**
```
AuthBootstrap mounts
  ├─ Zustand user != null → DO NOTHING (already populated from persist or prior login)
  └─ Zustand user == null
       ├─ Call GET /users/me (cookie sent automatically via credentials:'include')
       ├─ On success → useAppStore.getState().login(profile, '')
       └─ On error (401/no cookie) → DO NOTHING (user is genuinely unauthenticated)
```

**Placement:**
```tsx
// apps/player-pwa/src/app/[locale]/layout.tsx
export default function LocaleLayout({ children, params }) {
  return (
    <NextIntlClientProvider messages={messages}>
      <QueryProvider>
        <PostHogProvider>
          <AuthBootstrap />   {/* ← NEW: runs on every page */}
          {children}
        </PostHogProvider>
      </QueryProvider>
    </NextIntlClientProvider>
  );
}
```

**Hydration safety:** `AuthBootstrap` renders nothing (`return null`). It only executes `useEffect` on the client. No SSR/hydration mismatch.

**React Query integration:** Uses `useQuery` internally (`queryKey: ['auth', 'bootstrap']`) so the result is cached. Subsequent page navigations don't re-fetch.

### Q4: Adapter Consistency — `adaptMatchDetail` sets `isJoined`/`isUserHost`

**Decision:** Add optional `currentUserId` parameter to `adaptMatchDetail`. Set `isJoined` and `isUserHost` on the returned `Match` object. Remove manual computation from the match detail page.

**Before:**
```typescript
// api-adapter.ts
export function adaptMatchDetail(detail: MatchDetailApi): Match {
  return {
    // ... all fields ...
    // isJoined: NOT SET
    // isUserHost: NOT SET
  };
}

// match/[id]/page.tsx — manual computation
const isJoined = currentUserId && match
    ? match.roster.some((p) => p.userId === currentUserId)
    : false;
const isUserHost = currentUserId && match
    ? match.hostId === currentUserId
    : false;
```

**After:**
```typescript
// api-adapter.ts
export function adaptMatchDetail(
  detail: MatchDetailApi,
  currentUserId?: string
): Match {
  const players = detail.players ?? [];
  return {
    // ... all existing fields ...
    roster: buildRoster(players),
    comments: buildComments(detail.messages ?? []),
    isJoined: currentUserId
      ? players.some(p => p.user.id === currentUserId)
      : false,
    isUserHost: currentUserId
      ? detail.host_id === currentUserId
      : false,
  };
}

// match/[id]/page.tsx — simplified
const isJoined = match?.isJoined ?? false;
const isUserHost = match?.isUserHost ?? false;
```

**Why this matters:** The `MatchCard` component already reads `match.isJoined` and `match.isUserHost` (with fallbacks). The match detail page should use the same pattern for consistency. This also eliminates the inline computation that silently fails when `currentUserId` is null.

### Q5: Hook Parameter Passing — `useMatches` unchanged

**Decision:** Do NOT change `useMatches` hook signature. The `isUserHost` field is handled by `MatchCard`'s existing fallback logic. The `isJoined` field comes from the server's `BOOL_OR` aggregate.

**Why not pass `currentUserId`?**
- `isJoined` comes from the server (per-user API response via cookie) — no client-side computation needed
- `isUserHost` is computed by `MatchCard`'s fallback: `match.isUserHost ?? (currentUserId ? match.hostId === currentUserId : false)`
- Adding `currentUserId` to the hook signature would either: (a) add it to the query key (causing unnecessary refetches when Zustand hydrates), or (b) use a stale closure if not in the query key
- The `PlayPage` already passes `currentUserId` to `MatchCard` via props

**Trade-off acknowledged:** The adapter layer `adaptNearbyMatch(row)` sets `isUserHost: false` (because `currentUserId` is `undefined`). But `MatchCard` overrides this with its fallback using the `currentUserId` prop. This is two layers of computation for one field, but it's safe (both produce the same result) and doesn't require changing the hook.

### Q6: Messages Page Adapter — `adaptMatchList` + conditional label

**Decision:** Keep using `adaptMatchList` for the messages page. Add conditional label logic based on `match.isJoined`.

**Why `adaptMatchList`?**
- The messages page receives data shaped like `NearbyMatchApi[]` from `GET /users/me/matches`
- `adaptMatchList` maps these to `Match[]` with `isJoined: TRUE` (from the server-side `TRUE AS is_joined`)
- No need for roster data on the messages page — cards show summary info, not player lists
- Using `adaptMatchDetail` would require a separate API call per match (N+1 problem)

**Conditional label:**
```tsx
{match.isJoined ? (
  <Link href={`/${locale}/match/${match.id}?chat=open`}
        className="bg-brand-green/10 text-brand-green ...">
    {t('messages.openChat')}
  </Link>
) : (
  <Link href={`/${locale}/match/${match.id}`}
        className="bg-brand-green text-white ...">
    {t('messages.joinChat')}
  </Link>
)}
```

**Edge case:** Since `useMyMatches()` returns only matches the user has joined, `isJoined` is always `TRUE`. The `!isJoined` branch is unreachable but exists as defensive code in case the data source changes.

---

## 3. Component Changes — Per File

### Backend (`apps/api`)

| File | Change | Why |
|------|--------|-----|
| `matches.service.ts:109` | Replace `EXISTS(...)` with `COALESCE(BOOL_OR(...), FALSE)` | Fix empty feed regression (Q1) |

### Frontend (`apps/player-pwa`)

| File | Change | Type | Why |
|------|--------|------|-----|
| **NEW** `components/auth/AuthBootstrap.tsx` | Client component: on mount, calls `GET /users/me` if Zustand `user` is null | New | Cold-load Zustand population (Q3) |
| **NEW** `components/matches/ChatSheet.tsx` | Bottom sheet: fetches + displays match messages via `GET /matches/:id/messages` | New | Chat access entry point (Q2) |
| `app/[locale]/layout.tsx` | Add `<AuthBootstrap />` inside providers | Edit | Wire cold-load fix |
| `app/[locale]/match/[id]/page.tsx` | 1. Pass `currentUserId` to `adaptMatchDetail`; 2. Remove manual `isJoined`/`isUserHost` computation; 3. Add `ChatSheet` + `?chat=open` auto-open; 4. Message icon opens `ChatSheet` instead of navigating to `/messages` | Edit | Chat access + adapter consistency (Q2, Q4) |
| `app/[locale]/(main)/messages/page.tsx` | 1. Conditional label: `isJoined ? "Open Chat" : "Join Chat"`; 2. Navigate to `/match/:id?chat=open` for joined matches; 3. Add new i18n key `messages.openChat` | Edit | Conditional label (Q6) |
| `lib/api-adapter.ts` | 1. `adaptMatchDetail` + `currentUserId?` param; 2. Set `isJoined`/`isUserHost` from roster/hostId comparison | Edit | Adapter consistency (Q4) |
| `messages/en.json` | Add `messages.openChat: "Open Chat"` | Edit | i18n |
| `messages/ar.json` | Add `messages.openChat: "افتح المحادثة"` | Edit | i18n |

**Total: 2 new files, 6 edited files. 2 i18n keys added.**

---

## 4. Data Flow Diagrams

### 4.1 Play Feed — Fixed Flow

```
Browser (authenticated, cookie present)
  │
  ├─ AuthBootstrap mounts
  │   └─ GET /users/me → Zustand.login(user)  (if user null)
  │
  ├─ PlayPage renders
  │   ├─ useMatches({ date }) → fetcher GET /matches
  │   │   └─ Cookie → API → JwtCookieAuthGuard → user.sub
  │   │       └─ findNearby(dto, user.sub)
  │   │           └─ SQL: COALESCE(BOOL_OR(mp.user_id = $1::uuid), FALSE) AS is_joined
  │   │               → NearbyMatchRow[] (with is_joined boolean per match)
  │   │                   → adaptMatchList(rows) → Match[]
  │   │                       → match.isJoined = row.is_joined  ✅
  │   │                       → match.isUserHost = false  (fallback)
  │   │
  │   ├─ currentUserId = useAppStore(selectUser).id  (now non-null from AuthBootstrap)
  │   │
  │   └─ matches.map(m => <MatchCard match={m} currentUserId={currentUserId} />)
  │       └─ MatchCard computes:
  │           isJoined = match.isJoined ?? roster.some(...)  → TRUE/FALSE ✅
  │           isHost = match.isUserHost ?? (currentUserId ? match.hostId === currentUserId : false)
  │           → Renders correct button ✅
```

### 4.2 Chat Access Flow — Unlocked

```
User on Match Detail Page (joined to match)
  │
  ├─ Zustand populated (AuthBootstrap or persist)
  │   └─ currentUserId = "uuid-abc"
  │
  ├─ useMatch(id) → GET /matches/:id
  │   └─ adaptMatchDetail(raw, currentUserId)
  │       ├─ isJoined = detail.players.some(p => p.user.id === currentUserId) → TRUE ✅
  │       └─ isUserHost = detail.host_id === currentUserId → TRUE/FALSE ✅
  │
  ├─ Hero section:
  │   └─ MessageSquare icon (isJoined=true)  ← NOT Share2
  │       └─ onClick → setShowChatSheet(true)
  │           └─ ChatSheet opens
  │               └─ GET /matches/:id/messages → Comment[]
  │                   └─ Message list renders ✅
  │
  ├─ Joined content area (isJoined=true):
  │   ├─ GameDetails (hasJoined=true)
  │   ├─ LocationMap
  │   ├─ TeamLineup
  │   ├─ Leave Match button (if !isUserHost)
  │   ├─ Cancel Match button (if isUserHost)
  │   └─ WhatsApp Invite CTA
  │
  └─ ChatSheet (overlay):
      ├─ Header: match title + close button
      ├─ Message list: comments from REST API
      ├─ Empty state: "No messages yet — start the conversation!"
      └─ Input: text field + send (future: POST /matches/:id/messages)
```

### 4.3 Messages List — Conditional Labels

```
Messages Page
  │
  ├─ useMyMatches() → GET /users/me/matches
  │   └─ Server: TRUE AS is_joined  (all are joined)
  │       └─ adaptMatchList(rows) → Match[]
  │           └─ match.isJoined = TRUE ✅
  │
  ├─ myMatches.map(match =>
  │   ┌─ Card: venue, date, time, spots, host
  │   └─ match.isJoined === true
  │       └─ "Open Chat" → /match/:id?chat=open  ✅
  │       └─ ELSE "Join Match" → /match/:id  (defensive, unreachable)
  │   )
```

---

## 5. `ChatSheet` Component Design

### 5.1 States

| State | Visual | Trigger |
|-------|--------|---------|
| **Loading** | Centered `Loader2` spinner | Initial message fetch |
| **Empty** | Chat bubble icon + "No messages yet — start the conversation!" | API returns `[]` |
| **Populated** | Scrollable message list (newest at bottom) | API returns messages |
| **Error** | AlertTriangle + "Couldn't load messages" + Retry | API 500 |

### 5.2 Layout

```
┌─────────────────────────────────────┐
│  Overlay (bg-black/50, tap to close) │
│                                      │
│  ┌─────────────────────────────────┐│
│  │  Pull handle ─────              ││
│  │  Match Chat                     ││
│  │  ────────────────────────────── ││
│  │                                  ││
│  │  [Ahmed] Great game everyone!   ││
│  │  [Khalid] See you at 8pm        ││
│  │  [Faisal] I'll bring the ball   ││
│  │  ...                             ││
│  │                                  ││
│  │  ────────────────────────────── ││
│  │  [    Type a message...    ] 📤  ││
│  └─────────────────────────────────┘│
└─────────────────────────────────────┘
```

### 5.3 Message Display

Each message row:
```
┌─ Avatar (first letter) ─┬─ User Name ──────────── time ─┐
│                         │                                │
│                         └─ Message text ─────────────────┘
```

### 5.4 Send Message (P2 / future cycle)

The `ChatSheet` includes a text input + send button. In this cycle, the send button is **present but disabled** with a tooltip "Chat coming soon." The REST endpoint `POST /matches/:id/messages` exists but is deferred to a future cycle. This cycle focuses on READ access to the chat history.

---

## 6. `AuthBootstrap` Component Design

### 6.1 State Machine

```
AuthBootstrap mounts
  │
  ├─ Hydration not complete (isHydrated = false)
  │   └─ DO NOTHING (wait for persist middleware)
  │
  ├─ Hydration complete + user != null
  │   └─ DO NOTHING (already populated)
  │
  ├─ Hydration complete + user == null
  │   └─ useQuery(['auth', 'bootstrap'], () => fetcher('/users/me'))
  │       ├─ Pending → DO NOTHING (no UI)
  │       ├─ Success → useAppStore.getState().login(profile, '')
  │       └─ Error (401) → DO NOTHING (user is unauthenticated)
  │
  └─ Renders: NULL (always)
```

### 6.2 Key Implementation Details

```typescript
// AuthBootstrap.tsx
'use client';

export default function AuthBootstrap() {
  const user = useAppStore(selectUser);
  const isHydrated = useAppStore(s => s.isHydrated);
  const login = useAppStore(s => s.login);

  useQuery({
    queryKey: ['auth', 'bootstrap'],
    queryFn: () => fetcher<UserProfileApi>('/users/me'),
    enabled: isHydrated && !user,  // Only run when hydrated AND no user
    staleTime: 60_000,
    retry: false,  // Don't retry 401 — user is unauthenticated
    onSuccess: (profile) => { /* populate Zustand */ },
  });

  return null;  // No UI
}
```

**Why `staleTime: 60_000`?** Prevents re-fetch on every client-side navigation. Once populated, the bootstrap query is satisfied and won't re-run.

**Why `retry: false`?** If the user is unauthenticated (no cookie), `GET /users/me` returns 401. React Query should NOT retry — the user simply isn't logged in.

---

## 7. i18n Keys

| Key | English | Arabic | Used In |
|-----|---------|--------|---------|
| `messages.openChat` | Open Chat | افتح المحادثة | Messages page (NEW) |
| `chatSheet.title` | Match Chat | محادثة المباراة | ChatSheet header (NEW) |
| `chatSheet.emptyTitle` | No messages yet | لا توجد رسائل بعد | ChatSheet empty state (NEW) |
| `chatSheet.emptyDescription` | Start the conversation! | ابدأ المحادثة! | ChatSheet empty state (NEW) |
| `chatSheet.sendPlaceholder` | Type a message... | اكتب رسالة... | ChatSheet input (NEW) |
| `chatSheet.comingSoon` | Chat coming soon | المحادثة قريباً | ChatSheet disabled send (NEW) |

---

## 8. Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| `BOOL_OR` aggregate might not work identically across PostgreSQL versions | Test against PostgreSQL 16 (Docker) — `BOOL_OR` has been stable since PG 9.0 |
| `AuthBootstrap` adds latency to first render (extra API call on cold load) | Call happens in background; Zustand defaults are safe (isJoined=false, etc.); UI updates reactively when Zustand populates |
| `ChatSheet` inside `MobileFrame` might conflict with existing sheets (Cancel, Leave, Payment, TeamLineup, Rules) | Sheets are mutually exclusive (only one open at a time); `ChatSheet` uses same z-index and overlay pattern |
| `adaptMatchDetail` signature change breaks existing callers (useMatch hook) | `currentUserId` is optional; existing callers without it get `isJoined: false, isUserHost: false` — same as current behavior |
| `?chat=open` query param pattern requires `useSearchParams` in a client component wrapped in `Suspense` | Match detail page already uses `use(params)` not `useSearchParams`; add a separate client component for chat auto-open logic |

---

## 9. Files Changed Summary

| # | File | Type | Lines |
|---|------|------|-------|
| 1 | `apps/api/src/modules/matches/matches.service.ts` | Edit | ~1 line changed |
| 2 | **NEW** `apps/player-pwa/src/components/auth/AuthBootstrap.tsx` | New | ~40 lines |
| 3 | **NEW** `apps/player-pwa/src/components/matches/ChatSheet.tsx` | New | ~120 lines |
| 4 | `apps/player-pwa/src/app/[locale]/layout.tsx` | Edit | ~3 lines added |
| 5 | `apps/player-pwa/src/app/[locale]/match/[id]/page.tsx` | Edit | ~20 lines changed |
| 6 | `apps/player-pwa/src/app/[locale]/(main)/messages/page.tsx` | Edit | ~15 lines changed |
| 7 | `apps/player-pwa/src/lib/api-adapter.ts` | Edit | ~10 lines changed |
| 8 | `apps/player-pwa/src/messages/en.json` | Edit | ~6 lines added |
| 9 | `apps/player-pwa/src/messages/ar.json` | Edit | ~6 lines added |

**Total: 2 new files, 7 edited files. ~220 lines changed.**

---

## 10. What is Descoped (and Why)

| Descoped | Reason |
|----------|--------|
| Real-time WebSocket chat | Separate feature cycle; REST history is sufficient for P0 chat access |
| Chat message sending (`POST /messages`) | P2 polish; endpoint exists but UI deferred |
| Play feed adapter `currentUserId` pass-through | MatchCard fallback handles `isUserHost`; `isJoined` from server works without client user ID |
| Refactoring `findNearby` to Drizzle query builder | PostGIS functions require `sql` fragments anyway; no benefit over raw SQL fix |
| Sentry/Pino/PostHog instrumentation | Deferred to Slice 3 per Software Factory rules (§4) |

---

**⏸️ STOP — All 6 open questions resolved. 2 new components, 7 file edits, 0 route changes. Gate 2 ready for review.**
