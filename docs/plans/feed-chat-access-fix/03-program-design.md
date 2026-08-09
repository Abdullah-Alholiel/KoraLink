# Gate 3 — Program Design: Feed Visibility & Chat Access Remediation

**Feature slug:** `feed-chat-access-fix`  
**Date:** 2026-08-09  
**Input:** Gate 2 Architecture ([02-architecture.md](./02-architecture.md))

---

## 1. Backend Contract — `findNearby` SQL Fix

### 1.1 Change (exactly 1 line in `matches.service.ts`)

**File:** `apps/api/src/modules/matches/matches.service.ts`, line 118-121

**Before (broken):**
```sql
EXISTS(
  SELECT 1 FROM match_players mu
  WHERE mu.match_id = m.id AND mu.user_id = ${currentUserId ?? null}::uuid
)                         AS is_joined
```

**After (fixed):**
```sql
COALESCE(BOOL_OR(mp.user_id = ${currentUserId}::uuid), FALSE) AS is_joined
```

### 1.2 Type Contract (unchanged)

```typescript
// matches.service.ts — NO CHANGE to interface
export interface NearbyMatchRow {
  id: string;
  title: string;
  match_type: string;
  gender_rule: string;
  status: string;
  scheduled_at: Date;
  duration_mins: number;
  price_per_player: number;
  max_players: number;
  spots_filled: number;
  distance_m: number;
  host_id: string;
  host_name: string | null;
  host_avatar: string | null;
  pitch_id: string;
  pitch_name: string;
  venue_name: string;
  venue_city: string;
  is_joined: boolean;  // ← NOW POPULATED BY BOOL_OR
}
```

### 1.3 Controller Contract (unchanged)

```typescript
// matches.controller.ts — NO CHANGE
@Get()
findNearby(
  @CurrentUser() user: { sub: string },
  @Query() dto: GetMatchesDto
): Promise<NearbyMatchRow[]>
```

### 1.4 Expected API Response (GET /matches)

```json
[
  {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "title": "Friday Night 5v5",
    "match_type": "Casual",
    "gender_rule": "Men Only",
    "status": "Open",
    "scheduled_at": "2026-08-15T20:00:00.000Z",
    "duration_mins": 60,
    "price_per_player": 37.5,
    "max_players": 10,
    "spots_filled": 3,
    "distance_m": 1250.5,
    "host_id": "111e8400-e29b-41d4-a716-446655440001",
    "host_name": "Ahmed Al-Rashid",
    "host_avatar": null,
    "pitch_id": "222e8400-e29b-41d4-a716-446655440002",
    "pitch_name": "Pitch A",
    "venue_name": "Al-Nasser Stadium",
    "venue_city": "Riyadh",
    "is_joined": true
  }
]
```

### 1.5 `getMyMatches` — No Changes

`TRUE AS is_joined` already present (added in Cycle 7, users.service.ts:94). No regression — works correctly.

---

## 2. Frontend Adapter Contracts

### 2.1 `NearbyMatchApi` (unchanged)

```typescript
// api-adapter.ts — NO CHANGE
export interface NearbyMatchApi {
  id: string;
  title: string;
  match_type: string;
  gender_rule: string;
  status: string;
  scheduled_at: string | Date;
  duration_mins: number;
  price_per_player: number;
  max_players: number;
  spots_filled: number;
  distance_m: number | null;
  host_id: string;
  host_name: string | null;
  host_avatar: string | null;
  pitch_id: string;
  pitch_name: string;
  venue_name: string;
  venue_city: string;
  is_joined: boolean;  // ← NOW WORKS (fixed by BOOL_OR)
}
```

### 2.2 `adaptNearbyMatch` (unchanged)

```typescript
// api-adapter.ts — NO CHANGE
export function adaptNearbyMatch(
  row: NearbyMatchApi,
  currentUserId?: string
): Match;

// Returns:
// {
//   ...,
//   isJoined: row.is_joined,           // ← from BOOL_OR, now correct
//   isUserHost: currentUserId
//     ? row.host_id === currentUserId
//     : false,
// }
```

### 2.3 `adaptMatchDetail` — NEW SIGNATURE

```typescript
// api-adapter.ts — MODIFIED
export function adaptMatchDetail(
  detail: MatchDetailApi,
  currentUserId?: string
): Match;

// NEW fields set on Match:
// {
//   ...all existing fields...,
//   isJoined: currentUserId
//     ? (detail.players ?? []).some(p => p.user.id === currentUserId)
//     : false,
//   isUserHost: currentUserId
//     ? detail.host_id === currentUserId
//     : false,
// }
```

**Edge case verification:**
| `currentUserId` | `players` | `isJoined` result | `isUserHost` result |
|---|---|---|---|
| `undefined` | any | `false` | `false` |
| `"uuid-abc"` | `[]` | `false` | depends on `host_id` |
| `"uuid-abc"` | `[{user:{id:"uuid-abc"}}]` | `true` | depends on `host_id` |
| `"uuid-abc"` | `[{user:{id:"uuid-xyz"}}]` | `false` | depends on `host_id` |

### 2.4 `adaptMatchList` (unchanged)

```typescript
// api-adapter.ts — NO CHANGE
export function adaptMatchList(
  rows: NearbyMatchApi[],
  currentUserId?: string
): Match[];
```

---

## 3. New Hooks

### 3.1 `useMatchMessages` (NEW)

```typescript
// hooks/useMatches.ts — NEW export

import type { MatchMessageApi } from '@/lib/api-adapter';

export function useMatchMessages(matchId: string) {
  return useQuery<MatchMessageApi[], FetchError>({
    queryKey: ['match', matchId, 'messages'],
    queryFn: () =>
      fetcher<MatchMessageApi[]>(`/matches/${matchId}/messages`),
    enabled: !!matchId,
    staleTime: 15_000,  // chat messages update frequently
  });
}
```

**API response shape (GET /matches/:id/messages):**
```json
[
  {
    "id": "msg-001",
    "content": "Great game everyone!",
    "created_at": "2026-08-15T19:30:00.000Z",
    "user": {
      "id": "111e8400-...",
      "full_name": "Ahmed Al-Rashid",
      "avatar_url": null
    }
  }
]
```

**Adapter:** Use existing `buildComments()` from `api-adapter.ts:217-226`:
```typescript
function buildComments(messages: MatchMessageApi[]): Comment[] {
  return messages.map((m) => ({
    id: m.id,
    userId: m.user.id,
    userName: m.user.full_name ?? 'Player',
    userAvatar: m.user.avatar_url ?? '',
    text: m.content,
    createdAt: m.created_at,
  }));
}
```

### 3.2 `useMatch` — Caller Change Only

```typescript
// hooks/useMatches.ts — NO SIGNATURE CHANGE

export function useMatch(id: string) {
  return useQuery<Match, FetchError>({
    queryKey: ['match', id],
    queryFn: async () => {
      const raw = await fetcher<MatchDetailApi>(`/matches/${id}`);
      // OLD: return adaptMatchDetail(raw);
      // NEW: pass currentUserId for isJoined/isUserHost
      const storeUser = useAppStore.getState().user;
      return adaptMatchDetail(raw, storeUser?.id);
    },
    enabled: !!id,
  });
}
```

**Rationale for `getState()`:** The hook's `queryFn` runs once per fetch. Using `getState()` at call time captures the current Zustand value. This is reactive enough — if the user logs in later, the query key would need to change to trigger a refetch. Since the query key is `['match', id]` (no user dependency), stale `isJoined`/`isUserHost` would persist. However, `AuthBootstrap` populates Zustand BEFORE any page renders, so by the time `useMatch` runs, Zustand is populated.

**Alternative (rejected):** Add `currentUserId` to query key `['match', id, currentUserId]`. This causes a double-fetch on cold load (first with null, then with UUID). The `getState()` approach avoids this because `AuthBootstrap` runs first.

---

## 4. New Components

### 4.1 `AuthBootstrap` Component Contract

```typescript
// components/auth/AuthBootstrap.tsx  (NEW)

/**
 * No-UI component that populates Zustand auth state on cold page loads.
 * 
 * Runs once on mount. If Zustand `user` is null and hydration is complete,
 * calls GET /users/me and populates the store via login().
 * 
 * Renders nothing.
 */
export default function AuthBootstrap(): null;

// Props: NONE
// Returns: null (always)
// Side effects: GET /users/me → Zustand.login()
```

**State machine:**
```
Mount
├─ isHydrated = false → DO NOTHING (waiting for persist middleware)
├─ user != null        → DO NOTHING (already populated)
└─ user == null AND isHydrated
   └─ useQuery(['auth','bootstrap'], GET /users/me)
      ├─ Pending  → DO NOTHING
      ├─ Success  → login(profile, '')
      ├─ Error    → DO NOTHING (user unauthenticated)
      └─ Renders  → null
```

### 4.2 `ChatSheet` Component Contract

```typescript
// components/matches/ChatSheet.tsx  (NEW)

interface ChatSheetProps {
  /** Whether the sheet is visible */
  isOpen: boolean;
  /** Called when user dismisses sheet (backdrop click, close button) */
  onClose: () => void;
  /** Match ID for fetching messages */
  matchId: string;
  /** Match title for sheet header */
  matchTitle: string;
}

export default function ChatSheet(props: ChatSheetProps): JSX.Element;
```

**Data flow:**
```
ChatSheet mounts (isOpen=true)
  └─ useMatchMessages(matchId)
     ├─ Loading → <Loader2 spinner centered>
     ├─ Error  → <AlertTriangle + "Couldn't load messages" + Retry>
     ├─ Empty  → <MessageSquare icon + "No messages yet" + description>
     └─ Populated → buildComments(messages) → scrollable message list
```

**Layout (follows Bottom Sheet Pattern from UI Standards):**
```
Fixed overlay bg-black/50 z-50 (tap → onClose)
└─ Fixed bottom sheet bg-white rounded-t-3xl z-50 max-h-[85vh]
   ├─ Pull handle (w-10 h-1 bg-gray-300 rounded-full)
   ├─ Header: "Match Chat" + X close button
   ├─ Message list (overflow-y-auto, flex-col-reverse for newest-bottom)
   │  └─ Per message: Avatar circle + Name + time + Text
   ├─ Empty state (when no messages)
   └─ Input row: [Type a message...] + Send button (disabled + tooltip)
```

**Message row component (inline):**
```tsx
<div className="flex items-start gap-3 px-5 py-3">
  <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0">
    <span className="text-[10px] font-bold text-gray-500">
      {comment.userName.charAt(0)}
    </span>
  </div>
  <div className="flex-1 min-w-0">
    <div className="flex items-center gap-2">
      <span className="text-sm font-semibold text-brand-black">
        {comment.userName}
      </span>
      <span className="text-[10px] text-gray-400">
        {formatTime(comment.createdAt)}
      </span>
    </div>
    <p className="text-sm text-gray-600 mt-0.5">{comment.text}</p>
  </div>
</div>
```

**4 UX states:**
| State | Visual |
|-------|--------|
| Loading | Centered `Loader2` spinner, `animate-spin` |
| Empty | `MessageSquare` icon (gray-300), "No messages yet", "Start the conversation!" |
| Populated | Scrollable list of message rows |
| Error | `AlertTriangle` icon (red/10 bg), "Couldn't load messages", Retry button |

**Pending send button (disabled for this cycle):**
```tsx
<div className="flex items-center gap-2 px-5 py-3 border-t border-gray-100">
  <input
    disabled
    placeholder={t('chatSheet.sendPlaceholder')}
    className="flex-1 bg-gray-50 rounded-full px-4 py-2.5 text-sm outline-none"
  />
  <button
    disabled
    className="w-9 h-9 rounded-full bg-gray-200 flex items-center justify-center"
    title={t('chatSheet.comingSoon')}
  >
    <Send className="w-4 h-4 text-gray-400" strokeWidth={1.5} />
  </button>
</div>
```

---

## 5. Page Changes

### 5.1 Root Layout — Add `AuthBootstrap`

**File:** `app/[locale]/layout.tsx`

```diff
  <body className="overscroll-none">
    <QueryProvider>
      <NextIntlClientProvider messages={messages}>
+       <AuthBootstrap />
        <div className="app-shell">{children}</div>
      </NextIntlClientProvider>
    </QueryProvider>
  </body>
```

**Import added:**
```typescript
import AuthBootstrap from '@/components/auth/AuthBootstrap';
```

### 5.2 Match Detail Page — 4 Changes

**File:** `app/[locale]/match/[id]/page.tsx`

**Change A — Remove manual computation, use match fields:**
```diff
- const isJoined =
-     currentUserId && match
-         ? match.roster.some((p) => p.userId === currentUserId)
-         : false;
- const isUserHost =
-     currentUserId && match ? match.hostId === currentUserId : false;
+ const isJoined = match?.isJoined ?? false;
+ const isUserHost = match?.isUserHost ?? false;
```

**Change B — Add ChatSheet state + import:**
```diff
+ import ChatSheet from '@/components/matches/ChatSheet';
+ const [showChatSheet, setShowChatSheet] = useState(false);
```

**Change C — Message icon opens ChatSheet:**
```diff
  <button className="..."
-     onClick={() => isJoined ? router.push(`/${locale}/messages`) : null}>
+     onClick={() => isJoined ? setShowChatSheet(true) : null}>
```

**Change D — Add ChatSheet rendering:**
```tsx
{/* Chat Sheet */}
{match && (
  <ChatSheet
    isOpen={showChatSheet}
    onClose={() => setShowChatSheet(false)}
    matchId={match.id}
    matchTitle={match.title}
  />
)}
```

**Change E — `?chat=open` auto-open (requires `useSearchParams`):**

The match detail page currently uses `use(params)` (Next.js 15 async params pattern). Adding `?chat=open` requires `useSearchParams()` in a client component. Since the page is already `'use client'`, we can add:

```typescript
import { useSearchParams } from 'next/navigation';

// Inside component:
const searchParams = useSearchParams();

useEffect(() => {
  if (searchParams.get('chat') === 'open' && isJoined) {
    setShowChatSheet(true);
  }
}, [searchParams, isJoined]);
```

**Note:** `useSearchParams()` in Next.js 14+ requires `Suspense` boundary. The match detail page is already wrapped in `<MobileFrame>` but `MobileFrame` is not a Suspense boundary. We need to either:
- Wrap the auto-open logic in a separate client component with Suspense, OR
- Use `window.location.search` directly (simpler, avoids Suspense)

**Decision:** Use `window.location.search` to avoid the Suspense requirement:
```typescript
useEffect(() => {
  const params = new URLSearchParams(window.location.search);
  if (params.get('chat') === 'open' && isJoined) {
    setShowChatSheet(true);
  }
}, [isJoined]);
```

### 5.3 Messages Page — Conditional Label

**File:** `app/[locale]/(main)/messages/page.tsx`

```diff
- <Link
-     href={`/${locale}/match/${match.id}`}
-     className="mt-3 inline-flex items-center gap-1.5 bg-brand-green/10 text-brand-green text-xs font-bold px-4 py-2 rounded-full active:scale-95 transition-transform"
- >
-     {t('messages.joinChat')}
- </Link>
+ {match.isJoined ? (
+   <Link
+       href={`/${locale}/match/${match.id}?chat=open`}
+       className="mt-3 inline-flex items-center gap-1.5 bg-brand-green/10 text-brand-green text-xs font-bold px-4 py-2 rounded-full active:scale-95 transition-transform"
+   >
+       {t('messages.openChat')}
+   </Link>
+ ) : (
+   <Link
+       href={`/${locale}/match/${match.id}`}
+       className="mt-3 inline-flex items-center gap-1.5 bg-brand-green text-white text-xs font-bold px-4 py-2 rounded-full active:scale-95 transition-transform"
+   >
+       {t('messages.joinChat')}
+   </Link>
+ )}
```

**Note:** Since `useMyMatches()` returns only joined matches, `match.isJoined` is always `true`. The `else` branch is defensive code. The `isJoined` field is populated by the API's `TRUE AS is_joined` → `adaptMatchList` → `match.isJoined = true`.

---

## 6. i18n Key Contracts

### 6.1 English (`en.json`)

```json
{
  "messages": {
    "openChat": "Open Chat",
    "joinChat": "Join Chat",
    "title": "Messages",
    "activeDiscussions": "Active Discussions",
    "noMessages": "No active discussions",
    "noMessagesDescription": "Join a match to start chatting with other players"
  },
  "chatSheet": {
    "title": "Match Chat",
    "emptyTitle": "No messages yet",
    "emptyDescription": "Start the conversation!",
    "sendPlaceholder": "Type a message...",
    "comingSoon": "Chat coming soon"
  }
}
```

### 6.2 Arabic (`ar.json`)

```json
{
  "messages": {
    "openChat": "افتح المحادثة",
    "joinChat": "انضم للمحادثة",
    "title": "الرسائل",
    "activeDiscussions": "المحادثات النشطة",
    "noMessages": "لا توجد محادثات نشطة",
    "noMessagesDescription": "انضم إلى مباراة لبدء المحادثة مع اللاعبين الآخرين"
  },
  "chatSheet": {
    "title": "محادثة المباراة",
    "emptyTitle": "لا توجد رسائل بعد",
    "emptyDescription": "ابدأ المحادثة!",
    "sendPlaceholder": "اكتب رسالة...",
    "comingSoon": "المحادثة قريباً"
  }
}
```

### 6.3 Keys Summary

| Key | New/Existing | English | Arabic |
|-----|-------------|---------|--------|
| `messages.openChat` | **NEW** | Open Chat | افتح المحادثة |
| `messages.joinChat` | Existing | Join Chat | انضم للمحادثة |
| `chatSheet.title` | **NEW** | Match Chat | محادثة المباراة |
| `chatSheet.emptyTitle` | **NEW** | No messages yet | لا توجد رسائل بعد |
| `chatSheet.emptyDescription` | **NEW** | Start the conversation! | ابدأ المحادثة! |
| `chatSheet.sendPlaceholder` | **NEW** | Type a message... | اكتب رسالة... |
| `chatSheet.comingSoon` | **NEW** | Chat coming soon | المحادثة قريباً |

---

## 7. Test Plan

### 7.1 Updated Tests

| Test ID | File | Change |
|---------|------|--------|
| EX-1 | `test/components/MatchCard.test.tsx` | Ensure `baseMatch` includes `isJoined: true`/`false` and `isUserHost: true`/`false`. Tests MC-1 through MC-6 already assert on these fields — verify they still pass. |
| EX-2 | `test/hooks/useMatches.test.tsx` | Update mock feed response to include `is_joined: boolean`. The `adaptNearbyMatch` → `Match` mapping must preserve this field. |

### 7.2 New Tests

| Test ID | File | Description | Assertion |
|---------|------|-------------|-----------|
| **CS-1** | `test/components/ChatSheet.test.tsx` | Renders loading spinner when `isOpen=true` and messages are loading | `Loader2` visible, `queryByText('No messages yet')` is null |
| **CS-2** | `test/components/ChatSheet.test.tsx` | Renders empty state when API returns `[]` | `getByText('No messages yet')` visible |
| **CS-3** | `test/components/ChatSheet.test.tsx` | Renders message list when API returns messages | Message text visible, user name visible |
| **CS-4** | `test/components/ChatSheet.test.tsx` | Does not render when `isOpen=false` | `queryByText('Match Chat')` is null |
| **CS-5** | `test/components/ChatSheet.test.tsx` | Calls `onClose` when backdrop clicked | `onClose` mock called once |
| **CS-6** | `test/components/ChatSheet.test.tsx` | Shows error state with retry button on API failure | `AlertTriangle` visible, retry button calls `refetch` |

---

## 8. Complete File Change List

| # | File | Change Type | Lines Changed |
|---|------|-------------|---------------|
| 1 | `apps/api/src/modules/matches/matches.service.ts` | Edit | 1 line (EXISTS → BOOL_OR) |
| 2 | **NEW** `apps/player-pwa/src/components/auth/AuthBootstrap.tsx` | New | ~40 lines |
| 3 | **NEW** `apps/player-pwa/src/components/matches/ChatSheet.tsx` | New | ~120 lines |
| 4 | `apps/player-pwa/src/app/[locale]/layout.tsx` | Edit | +2 lines (import + component) |
| 5 | `apps/player-pwa/src/app/[locale]/match/[id]/page.tsx` | Edit | ~30 lines |
| 6 | `apps/player-pwa/src/app/[locale]/(main)/messages/page.tsx` | Edit | ~15 lines |
| 7 | `apps/player-pwa/src/lib/api-adapter.ts` | Edit | ~10 lines |
| 8 | `apps/player-pwa/src/hooks/useMatches.ts` | Edit | 2 lines (+ `useMatchMessages`, update `useMatch`) |
| 9 | `apps/player-pwa/src/messages/en.json` | Edit | +7 keys |
| 10 | `apps/player-pwa/src/messages/ar.json` | Edit | +7 keys |
| 11 | **NEW** `apps/player-pwa/test/components/ChatSheet.test.tsx` | New | ~80 lines (6 tests) |

**Total: 3 new files, 8 edited files. ~300 lines changed. 6 new tests.**

---

## 9. Edge Cases Resolved

| # | Edge Case | Resolution |
|---|-----------|------------|
| 1 | `BOOL_OR` returns NULL for match with zero players (brand new) | `COALESCE(..., FALSE)` — returns `false` ✅ |
| 2 | `currentUserId` is `undefined` (unauthenticated) in `BOOL_OR` | `mp.user_id = NULL::uuid` → NULL → `COALESCE` → `false` ✅ |
| 3 | `AuthBootstrap` fires before Zustand hydration | Guard: `enabled: isHydrated && !user` — waits for persist ✅ |
| 4 | `AuthBootstrap` fires when user is unauthenticated (no cookie) | `retry: false` on 401 — never retries, Zustand stays null ✅ |
| 5 | `adaptMatchDetail` called without `currentUserId` (backward compat) | `currentUserId?` optional → `isJoined: false, isUserHost: false` — safe ✅ |
| 6 | `ChatSheet` re-fetches messages when reopened | `staleTime: 15_000` — refetches if stale, shows cached otherwise ✅ |
| 7 | `useSearchParams` requires Suspense | Used `window.location.search` instead — no Suspense needed ✅ |
| 8 | Messages page shows "Join Chat" for non-joined matches | Defensive `else` branch — unreachable but safe ✅ |

---

**⏸️ STOP — All contracts defined. 3 new files, 8 edits, 7 i18n keys, 6 new tests, 8 edge cases. Gate 3 ready for review.**
