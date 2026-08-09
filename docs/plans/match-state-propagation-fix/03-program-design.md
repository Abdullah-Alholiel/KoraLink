# Gate 3 — Program Design: Match State Propagation Fix

**Feature:** `match-state-propagation-fix`  
**Date:** 2026-08-09  
**Input:** Gate 2 Architecture ([02-architecture.md](./02-architecture.md))

---

## 1. TypeScript Signatures

### 1.1 `Match` type extension

```typescript
// types/index.ts — ADD to Match interface:
export interface Match {
    // ... existing fields ...
    hostId: string;
    roster: RosterPlayer[];
    // ── NEW fields ──
    /** True if the current user has a match_players row for this match.
     *  Populated by adaptNearbyMatch from the API's is_joined field.
     *  On the detail page (adaptMatchDetail), derived from roster. */
    isJoined?: boolean;
    /** True if the current user is the host of this match.
     *  Populated by adaptNearbyMatch by comparing hostId to currentUserId. */
    isUserHost?: boolean;
}
```

### 1.2 `NearbyMatchApi` type extension

```typescript
// api-adapter.ts — ADD to NearbyMatchApi:
export interface NearbyMatchApi {
    // ... existing fields ...
    venue_city: string;
    // ── NEW field ──
    is_joined: boolean;
}
```

### 1.3 `adaptNearbyMatch` — new signature

```typescript
// api-adapter.ts
export function adaptNearbyMatch(
    row: NearbyMatchApi,
    currentUserId?: string
): Match;
```

### 1.4 `adaptMatchList` — new signature

```typescript
// api-adapter.ts
export function adaptMatchList(
    rows: NearbyMatchApi[],
    currentUserId?: string
): Match[];
```

### 1.5 `findNearby` — new signature

```typescript
// matches.service.ts
async findNearby(
    dto: GetMatchesDto,
    currentUserId?: string
): Promise<NearbyMatchRow[]>;

// NearbyMatchRow — ADD:
is_joined: boolean;
```

### 1.6 `findNearby` controller — new signature

```typescript
// matches.controller.ts
@Get()
findNearby(
    @CurrentUser() user: { sub: string },
    @Query() dto: GetMatchesDto
);
```

---

## 2. Component APIs

### 2.1 `MatchCardProps`

```typescript
// components/matches/MatchCard.tsx
interface MatchCardProps {
    /** The match data (from feed or my-games) */
    match: Match;
    /** The authenticated user's ID from Zustand.
     *  Optional — if not provided, card shows default "Join" state. */
    currentUserId?: string;
}
```

### 2.2 `CancelMatchSheetProps`

```typescript
// components/matches/CancelMatchSheet.tsx  (NEW)
interface CancelMatchSheetProps {
    isOpen: boolean;
    onClose: () => void;
    /** Called when user taps "Cancel Match" — parent calls useCancelMatch.mutate() */
    onConfirm: () => void;
    /** Match title for display */
    matchTitle: string;
    /** Formatted date+time string for display */
    matchTime: string;
    /** Whether the cancel API call is in progress */
    isPending?: boolean;
}
```

### 2.3 `LeaveMatchSheetProps`

```typescript
// components/matches/LeaveMatchSheet.tsx  (NEW)
interface LeaveMatchSheetProps {
    isOpen: boolean;
    onClose: () => void;
    /** Called when user taps "Leave Match" — parent calls useLeaveMatch.mutate() */
    onConfirm: () => void;
    /** Match title for display */
    matchTitle: string;
    /** Formatted date+time string for display */
    matchTime: string;
    /** Whether the leave API call is in progress */
    isPending?: boolean;
}
```

### 2.4 `MatchCard` button state contract

```
┌──────────────┬──────────────────┬─────────────────────────────────┐
│ Condition    │ Button Label     │ Style                           │
├──────────────┼──────────────────┼─────────────────────────────────┤
│ completed /  │ matchDetail.     │ bg-gray-100 text-gray-600       │
│ cancelled    │ viewDetails      │ rounded-full                    │
├──────────────┼──────────────────┼─────────────────────────────────┤
│ isUserHost   │ matchDetail.     │ bg-amber-100 text-amber-800     │
│              │ yourMatch        │ border border-amber-300         │
├──────────────┼──────────────────┼─────────────────────────────────┤
│ isJoined     │ matchDetail.view │ bg-brand-green/10 text-brand-   │
│              │                  │ green border border-brand-green  │
├──────────────┼──────────────────┼─────────────────────────────────┤
│ default      │ matchDetail.     │ bg-brand-green text-white        │
│ (not joined) │ joinMatch        │ rounded-full                    │
└──────────────┴──────────────────┴─────────────────────────────────┘
```

### 2.5 `useCancelMatch` hook

```typescript
// hooks/useMatchActions.ts  (NEW export)
export function useCancelMatch(): UseMutationResult<
    unknown,        // response (full match from API)
    FetchError,
    string          // matchId
>;
// onSuccess: invalidates ['matches'], ['match', matchId], ['user', 'my-matches']
```

---

## 3. Test Plan

### 3.1 New test file: `test/components/MatchCard.test.tsx` — extended

| Test ID | Description | Assertion |
|---------|-------------|-----------|
| MC-1 | Renders "Join Match" when `isJoined=false, isUserHost=false, status=open` | Button text = "Join Match", green background |
| MC-2 | Renders "Joined" badge when `isJoined=true` | Badge visible, button text ≠ "Join Match" |
| MC-3 | Renders "Your Match" when `isUserHost=true` | Button text = "Your Match", amber background |
| MC-4 | Renders "View Details" when `status=completed` | Button text = "View Details", gray background |
| MC-5 | Renders default "Join Match" when `currentUserId` is undefined | Falls back to default state |
| MC-6 | Entire card navigates to `/match/:id` on click | `<Link>` wrapper with correct href |

### 3.2 New test file: `test/components/CancelMatchSheet.test.tsx`

| Test ID | Description | Assertion |
|---------|-------------|-----------|
| CS-1 | Does not render when `isOpen=false` | `queryByText('Cancel Match?')` is null |
| CS-2 | Renders title and match info when open | `getByText('Cancel Match?')` + match title/time visible |
| CS-3 | Calls `onConfirm` when "Cancel Match" button clicked | `onConfirm` mock called once |
| CS-4 | Calls `onClose` when "Keep Match" button clicked | `onClose` mock called once |
| CS-5 | Calls `onClose` when backdrop clicked | `onClose` mock called once |
| CS-6 | Shows spinner when `isPending=true` | Loading indicator visible, button disabled |

### 3.3 New test file: `test/components/LeaveMatchSheet.test.tsx`

| Test ID | Description | Assertion |
|---------|-------------|-----------|
| LS-1 | Does not render when `isOpen=false` | `queryByText('Leave Match?')` is null |
| LS-2 | Renders title and match info when open | `getByText('Leave Match?')` + match title/time visible |
| LS-3 | Calls `onConfirm` when "Leave Match" button clicked | `onConfirm` mock called once |
| LS-4 | Calls `onClose` when "Stay" button clicked | `onClose` mock called once |
| LS-5 | Shows spinner when `isPending=true` | Loading indicator visible, button disabled |

### 3.4 New test file: `test/hooks/useMatchActions.test.tsx`

| Test ID | Description | Assertion |
|---------|-------------|-----------|
| MA-1 | `useCancelMatch` calls `POST /matches/:id/cancel` | `fetcher` called with correct URL + method |
| MA-2 | `useCancelMatch` invalidates `['user', 'my-matches']` on success | `invalidateQueries` called with that key |
| MA-3 | `useJoinMatch` invalidates `['user', 'my-matches']` on success | (Verify existing behavior) |
| MA-4 | `useLeaveMatch` invalidates `['user', 'my-matches']` on success | (Verify existing behavior) |

### 3.5 Existing test updates

| Test ID | File | Change |
|---------|------|--------|
| EX-1 | `test/components/MatchCard.test.tsx` | Update `baseMatch` to include `isJoined`, `isUserHost` fields |
| EX-2 | `test/hooks/useMatches.test.tsx` | Add `is_joined: false` to mock feed response |
| EX-3 | `test/hooks/useWallet.test.tsx` | (No change — already fixed in Cycle 6) |

---

## 4. Least Confident Decisions / Edge Cases

### 4.1 `is_joined` for unauthenticated users

**Edge case:** `findNearby` is called without a user (public API or expired token). The `currentUserId` will be `undefined`. The `EXISTS` subquery will always return `false` (no user to match against).

**Decision:** Accept this behavior. The feed is only accessible to authenticated users (JWT guard on controller). Unauthenticated requests get a 401 before reaching the service.

### 4.2 `is_joined` staleness between feed and detail

**Edge case:** User joins a match → `useJoinMatch.onSuccess` invalidates `['matches']` → feed refetches with updated `is_joined`. But if the user is viewing the feed WHILE joining on the detail page, there's a brief window where the feed shows stale data.

**Decision:** Accept this. React Query's `invalidateQueries` triggers a refetch within milliseconds. The window is imperceptible. If needed, we can add optimistic updates later.

### 4.3 `adaptMatchList` breaking existing callers

**Edge case:** `adaptMatchList` gains a new `currentUserId` parameter. Existing callers (messages page, my-games page) must be updated.

**Decision:** Make `currentUserId` optional with default `undefined`. Callers that don't pass it get cards without state awareness (default "Join" state) — same as current behavior. This is backward-compatible.

### 4.4 My Games page: `is_joined` always true

**Edge case:** `getMyMatches` returns matches the user HAS joined. Adding `is_joined: true` (hardcoded) is redundant but consistent. Should we bother?

**Decision:** Yes, add `TRUE AS is_joined` to the `getMyMatches` SQL. Consistency across all match data sources means `MatchCard` logic works identically on both Play and My Games pages.

### 4.5 `isUserHost` on detail page

**Edge case:** The match detail page already computes `isUserHost` by comparing `match.hostId === storeUser.id`. The `adaptMatchDetail` doesn't set `isUserHost` on the `Match` object.

**Decision:** Add `isUserHost` to `adaptMatchDetail` for consistency. The detail page can use either `match.isUserHost` or its own computed value. Both should be identical.

### 4.6 Sheet components: CSS animation class

**Edge case:** `animate-slide-up` is used elsewhere (PaymentSheet, HostMatchForm venue picker). Ensure the new sheets use the same animation.

**Decision:** Confirm the class exists in `globals.css` or Tailwind config. If not, add it.

---

## 5. Complete File Change List with Contracts

| File | Change | Contract |
|------|--------|----------|
| `matches.service.ts` | `findNearby` + `currentUserId` param; SQL + `EXISTS`; `NearbyMatchRow.is_joined` | `NearbyMatchRow { is_joined: boolean }` |
| `matches.service.ts` | `getMyMatches` SQL + `TRUE AS is_joined` | Same contract as `findNearby` |
| `matches.controller.ts` | `findNearby` + `@CurrentUser()` param | Passes `user.sub` to service |
| `api-adapter.ts` | `NearbyMatchApi.is_joined: boolean` | Type extension |
| `api-adapter.ts` | `adaptNearbyMatch(row, currentUserId?)` → `Match` | Maps `is_joined` → `Match.isJoined`, computes `isUserHost` |
| `api-adapter.ts` | `adaptMatchList(rows, currentUserId?)` → `Match[]` | Passes `currentUserId` to each `adaptNearbyMatch` |
| `api-adapter.ts` | `adaptMatchDetail` + `isUserHost` | Sets `isUserHost` from `detail.host_id === currentUserId` (requires new param?) — actually, keep detail page computation; don't change adapter |
| `types/index.ts` | `Match` + `isJoined?`, `isUserHost?` | Type extension |
| `MatchCard.tsx` | + `currentUserId` prop; state-aware button | See §2.4 button state contract |
| `CancelMatchSheet.tsx` | NEW component | See §2.2 props contract |
| `LeaveMatchSheet.tsx` | NEW component | See §2.3 props contract |
| `useMatchActions.ts` | NEW `useCancelMatch` | See §2.5 hook contract |
| `play/page.tsx` | Pass `currentUserId` to `MatchCard` + `adaptMatchList` | Read from `useAppStore(selectUser).id` |
| `my-games/page.tsx` | Pass `currentUserId` to `MatchCard` + `adaptMatchList` | Read from `useAppStore(selectUser).id` |
| `messages/page.tsx` | Pass `currentUserId` to `adaptMatchList` | Read from `useAppStore(selectUser).id` |
| `match/[id]/page.tsx` | Replace `confirm()` with sheet state; wire `useCancelMatch` | Sheet open/close state + `onConfirm` handlers |
| `en.json` | + 12 new keys | See Gate 2 §5 |
| `ar.json` | + 12 new keys | See Gate 2 §5 |

---

## 6. Test Impact Summary

| Category | Before | After |
|----------|--------|-------|
| Test files | 9 | 12 (+3 new) |
| Test count | 85 | ~105 (+ ~20) |
| New component tests | 0 | CancelMatchSheet (6), LeaveMatchSheet (5) |
| New hook tests | 0 | useMatchActions (4) |
| Extended tests | — | MatchCard (6 new assertions) |
| Mock updates | — | useMatches (add `is_joined`), MatchCard (add `isJoined`/`isUserHost`) |

---

**⏸️ STOP — All contracts defined. 16 file changes, 20 new test cases, 12 i18n keys. Gate 3 ready for review.**
