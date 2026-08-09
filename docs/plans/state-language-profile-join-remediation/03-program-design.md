# Gate 3 — Program Design: State, Language, Profile & Join Remediation

**Feature:** `state-language-profile-join-remediation`  
**Date:** 2026-08-09

---

## C-1: Verify OTP → Populate Zustand

### Contract: verify/page.tsx onSuccess handler

```typescript
// EXISTING (broken):
onSuccess: (data) => {
    if (data.isNewUser) {
        router.push(`/${locale}/complete-profile`);
    } else {
        router.push(`/${locale}`);  // user never stored
    }
},

// NEW (fixed):
onSuccess: async (data) => {
    if (data.isNewUser) {
        router.push(`/${locale}/complete-profile`);
    } else {
        const profile = await fetcher<UserProfileApi>('/users/me');
        const skillLevel = (profile.skill_level?.toLowerCase() ?? 'intermediate') as 'beginner' | 'intermediate' | 'advanced';
        useAppStore.getState().login({
            id: profile.id,
            fullName: profile.full_name ?? '',
            handle: profile.handle ?? '',
            avatarUrl: profile.avatar_url ?? '',
            phone: profile.phone,
            preferredLocation: profile.preferred_location ?? '',
            preferredPosition: profile.preferred_position ?? '',
            skillLevel,
            locale: locale as 'ar' | 'en',
        }, '');
        router.push(`/${locale}`);
    }
},
```

**Type used:** `UserProfileApi` from `hooks/useUser.ts` (already exported inline, needs explicit export).  
**Api endpoint:** `GET /users/me` (already exists, requires JWT cookie set by verify-otp).

---

## C-2: Language Switcher

```typescript
// profile/page.tsx — add onClick to Language MenuItem
<MenuItem
    icon={<Globe className="w-5 h-5" strokeWidth={1.5} />}
    label={t('profile.language')}
    endText={locale === 'ar' ? t('profile.languageAr') : t('profile.languageEn')}
    onClick={() => {
        const newLocale = locale === 'ar' ? 'en' : 'ar';
        const newPath = pathname.replace(`/${locale}`, `/${newLocale}`);
        router.push(newPath);
    }}
/>
```

**Imports needed:** `useRouter` from `next/navigation` (already imported).

---

## C-3: Personal Information → Edit Page

### New route: `/(main)/personal-info/page.tsx`

```typescript
'use client';

import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ArrowLeft } from 'lucide-react';
import MobileFrame from '@/components/layout/MobileFrame';
import BottomNav from '@/components/layout/BottomNav';
import { useUserProfile, useUserStats } from '@/hooks/useUser';
import { selectUser, useAppStore } from '@/store/useAppStore';

export default function PersonalInfoPage() {
    const pathname = usePathname();
    const t = useTranslations();
    const storeUser = useAppStore(selectUser);
    const { data: apiUser } = useUserProfile();
    const { data: stats } = useUserStats();
    
    const fullName = apiUser?.full_name ?? storeUser?.fullName ?? '-';
    const handle = apiUser?.handle ?? storeUser?.handle ?? '-';
    const phone = apiUser?.phone ?? storeUser?.phone ?? '-';
    const position = apiUser?.preferred_position ?? storeUser?.preferredPosition ?? '-';
    const skill = apiUser?.skill_level ?? storeUser?.skillLevel ?? '-';
    const location = apiUser?.preferred_location ?? storeUser?.preferredLocation ?? '-';
    
    // 5 UX states: Loading, Error, Populated
    return <MobileFrame>
        {/* Header with back */}
        {/* Info fields as read-only rows */}
        <BottomNav />
    </MobileFrame>;
}
```

### Profile page camera button → wire to personal-info

```tsx
// profile/page.tsx line 117-122
<button onClick={() => router.push(`/${locale}/personal-info`)} ...>
    <Camera ... />
</button>
```

And Personal Info MenuItem:
```tsx
<MenuItem
    icon={<User ... />}
    label={t('profile.personalInfo')}
    href={`/${locale}/personal-info`}
/>
```

---

## I-1: My Games — verify `duration_mins` default

The `getMyMatches` SQL returns `m.duration_mins` but `adaptNearbyMatch` uses `row.duration_mins`. If the DB column has NULL values, `adaptNearbyMatch` calls `fmtEnd(scheduled, row.duration_mins)` which would produce NaN. Add a default:

```typescript
// api-adapter.ts:246 — existing code already handles this:
endTime: fmtEnd(scheduled, row.duration_mins),
// fmtEnd uses new Date(scheduled.getTime() + durationMins * 60_000)
// If duration_mins is null, this produces invalid date.
```

**Fix:** Add `?? 60` default:
```typescript
endTime: fmtEnd(scheduled, row.duration_mins ?? 60),
```

And in `adaptNearbyMatch`:
```typescript
endTime: fmtEnd(scheduled, row.duration_mins ?? 60),
```

---

## I-2: skill_level case — verify and fix

The `CompleteProfileDto` in the API uses the Drizzle enum (PascalCase: 'Beginner' | 'Intermediate' | 'Advanced'). The frontend sends PascalCase directly. This should work. **Verification only — likely already fixed.**

Check `apps/api/src/modules/auth/dto/complete-profile.dto.ts` — if it uses `@IsEnum(['Beginner', 'Intermediate', 'Advanced'])` with union TypeScript type, it's correct.

---

## I-3: Remove venue cache interceptor

```typescript
// venues.controller.ts — REMOVE these lines:
@UseInterceptors(CacheInterceptor)
@CacheTTL(60)
```

Keep the class-level decorators, remove only the cache lines. The controller already has `@UseGuards(JwtCookieAuthGuard)`.

---

## I-4: Fix socket namespace

```typescript
// useMessages.ts — change connection:
// BEFORE: io(url, { path: '/socket.io', ... })
// AFTER:  io(`${url}/lobby`, { path: '/socket.io', ... })
```

---

## Implementation Order (Gate 4)

**Slice 1 (Critical fixes):** C-1, C-2, C-3 — unblocks join state, language, profile  
**Slice 2 (Important fixes):** I-1, I-2, I-3, I-4 — remaining broken features

**Hard gate per slice:** `turbo run build` must pass.
