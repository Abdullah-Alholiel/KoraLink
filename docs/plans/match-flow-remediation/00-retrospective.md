# Gate 0 — Retrospective: Match Flow & State Remediation

**Feature:** `match-flow-remediation`  
**Date:** 2026-08-09  
**Baseline:** `9ce4487` — "fix: match state accuracy — isJoined survives refresh"

---

## Investigation Results

### Issue 1: Match Detail does not update after join

**Root cause found: ✅ — already fixed in Cycle 5, but with a residual issue.**

Previously, the match detail page used a `hasJoined` local state variable that reset to `false` on page refresh. Cycle 5 replaced this with `isJoined`, derived from `match.roster.some(p => p.userId === currentUserId)`. 

**Residual issue:** After `handlePaySuccess` calls `joinMatch.mutate(id)`, the mutation's `onSuccess` invalidates `['match', matchId]`, which triggers `useMatch(id)` refetch. But there is a **race condition**: `handlePaySuccess` is called from `PaymentSheet.onSuccess` (after wallet pay completes), but `joinMatch.mutate(id)` is fire-and-forget — no loading state, no error handling. The payment sheet closes immediately, then the join starts asynchronously. If the join API call fails silently, the user sees the sheet close but nothing changes.

**Additionally:** `useJoinMatch.onSuccess` invalidates `['match', matchId]` and `['matches']`, but does NOT invalidate `['wallet', 'history']`. After joining, the wallet transaction (debit) is created, but the wallet history cache is stale until the user navigates to the wallet page.

**File:** `apps/player-pwa/src/hooks/useMatchActions.ts:12-16`

---

### Issue 2: My Games shows wrong data

**Root cause found: 🟡 PARTIAL — endpoint correct, but stale cache after join.**

The `useMyMatches()` hook calls `GET /users/me/matches` which returns only matches where the user has a `match_players` row (filtered by `WHERE my.user_id = ${userId}`). The backend SQL is correct.

**But:** `useJoinMatch.onSuccess` invalidates `['matches']` and `['match', matchId]` but NOT `['user', 'my-matches']`. After joining a match, the My Games page cache is stale until the user manually refreshes or navigates away and back.

**File:** `apps/player-pwa/src/hooks/useMatchActions.ts:12-16`

---

### Issue 3: Transactions not showing

**Root cause found: 🔴 CRITICAL — API response shape mismatch.**

The backend `getHistory()` returns:
```typescript
{ transactions: TransactionApi[], total: number, hasMore: boolean }
```

But the frontend hook casts the response as `TransactionApi[]` (a bare array):
```typescript
// useWallet.ts:32-33
const raw = await fetcher<TransactionApi[]>('/wallet/history');
return { transactions: adaptTransactionList(raw) };
```

`adaptTransactionList` calls `raw.map(adaptTransaction)`. Since `raw` is actually `{ transactions: [...], total, hasMore }`, calling `.map()` on an object throws: **`TypeError: raw.map is not a function`**. Transactions silently fail to render.

**Fix:** The hook must unwrap the `transactions` property:
```typescript
const raw = await fetcher<{ transactions: TransactionApi[]; total: number; hasMore: boolean }>('/wallet/history');
return { transactions: adaptTransactionList(raw.transactions) };
```

**Files:**  
- `apps/player-pwa/src/hooks/useWallet.ts:27-36` (hook)  
- `apps/api/src/modules/wallet/wallet.service.ts:105-125` (returns wrapped object)

---

### Issue 4: MatchCard components not clickable

**Root cause found: 🔴 CRITICAL — only the Join button is wrapped in `<Link>`, not the entire card.**

In `MatchCard.tsx`, the outer element is a plain `<div>`. Only the "Join Match" button at the bottom has a `<Link>` wrapper:
```tsx
<div className="bg-white rounded-2xl ...">  {/* ← NOT clickable */}
  {/* avatar, title, location, spots */}
  <Link href={`/${locale}/match/${match.id}`}>  {/* ← only this is */}
    Join Match
  </Link>
</div>
```

Tapping anywhere on the card (title, avatar, price, spots) does nothing. This is a UX violation — users expect the entire card to be tappable.

**Fix:** Wrap the entire card in `<Link>`:
```tsx
<Link href={`/${locale}/match/${match.id}`} className="block">
  <div className="bg-white rounded-2xl ...">
    {/* card content */}
    {/* Remove the inner Link around the button; make the button decorative */}
  </div>
</Link>
```

**Files:**  
- `apps/player-pwa/src/components/matches/MatchCard.tsx:21-101`

---

## Additional Findings

### A-1: `useJoinMatch` no longer sets `hasJoined` — join success not visible until refetch

In Cycle 5, `setHasJoined(true)` was removed from `handlePaySuccess`. After `joinMatch.mutate(id)` succeeds, the UI depends on `isJoined` from `match.roster`. The `invalidateQueries` triggers a refetch, but there's a **perceptible delay** between the sheet closing and the roster updating. The user might think nothing happened.

**Recommendation:** Show a loading/processing state on the match detail while the join is in progress, or optimistically update the roster.

---

### A-2: No `joinMatch.isPending` check on match detail

The `joinMatch` mutation runs but there's no visual feedback (no spinner, no disabled button). After tapping "Join Match" → paying → returning to detail, the user sees the pre-join state for 1-2 seconds until the refetch completes.

---

### A-3: Wallet history not invalidated after join payment

`usePayWallet.onSuccess` invalidates `['wallet', 'balance']` and `['wallet', 'history']`. But `useJoinMatch.onSuccess` does NOT invalidate wallet queries. If the user navigates to the wallet page after joining, the transaction should appear (because `usePayWallet` already invalidated it). But if the user refreshes or navigates later, the cached history might still be stale from before the pay.

**This is OK** — `usePayWallet` handles the invalidation. The wallet history is correct after payment.

---

## Summary

| # | Severity | Issue | Root Cause |
|---|----------|-------|------------|
| 1 | 🟡 IMPORTANT | Match detail slow to update after join | `isJoined` derived from refetch; no optimistic update; no loading state |
| 2 | 🟡 IMPORTANT | My Games stale after join | `invalidateQueries` missing `['user', 'my-matches']` |
| 3 | 🔴 CRITICAL | Wallet transactions crash silently | API returns `{ transactions: [...] }`, hook expects `[...]` |
| 4 | 🔴 CRITICAL | MatchCard not clickable | Only Join button is wrapped in `<Link>`, not the whole card |
| A-1 | 🟡 IMPORTANT | No loading state during join | `joinMatch.isPending` not used in UI |
| A-2 | 🟢 MINOR | No optimistic roster update | Join button doesn't disable during processing |

---

**⏸️ STOP — 6 findings. 2 CRITICAL (transactions crash, cards not clickable). Gate 0 ready for review.**
