# Gate 0 — Retrospective: Profiles & Spots Remediation

**Feature:** `profiles-and-spots-remediation`  
**Date:** 2026-08-09  
**Baseline commit:** `e79d597` — "feat: club detail page + join/host detection from match data"  
**Current HEAD:** `a4d3205` — "chore: enforce 4-gate software factory workflow and observability standards"

---

## Executive Summary

Review of the recent commit history reveals a reactive "fix-after-ship" pattern and several contract gaps between the backend API and the PWA frontend. The most critical findings concern **incomplete API responses** (bare rows / missing fields) and **spot counting accuracy** in match rosters. Four issues are categorized as BLOCKING for the profiles-and-spots-remediation cycle.

---

## Findings

### 🔴 CRITICAL-1: `joinMatch` returns bare DB row (API Contract Violation)

**File:** `apps/api/src/modules/matches/matches.service.ts:211-276`  
**The bug:** `joinMatch()` inserts a `match_players` row and returns the raw insert result (`return player;` at line 274). The frontend expects a fully populated match object with roster, host, pitch, and venue relations.

```typescript
// ❌ Current (line 274):
return player; // bare match_players row — no relations

// ✅ Needed:
return this.findOne(matchId); // fully populated match with roster
```

**Impact:** After joining a match, the PWA must make a separate `GET /matches/:id` call to get updated roster data. If the frontend naively trusts the join response, it gets only `{ id, match_id, user_id, is_host, team, no_show }` — no player names, avatars, or ratings.

**Severity:** BLOCKING — violates the new API Contract Rule in AGENTS.md §2.

---

### 🔴 CRITICAL-2: `leaveMatch`/`startMatch`/`completeMatch`/`cancelMatch` return plain objects

**File:** `apps/api/src/modules/matches/matches.service.ts:282-537`  

All status-transition methods return `{ message: string, status?: string }` plain objects instead of the updated match with full relations.

```typescript
// ❌ leaveMatch: `return { message: 'Successfully left the match.' };`
// ❌ startMatch: `return { message: 'Match started.', status: 'InProgress' };`
// ❌ completeMatch: `return { message: 'Match completed.', status: 'Completed' };`
```

**Impact:** After leaving/starting/completing a match, the frontend must refetch the match detail to update the UI. This doubles network requests and creates race conditions where the UI briefly shows stale data.

**Severity:** BLOCKING — violates API Contract Rule. Every mutation endpoint should return the updated resource.

---

### 🟡 IMPORTANT-3: Venue detail missing `environment` field on pitches

**File:** `apps/api/src/modules/venues/venues.service.ts:94-124`  

The `findOne` method selects these pitch columns: `id, name, size, surface_type, hourly_rate` — **missing `environment`**.

```typescript
// Current columns selection (line 107-114):
pitches: {
  columns: {
    id: true, name: true, size: true,
    surface_type: true, hourly_rate: true,
    // ❌ MISSING: environment
  },
},
```

Meanwhile, the PWA club detail page (`clubs/[id]/page.tsx:103`) renders:
```tsx
{pitch.surface_type} &bull; {pitch.size} &bull; {pitch.environment}
```

Since `environment` is never returned by the API, it always renders as empty/undefined. The frontend type `PitchApi` marks it as optional (`environment?: string`), which masks the bug — the field is silently absent.

**Severity:** IMPORTANT — causes incomplete UI rendering on every club detail page.

---

### 🟡 IMPORTANT-4: `spots_filled` counts host in discovery feed — accuracy concern

**File:** `apps/api/src/modules/matches/matches.service.ts:97-129`  

The nearby feed query counts ALL `match_players` rows including the host:
```sql
COUNT(mp.id)::int AS spots_filled  -- includes host (is_host=true)
```

In `createMatch`, the host is inserted as a `match_players` row. So `spots_filled` starts at 1 (the host), and `max_players` presumably includes the host slot.

**Question to resolve in Gate 1:** Does the product intend for `max_players` to include or exclude the host? If `max_players = 10` means 10 total (host + 9 others), then `spots_filled` of 1/10 is correct for a newly created match. If it means 10 additional players, then the host should not be counted.

Currently the frontend shows `filledSpots / totalSpots` as-is. The math is consistent but may confuse users who see "1/10 spots filled" on a brand new match with only the host.

**Severity:** IMPORTANT — needs product clarification in Gate 1. Not a code bug per se, but a UX accuracy concern.

---

### 🟢 MINOR-5: `adaptNearbyMatch` hardcodes `roster: []` and `surface: ''`

**File:** `apps/player-pwa/src/lib/api-adapter.ts:232-263`  

The nearby feed adapter sets empty values for:
- `roster: []` — even though the feed could include a minimal player list
- `surface: ''` — the pitch surface is available via a join but not queried
- `imageUrl: ''` — no image support

These are "known sparse" by design (the feed query is optimized for list performance, not detail), but the empty arrays/strings can trigger the Empty UX state incorrectly on cards. A MatchCard showing "0 players" when there are 3 is misleading.

**Severity:** MINOR — UX polish concern for the feed cards.

---

## Commit History Anti-Patterns

Review of the last 10 commits (95eb1df → a4d3205) shows:

```
95eb1df fix(auth): cross-origin JWT via Bearer header
8c0839a feat(join): wire match join flow to API
de387f6 fix: match create crash + profile shows real API user data
a6cb3e1 fix: Book Spot → Join Match with i18n, profile API data
80cea31 fix: club book button navigates to club detail
1f25571 fix: club navigation + team lineup dedup + join match i18n
f37d969 fix: GLM review — sign-out clears JWT, BottomNav i18n, 204 crash
5842803 fix(infra): add Redis health dependency
75ee1b5 feat(auth): migrate OTP store to Redis
c762556 fix(phase6): resolve CRITICAL + IMPORTANT findings
4d50cf3 fix(phase6-2): resolve remaining GLM review findings
266a366 feat: add hostId + roster userId to Match type
279597b fix: join state from match data + host sees no Join button
e79d597 feat: club detail page + join/host detection
```

**Pattern:** 9 fix commits, 4 feat commits. The fix:feat ratio is **2.25:1** — meaning we spend more than twice as much time fixing features as building them. This is the "reactive fix loop" that the 4-Gate workflow is designed to break.

**Root cause:** Features are shipped without Gate 3 (Program Design) — the API response shapes are not contracted before implementation begins. This leads to:
- Backend returns bare rows → frontend crashes → fix commit
- Frontend expects field not in API → UI is broken → fix commit
- Contract mismatch discovered in review → another fix commit

---

## Recommendations for This Cycle

1. **Fix CRITICAL-1 and CRITICAL-2 in Slice 1**: All mutation endpoints must return `this.findOne(id)` — the fully populated match with relations.
2. **Fix IMPORTANT-3 in Slice 1**: Add `environment` to the venue detail pitch column selection.
3. **Resolve IMPORTANT-4 in Gate 1 (Product Spec)**: Define the exact contract for `max_players` vs `spots_filled` — does max include the host?
4. **Address MINOR-5 in Gate 3 (Program Design)**: Define the exact shape of a "feed match" vs "detail match" and ensure the adapter doesn't silently drop available data.

---

## Gate 0 Verdict

**4 issues found — 2 BLOCKING, 2 IMPORTANT, 1 MINOR.**

Gate 0 recommends proceeding to Gate 1 with the above findings as input. The CRITICAL issues should be resolved in the first vertical slice of this cycle.

---

**⏸️ STOP — Waiting for Gate 0 approval. Proceed to Gate 1 only after explicit user confirmation.**
