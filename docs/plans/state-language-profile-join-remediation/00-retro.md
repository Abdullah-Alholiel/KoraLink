# Gate 0 — Comprehensive Audit: State, Language, Profile & Join Remediation

**Feature:** `state-language-profile-join-remediation`  
**Date:** 2026-08-09  
**Baseline:** `382e40f` — "feat: profiles-and-spots-remediation"  
**Scope:** Full-stack audit triggered by user report of broken join, language, profile, and my-games features.

---

## Executive Summary

A full-stack connectivity audit (env → fetcher → API → DB → store → page) reveals **7 bugs** — 3 CRITICAL (blocking core UX), 4 IMPORTANT (broken features). The root cause of most issues is the **auth flow never populates Zustand `user` for returning users**, causing a cascade of failures in join detection, profile display, and match ownership checks.

---

## Bug Catalog

### 🔴 C-1: Verify OTP never logs in returning users — `user` is always null in Zustand

**File:** `apps/player-pwa/src/app/[locale]/(auth)/verify/page.tsx:65-71`  
**Severity:** CRITICAL — cascade failure across 5 features

**Root cause:** After successful OTP verification for an EXISTING user, the callback navigates away without calling `useAppStore.login()`:
```typescript
onSuccess: (data) => {
    if (data.isNewUser) {
        router.push(`/${locale}/complete-profile`);
    } else {
        router.push(`/${locale}`);  // ← NO login() call!
    }
},
```

Only `useCompleteProfile` (new-user path) calls `updateUser()` via its `onSuccess`. Existing users skip this entirely. The Zustand `user` stays `null`.

**Cascade failures:**
- Match detail: `currentUserId = storeUser?.id` → `null` → `isJoined` always `false` → **Join button shows for already-joined users**
- Match detail: `isUserHost = hostId === currentUserId` → always `false` → **Host sees Join button on their own match**
- Profile page: `storeUser?.fullName` → `null` → falls back to API `useUserProfile()` which works, but `useUserProfile` also requires auth
- My Games: works because it fetches by JWT cookie, not store user ID
- Any component checking `selectIsAuth` gets `false` → stats row hidden

**Fix:** After successful OTP verify for existing users, fetch `/users/me` and populate Zustand:
```typescript
onSuccess: async (data) => {
    if (data.isNewUser) {
        router.push(`/${locale}/complete-profile`);
    } else {
        // Fetch user profile and populate store
        const user = await fetcher<UserProfileApi>('/users/me');
        useAppStore.getState().login({
            id: user.id, fullName: user.full_name ?? '', handle: user.handle ?? '',
            avatarUrl: user.avatar_url ?? '', phone: user.phone,
            preferredLocation: user.preferred_location ?? '',
            preferredPosition: user.preferred_position ?? '',
            skillLevel: (user.skill_level?.toLowerCase() ?? 'intermediate') as any,
            locale: locale as 'ar' | 'en',
        }, /* token from cookie — not needed for store */ '');
        router.push(`/${locale}`);
    }
},
```

---

### 🔴 C-2: Language switcher is dead UI — no mechanism to change locale

**File:** `apps/player-pwa/src/app/[locale]/(main)/profile/page.tsx:182-186`  
**Severity:** CRITICAL — core i18n feature non-functional

**Root cause:** The "Language" MenuItem has no `onClick` or `href`:
```tsx
<MenuItem
    icon={<Globe ... />}
    label={t('profile.language')}
    endText={locale === 'ar' ? t('profile.languageAr') : t('profile.languageEn')}
    // ← NO onClick, NO href — display-only dead button
/>
```

**What should happen:** Tapping Language should toggle the locale and navigate. Since next-intl uses URL-based routing (`/[locale]/...`), switching requires navigating to the equivalent path with the other locale:
```tsx
onClick={() => {
    const newLocale = locale === 'ar' ? 'en' : 'ar';
    const newPath = pathname.replace(`/${locale}`, `/${newLocale}`);
    router.push(newPath);
}}
```

The Zustand `setLocale()` is also unused — it updates localStorage but never triggers a URL change. Either integrate it with the router or remove the dead store action.

---

### 🔴 C-3: Personal Information menu item is dead UI

**File:** `apps/player-pwa/src/app/[locale]/(main)/profile/page.tsx:150-152`  
**Severity:** CRITICAL — profile editing inaccessible

```tsx
<MenuItem
    icon={<User ... />}
    label={t('profile.personalInfo')}
    // ← NO onClick, NO href
/>
```

There's no personal info/edit profile page. The user cannot view or edit their name, avatar, preferred position, or skill level from the profile screen. The only way to set these is during initial onboarding (complete-profile).

**Fix:** Either create a profile edit page or wire the existing camera button (line 117-122, which also has no onClick) to open an edit form.

---

### 🟡 I-1: My Games page shows wrong/empty data for returning users

**Files:** `apps/player-pwa/src/app/[locale]/(main)/my-games/page.tsx`, `apps/api/src/modules/users/users.service.ts:80-115`  
**Severity:** IMPORTANT

The user reports "my games shows active games and not games i joined." Two possible causes:

**Cause A:** The `getMyMatches` SQL joins `match_players my` + `matches` + `users` + `pitches` + `venues`. It correctly filters `WHERE my.user_id = ${userId}`. But if `userId` (from JWT `sub`) doesn't match the actual user UUID in the `users` table, the query returns empty.

**Cause B:** The page uses `adaptMatchList()` which calls `adaptNearbyMatch()`. If `match_type` or `gender_rule` come back as unexpected values (e.g., the enum string format differs), the adapter could silently fail.

**Verification needed:** Test with a known-authenticated user who has joined matches in `match_players`. Check what `GET /users/me/matches` returns.

---

### 🟡 I-2: `skill_level` case mismatch — new-user onboarding blocked

**File:** `apps/player-pwa/src/hooks/useAuth.ts:112`  
**Severity:** IMPORTANT — blocks new user registration  
**Source:** Known issue from `runtime-pitfalls.md`

The `completeProfileSchema` expects PascalCase:
```typescript
skillLevel: z.enum(['Beginner', 'Intermediate', 'Advanced']).default('Intermediate'),
```

The mutation sends this directly:
```typescript
skill_level: data.skillLevel,  // 'Beginner' — PascalCase
```

But there's a PascalCase→lowercase transform in `onSuccess` (line 118-119):
```typescript
const skillLevel = data.skill_level
    ? (data.skill_level.charAt(0).toLowerCase() + data.skill_level.slice(1)) as ...
    : 'intermediate';
```

The issue is: does the API DTO accept PascalCase? The Drizzle enum uses PascalCase values. The `CompleteProfileDto` needs to be checked. If it expects PascalCase and the frontend sends it, it should work. The runtime-pitfalls doc says there's a mismatch, but the code looks correct now. Needs verification.

---

### 🟡 I-3: Venues controller has cache-interceptor bug

**File:** `apps/api/src/modules/venues/venues.controller.ts:23` (likely)  
**Severity:** IMPORTANT — cross-user data leak  
**Source:** Known issue from `data-flow-audit.md`

The venues controller still uses `@UseInterceptors(CacheInterceptor)` without a custom cache key. This means two users with different `lat`/`lng` within the TTL window get each other's cached results (same route path → same cache key).

**Fix:** Remove `@UseInterceptors(CacheInterceptor)` entirely (same approach as matches controller).

---

### 🟡 I-4: Socket.IO namespace mismatch — chat never works

**Files:** `apps/player-pwa/src/hooks/useMessages.ts`, `apps/api/src/modules/gateway/app.gateway.ts:37`  
**Severity:** IMPORTANT — real-time chat broken  
**Source:** Known issue from `runtime-pitfalls.md`

Gateway declares `@WebSocketGateway({ namespace: '/lobby' })` but the client connects to default namespace. Emits go to a namespace with no handler. Chat messages are silently lost.

**Fix:** Client must connect to `io(`${url}/lobby`, { path: '/socket.io', ... })`.

---

## Complete Feature Gap Analysis

| Feature | Status | Bug |
|---------|--------|-----|
| Join match + see roster update | 🟡 PARTIAL | C-1: `isJoined` always false for returning users |
| Leave match | ❓ UNTESTED | No leave UI on match detail after joining |
| Host sees no Join on own match | 🔴 BROKEN | C-1: `isUserHost` always false |
| My Games shows joined matches | 🟡 BROKEN | I-1: Needs verification; C-1 may mask it |
| Language switch (ar↔en) | 🔴 BROKEN | C-2: No onClick handler |
| Personal Information / Edit Profile | 🔴 BROKEN | C-3: No onClick handler |
| Wallet balance display | ✅ WORKS | Fetches from `useWalletBalance()` API |
| Stats display | ✅ WORKS | `useUserStats()` fetches correctly |
| Feed (discovery) | ✅ WORKS | Geo-filter works |
| Match detail page | 🟡 PARTIAL | Visual works; join state broken |
| Venue detail page | ✅ WORKS | Now includes `environment` field |
| OTP login flow | ✅ WORKS | Send/verify works |
| New user onboarding | 🟡 RISKY | I-2: skill_level case may fail |
| Real-time chat | 🔴 BROKEN | I-4: Socket namespace mismatch |
| Cross-user venue caching | 🔴 BROKEN | I-3: Cache interceptor without custom key |

---

## Recommendation

This cycle should focus on **fixing the 3 CRITICAL bugs first** (C-1, C-2, C-3), then address the IMPORTANT issues. The CRITICAL bugs are interconnected — fixing C-1 (user state) will cascade-fix join detection, host detection, and profile display all at once.

**Slice priority:**
1. C-1: Populate Zustand `user` after OTP verify (fixes join/host/profile cascade)
2. C-2: Wire language switcher onClick
3. C-3: Wire Personal Information → edit profile page or modal
4. I-1: Verify and fix My Games data
5. I-2: Verify skill_level case
6. I-3: Remove venues cache interceptor
7. I-4: Fix Socket.IO namespace

---

**⏸️ STOP — Waiting for Gate 0 approval. Confirm these 7 bugs are the complete picture and prioritize before proceeding to Gate 1.**
