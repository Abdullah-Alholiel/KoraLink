# Gate 2 — Architecture: State, Language, Profile & Join Remediation

**Feature:** `state-language-profile-join-remediation`  
**Date:** 2026-08-09

---

## Changes

### C-1: Populate Zustand `user` after OTP verify

**File:** `apps/player-pwa/src/app/[locale]/(auth)/verify/page.tsx`  
**Approach:** After successful verify for existing user, fetch `/users/me` and call `useAppStore.getState().login()`.

### C-2: Wire language switcher

**File:** `apps/player-pwa/src/app/[locale]/(main)/profile/page.tsx`  
**Approach:** Add `onClick` to Language MenuItem that calls `router.push()` with swapped locale.

### C-3: Wire Personal Information

**File:** `apps/player-pwa/src/app/[locale]/(main)/profile/page.tsx`  
**Approach:** Navigate to existing complete-profile page (reuse as edit profile) or create a personal-info page.  
**Decision:** Create `/(main)/personal-info/page.tsx` — a simple read-only view first. Edit mode is future scope. Profile page camera button also gets wired.

### I-1: My Games data verification

**File:** `apps/api/src/modules/users/users.service.ts`  
**Approach:** Verify SQL is correct (already fixed in previous cycle). Add `duration_mins` default. Ensure `spots_filled` uses same `FILTER WHERE is_host = false` logic.

### I-2: skill_level case

**File:** `apps/player-pwa/src/hooks/useAuth.ts`  
**Approach:** Already sending PascalCase. Verify API DTO accepts it. If not, transform.

### I-3: Remove venue cache interceptor

**File:** `apps/api/src/modules/venues/venues.controller.ts`  
**Approach:** Remove `@UseInterceptors(CacheInterceptor)` and `@CacheTTL()`.

### I-4: Fix socket namespace

**File:** `apps/player-pwa/src/hooks/useMessages.ts`  
**Approach:** Change socket connection URL to include `/lobby` namespace.

---

## Files Changed

| File | Change |
|------|--------|
| `verify/page.tsx` | Fetch user after OTP verify, populate Zustand |
| `profile/page.tsx` | Wire language onClick, personal info href, camera button onClick |
| `personal-info/page.tsx` | NEW — read-only profile info display |
| `useAuth.ts` | Verify skill_level case handling |
| `venues.controller.ts` | Remove cache interceptor |
| `useMessages.ts` | Fix socket namespace |
| `users.service.ts` | Verify getMyMatches SQL |
