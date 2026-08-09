# Gate 0 — Retrospective: Feed Visibility & Chat Access Remediation

**Feature slug:** `feed-chat-access-fix`  
**Date:** 2026-08-09  
**Baseline:** `8acc848` — "fix: match-state-propagation — state-aware cards, sheets, EXISTS subquery"

---

## Executive Summary

Cycle 7 (`match-state-propagation-fix`) successfully fixed MatchCard button states, My Games cards, and Leave/Cancel bottom sheets. However, it introduced or left unresolved two critical issues:

1. **The Play main screen feed is completely empty** — no match data rendered.
2. **The Messages/Chat flow still blocks access** — the "Join Chat" label is unconditional and the match detail page's `isJoined` computation fails when Zustand state is cold.

---

## Finding 1: Empty Play Feed — Data Flow Audit

### Chain Trace

```
PlayPage (play/page.tsx:26)
  → useMatches({ date })  [useMatches.ts:40]
    → fetcher('/matches')  [fetcher.ts:34]
      → GET /api/v1/matches  (with JWT cookie or Bearer token)
        → MatchesController.findNearby()  [matches.controller.ts:45]
          → @CurrentUser() user: { sub: string }  [current-user.decorator.ts:10]
            → request.user (set by JwtCookieAuthGuard)
          → matchesService.findNearby(dto, user.sub)  [matches.service.ts:61]
            → db.execute(sql`... EXISTS(...) ...`)  [matches.service.ts:98]
```

### Sub-finding 1a: `adaptMatchList` called without `currentUserId` — NOT the root cause

**File:** `useMatches.ts:76`
```typescript
return { matches: adaptMatchList(rows), total, hasMore };
```

`adaptMatchList(rows)` is called with only one argument — `currentUserId` is `undefined`. However:

- `adaptMatchList`'s second parameter is optional (`currentUserId?: string`). When undefined:
  - `adaptNearbyMatch(row, undefined)` → `isJoined` = `row.is_joined` (from server-side EXISTS subquery) ✅
  - `isUserHost` = `false` (fallback: `currentUserId ? host_id === currentUserId : false`) ✅ safe default
- `MatchCard` has a secondary fallback (line 25-26):
  ```typescript
  const isHost = match.isUserHost ?? (currentUserId ? match.hostId === currentUserId : false);
  ```
  And PlayPage DOES pass `currentUserId` to `MatchCard` (play/page.tsx:163).

**Verdict:** The adapter change is NOT causing the empty feed. Data would flow correctly even without `currentUserId` in the adapter call.

### Sub-finding 1b: `EXISTS` subquery — the most likely root cause

**File:** `matches.service.ts:118-121`

```sql
EXISTS(
  SELECT 1 FROM match_players mu
  WHERE mu.match_id = m.id AND mu.user_id = ${currentUserId ?? null}::uuid
) AS is_joined
```

Drizzle's `sql` template parameterizes `${currentUserId ?? null}`. The `::uuid` type cast is attached directly to the parameter in raw SQL. This produces one of:

**When authenticated (currentUserId = valid UUID string):**
```sql
EXISTS(
  SELECT 1 FROM match_players mu
  WHERE mu.match_id = m.id AND mu.user_id = $1::uuid
) AS is_joined
```
→ Valid PostgreSQL: `$1::uuid` casts the bound parameter to uuid type.

**When unauthenticated (currentUserId = undefined → null):**
```sql
EXISTS(
  SELECT 1 FROM match_players mu
  WHERE mu.match_id = m.id AND mu.user_id = NULL::uuid
) AS is_joined
```
→ Valid PostgreSQL: `NULL = NULL` is NULL (not TRUE), EXISTS returns false.

**Risk area:** Drizzle's `sql` template used inside `db.execute()` may handle nested subqueries and type casts differently than expected. Specifically:
- The `::uuid` cast suffix may interfere with Drizzle's parameter mapping
- The `EXISTS` keyword inside the SELECT clause of a raw `db.execute()` call may not be properly recognized by Drizzle's query builder
- The `GROUP BY m.id, u.id, p.id, v.id` clause must cover the `EXISTS(...)` expression. PostgreSQL requires all non-aggregate SELECT-list expressions to be in GROUP BY or functionally dependent. `EXISTS` referencing `m.id` (which IS in GROUP BY) should satisfy this, but strict SQL mode may reject it.

**Test plan to isolate:** 
1. Log the actual SQL Drizzle generates (enable query logging)
2. Run the SQL directly against PostgreSQL via `psql` 
3. Check if the API returns 200 with data, 200 with empty array, or 500 error

### Sub-finding 1c: `@CurrentUser()` decorator chain — unlikely to fail

**File:** `current-user.decorator.ts:10-14`
```typescript
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<Request>();
    return request.user;
  },
);
```

The `JwtCookieAuthGuard` (which guards the entire `MatchesController`) either:
- Returns 401 (invalid/missing token) → never reaches the controller
- Sets `request.user` = `{ sub: string, phone: string }` → `user.sub` is always a valid UUID string

**Verdict:** If the guard passes, `user.sub` is always a non-null UUID. If it doesn't, the client gets a 401, not an empty array. This is NOT causing the empty feed.

### Sub-finding 1d: Frontend response handling — no silent drops

**File:** `useMatches.ts:59-76`
```typescript
const raw = await fetcher<MatchesApiResponse | NearbyMatchApi[]>('/matches', { params });

let rows: NearbyMatchApi[];
if (Array.isArray(raw)) {
  rows = raw;
} else if (raw.matches) {
  rows = raw.matches;
} else if (raw.data) {
  rows = raw.data;
} else {
  rows = [];  // ← only falls through if raw is empty object
}

return { matches: adaptMatchList(rows), total, hasMore };
```

The API controller returns `NearbyMatchRow[]` directly (no wrapper object). So:
- `Array.isArray(raw)` → `true`
- `rows = raw` → the full array

If the API returns `[]`, `rows` is `[]` and `adaptMatchList([])` returns `[]`. The Play page shows the empty state.

If the API throws (500), `fetcher` throws `FetchError`, React Query sets `error`, and the Play page shows the error state.

**The user reports "empty" not "error."** This suggests the API returns 200 with `[]` rather than a 500 error.

### Sub-finding 1e: Could the DB genuinely have no Open matches?

The API filter is:
```sql
WHERE m.status = 'Open' AND m.scheduled_at >= NOW()
```

After the seed data, there should be Open matches. But if the `EXISTS` subquery causes the ENTIRE query to fail silently, `db.execute()` might return an empty result set instead of throwing.

**Alternative theory:** Drizzle's `db.execute(sql`...`)` may parse the SQL differently when it encounters `EXISTS(...)` in the SELECT list and silently drop the column or return empty results. This is a known edge case with Drizzle's raw SQL execution — complex subqueries in SELECT lists can produce unexpected results.

### Finding 1 Preliminary Conclusion

**Most likely root cause:** The `EXISTS` subquery inside `db.execute(sql`...`)` either:
- (A) Causes a silent PostgreSQL error that returns zero rows, OR
- (B) Is improperly handled by Drizzle's SQL template, producing an invalid query that PostgreSQL rejects with an error that NestJS catches and returns as 500, but the frontend renders as "empty" due to error state timing

**Recommended verification:** Enable SQL logging in the NestJS app, hit the `/matches` endpoint, and inspect the actual query + response.

---

## Finding 2: Messages "Join Chat" — Always Shows Join Label

### Sub-finding 2a: Messages page — unconditional "Join Chat" label

**File:** `messages/page.tsx:128-133`

```tsx
<Link
    href={`/${locale}/match/${match.id}`}
    className="mt-3 inline-flex items-center gap-1.5 bg-brand-green/10 text-brand-green text-xs font-bold px-4 py-2 rounded-full active:scale-95 transition-transform"
>
    {t('messages.joinChat')}
</Link>
```

There is **NO conditional logic** whatsoever. Every match in the list (all of which are matches the user HAS joined, since they come from `useMyMatches()`) shows the label "Join Chat." The label is misleading — the user is already joined. It should show "Open Chat" when joined.

**This page was NOT modified in Cycle 7** — the `git diff` shows zero changes to `messages/page.tsx`. This is a pre-existing UX bug, not a regression.

### Sub-finding 2b: Match detail page — `isJoined` depends on Zustand `user` being populated

**File:** `match/[id]/page.tsx:56-59`

```typescript
const isJoined =
    currentUserId && match
        ? match.roster.some((p) => p.userId === currentUserId)
        : false;
```

Where:
- `currentUserId` = `useAppStore(selectUser).id` (line 51-52)
- `match.roster` = populated by `adaptMatchDetail()` from `GET /matches/:id` players relation

**When `currentUserId` is undefined (user not in Zustand):**
- `isJoined` = `false`
- `isUserHost` = `false`
- The messages icon shows Share2 instead of MessageSquare
- Clicking the icon does nothing (no-op `onClick`)
- The joined-state view (lines 221-297) is hidden; pre-join view with "Join Match" button is shown
- User CANNOT access chat functionality

**When `currentUserId` IS available (user in Zustand):**
- `isJoined` = correctly computed from roster ✅
- `isUserHost` = correctly computed from hostId comparison ✅
- Messages icon shows MessageSquare ✅
- Clicking navigates to `/messages` (wrong destination — should be match-specific chat, but this is Finding 4 from the previous cycle)

### Sub-finding 2c: Zustand user population paths

The Zustand `user` is populated in two places:

1. **Verify page** (`verify/page.tsx:74-91`) — after OTP verification for returning users:
   ```typescript
   const profile = await fetcher<UserProfileApi>('/users/me');
   useAppStore.getState().login({ ... }, '');
   ```
   ✅ Works for OTP login flow.

2. **DevLoginBar** (`DevLoginBar.tsx:55-68`) — after dev-login:
   ```typescript
   const profile = await fetcher<UserProfileApi>('/users/me');
   useAppStore.getState().login({ ... }, res.token ?? '');
   ```
   ✅ Works for dev-login flow.

**Missing path:** There is no `login()` call for the "returning user with valid cookie but no Zustand state" scenario. When a user:
- Has a valid `access_token` cookie from a previous session
- Navigates directly to `/match/:id` via URL or shared link
- Zustand store starts with `user: null`
- The cookie IS valid (API calls succeed), but Zustand never learns who the user is

The `persist` middleware stores `user` in localStorage, which helps on page refresh in the same browser. But this fails on:
- First visit after cookie was set
- Cross-device scenarios
- localStorage cleared

### Sub-finding 2d: The "Join Chat" label on the detail page

The user says the match detail page shows a "Join Chat" button. After thorough code inspection, the match detail page does NOT have a literal "Join Chat" button. The hero section has a messages icon that shows either:
- `MessageSquare` (when `isJoined` = true) — clicking navigates to `/messages`
- `Share2` (when `isJoined` = false) — clicking does nothing

The "Join Chat" label exists ONLY on the messages page. The user's description likely refers to the flow:
1. User is joined to a match
2. On the match detail page, `isJoined` computes to `false` (Zustand user null)
3. The hero shows a Share icon instead of the message icon
4. OR, `isJoined` is true but clicking navigates to `/messages`
5. On the messages page, every match shows "Join Chat" (even joined ones)
6. This creates the perception that the system doesn't recognize the user as joined

---

## Finding 3: `useMatches` — Missing `currentUserId` in Adapter Call (IMPORTANT but not root cause)

**File:** `useMatches.ts:76`

```typescript
// CURRENT:
return { matches: adaptMatchList(rows), total, hasMore };

// SHOULD BE:
const storeUser = useAppStore.getState().user;
return { matches: adaptMatchList(rows, storeUser?.id), total, hasMore };
```

While `adaptMatchList`'s `currentUserId` parameter is optional and the `isJoined` field comes from the server-side `EXISTS` query (not affected by this parameter), passing `currentUserId` would:

1. Correctly set `isUserHost` on `Match` objects (currently always `false` from adapter)
2. Make the MatchCard's `isHost` fallback unnecessary
3. Improve consistency across the codebase

**However:** The `useMatches` hook cannot access Zustand directly because it's not a React component (it's a vanilla function called from a component). The `PlayPage` passes `currentUserId` to `MatchCard` via props, which provides the `isUserHost` fallback. So this gap is partially mitigated.

**Verdict:** Minor inconsistency but NOT causing the empty feed or chat issues.

---

## Finding 4: `getMyMatches` SQL — No Issues Found

**File:** `users.service.ts:80-112`

Cycle 7 added `TRUE AS is_joined` to the `getMyMatches` SQL (line 94). This is correct — all matches returned by this query are matches the user has joined, so `is_joined` should always be `true`.

The `adaptMatchList` on the messages page (messages/page.tsx:24) also calls `adaptMatchList(matchesApi)` without `currentUserId`, meaning `isUserHost` defaults to `false`. But `isJoined` correctly reads `true` from the API response.

**Verdict:** Backend data is correct. Frontend consumption is the issue (see Finding 2a).

---

## Summary

| # | Severity | Issue | Root Cause | Regression? |
|---|----------|-------|------------|-------------|
| 1 | 🔴 CRITICAL | Play feed completely empty | `EXISTS` subquery in `db.execute(sql`...`)` likely causing silent SQL failure or 500 error | YES — Cycle 7 introduced the EXISTS subquery |
| 2a | 🔴 CRITICAL | Messages page shows "Join Chat" for all matches including joined ones | No conditional logic — `t('messages.joinChat')` is hardcoded | NO — pre-existing, not touched by Cycle 7 |
| 2b | 🔴 CRITICAL | Match detail page `isJoined` fails when Zustand `user` is null (cold load) | No `login()` call for "valid cookie + cold Zustand" scenario | NO — pre-existing, but Cycle 7 made it more visible by relying on `isJoined` everywhere |
| 3 | 🟡 IMPORTANT | `useMatches` hook calls `adaptMatchList` without `currentUserId` | Hook doesn't pass user context to adapter | YES — introduced when `adaptMatchList` gained the parameter |

---

## Required Fixes (Minimum Viable)

1. **Debug and fix the `EXISTS` subquery** — enable SQL logging, inspect the actual query, fix whatever is causing zero rows or 500 errors
2. **Add conditional "Join Chat" / "Open Chat" label to messages page** — check `match.isJoined` before choosing label
3. **Populate Zustand `user` on cold page load** — add a `useUserProfile()` → `login()` call in the root layout or a provider, so any authenticated page visit populates the store
4. **Pass `currentUserId` to `adaptMatchList` in `useMatches` hook** — read from Zustand's `getState()` for consistency
5. **Navigate to match-specific chat from match detail page** — instead of `/${locale}/messages`, navigate to a match chat view or open inline

---

**⏸️ STOP — 2 CRITICAL regressions, 1 CRITICAL pre-existing, 1 IMPORTANT inconsistency found. Gate 0 ready for review.**
