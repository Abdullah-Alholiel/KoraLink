# Gate 0 — Retrospective: Match State Propagation Fix

**Feature:** `match-state-propagation-fix`  
**Date:** 2026-08-09  
**Baseline:** `f5ef8cd` — "fix: match-flow-remediation"

---

## Executive Summary

Cycle 6 claimed to fix match state propagation but failed because the root cause was never addressed: **`MatchCard` is a dumb component with zero awareness of the current user, and feed data contains empty rosters.** All "fixes" were superficial (i18n, button styles) without fixing the data flow.

---

## Finding 1: Play Feed Cards — No Joined State

### Root Cause

`MatchCard` (line 90-94) always renders the same button:
```tsx
<span className="bg-brand-green ...">
    {t('matchDetail.joinMatch')}   // ← ALWAYS "Join Match"
</span>
```

The component has no knowledge of the current user:
- **No `currentUserId` prop** — cannot check if user is joined
- **Feed `Match.roster` is always `[]`** — `adaptNearbyMatch` at `api-adapter.ts:260` sets `roster: []`
- **Feed API returns flat SQL rows** — no player/roster data in `findNearby` query

**Even if we added Zustand access to MatchCard, there's no roster data to compare against.**

```typescript
// adaptNearbyMatch:260 — roster is always empty for feed matches
roster: [],
```

### Root Cause Trace

```
GET /matches → findNearby() → COUNT(mp.id) AS spots_filled (no player data)
    ↓
NearbyMatchApi[] → adaptNearbyMatch() → Match { roster: [], ... }
    ↓
PlayPage → <MatchCard match={match} />  ← no currentUserId, no roster
    ↓
Button always shows "Join Match" regardless of join state
```

---

## Finding 2: My Games Cards — Still "Join Match" Button

### Root Cause — Identical to Finding 1

`MyGamesPage` uses `adaptMatchList()` which calls `adaptNearbyMatch()`, producing `Match` objects with `roster: []`. Even though `GET /users/me/matches` returns matches the user HAS joined, the frontend discards player data during adaptation.

```typescript
// MyGamesPage:20 — data correct from API, but adapted to Match with empty roster
const matches = matchesApi ? adaptMatchList(matchesApi) : [];
```

The `Match` objects have `roster: []` because `adaptNearbyMatch` hardcodes it. The API returns matches the user joined, but the adapter strips out the proof.

---

## Finding 3: Cancel/Leave — Missing i18n Key + Broken Logic

### Sub-finding 3a: Missing `matchDetail.cancelConfirm` key

**File:** `match/[id]/page.tsx:269`
```tsx
if (confirm(t('matchDetail.cancelConfirm') || 'Cancel this match?'))
```

`matchDetail.cancelConfirm` does NOT exist in `en.json` or `ar.json`. Cycle 5 added `matchDetail.leaveMatch` and `matchDetail.cancelMatch` (button labels) but forgot `cancelConfirm` (the confirm dialog text).

**Error:** `MISSING_MESSAGE: Could not resolve 'matchDetail.cancelConfirm'`

### Sub-finding 3b: Cancel button does nothing

**File:** `match/[id]/page.tsx:267-276`
```tsx
onClick={() => {
    if (confirm(t('matchDetail.cancelConfirm') || 'Cancel this match?')) {
        // TODO: wire cancel endpoint   ← NEVER IMPLEMENTED
    }
}}
```

The cancel button shows a browser `confirm()` dialog but never calls `POST /matches/:id/cancel`. The `useCancelMatch` hook doesn't exist in `useMatchActions.ts`.

### Sub-finding 3c: Context-aware logic is correct but incomplete

The UI correctly distinguishes host vs joiner:
- `!isUserHost` → shows "Leave Match" button (calls `leaveMatch.mutate(id)`) ✅
- `isUserHost` → shows "Cancel Match" button (does nothing) ❌

But the `isUserHost` check itself depends on `currentUserId = storeUser.id`, which is only populated after the Cycle 2 fix. If the user hasn't completed OTP flow (e.g., direct dev-login), `storeUser` is null → both buttons hidden or wrong.

---

## Finding 4: Messages Icon — Navigates to Wrong Place

**File:** `match/[id]/page.tsx:178`
```tsx
onClick={() => isJoined ? router.push(`/${locale}/messages`) : null}
```

When joined, clicking the messages icon navigates to `/messages` (the general messages list), not to the specific match chat. The `useMatchChat` hook exists but requires `matchId` — which isn't passed.

**Should navigate to:** A match-specific chat view, or open the match discussion inline.

---

## Finding 5: Feed Feels Dead — No Stateful Interaction

All feed cards (Play, My Games) are visually identical regardless of:
- Whether user has joined (always shows "Join Match")
- Whether user is the host (always shows "Join Match" for own matches)
- Match status (shows "Join Match" even for Completed/Cancelled matches)

The card should show:
| Situation | Button |
|-----------|--------|
| User not joined, match Open | "Join Match" (green) |
| User joined, match Open/Full | "Joined" badge + "View" |
| User is host | "Your Match" badge |
| Match Completed/Cancelled | "View Details" |

---

## Summary

| # | Severity | Issue | Root Cause |
|---|----------|-------|------------|
| 1 | 🔴 CRITICAL | Play feed always shows "Join Match" | `MatchCard` has no `currentUserId`; feed `Match.roster` is always `[]` |
| 2 | 🔴 CRITICAL | My Games always shows "Join Match" | Same as #1 — `adaptNearbyMatch` hardcodes `roster: []` |
| 3a | 🔴 CRITICAL | `cancelConfirm` i18n key missing | Key never added to JSON files |
| 3b | 🔴 CRITICAL | Cancel button does nothing | `POST /matches/:id/cancel` never called; no `useCancelMatch` hook |
| 3c | 🟡 IMPORTANT | Cancel/Leave depends on Zustand | User must be populated (Cycle 2 fix); fails silently if null |
| 4 | 🟡 IMPORTANT | Messages icon goes to wrong page | Navigates to `/messages` list, not match-specific chat |
| 5 | 🟡 IMPORTANT | Feed cards not stateful | No context-sensitive button labels; Completed matches still show "Join" |

---

## Required Fixes (Minimum Viable)

1. **Pass `currentUserId` to `MatchCard`** — from Zustand store at the page level
2. **Add `roster` support to feed API** — either include player list in `findNearby` or add a separate "joined match IDs" endpoint
3. **Make `MatchCard` state-aware** — show "Joined" / "Your Match" / "Join" based on user context
4. **Add missing i18n keys** — `matchDetail.cancelConfirm`, `leaveConfirm`
5. **Create `useCancelMatch` hook** — wire `POST /matches/:id/cancel` to the cancel button
6. **Replace `confirm()` dialogs** — use a proper confirmation modal/bottom sheet

---

**⏸️ STOP — 6 bugs found. 3 CRITICAL, 3 IMPORTANT. Gate 0 ready for review.**
