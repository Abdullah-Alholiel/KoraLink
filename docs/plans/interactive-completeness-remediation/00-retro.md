# Gate 0 — Audit #3: Interactive Element & Data Flow Completeness

**Feature:** `interactive-completeness-remediation`  
**Date:** 2026-08-09  
**Baseline:** `73a2c3f` — "fix: state-language-profile-join remediation"  
**Scope:** Every interactive element on every page audited for functionality.

---

## Audit Method

Checked every button, link, input, and data hook on all 16 pages/components. Categorized as: ✅ Working | 🟡 Partial | 🔴 Dead/Broken

---

## Findings

### 🔴 CRITICAL (2 bugs)

**C-1: DevLoginBar doesn't populate Zustand user**

**File:** `components/auth/DevLoginBar.tsx:37-51`  
After dev-login succeeds, the component calls `setAuthToken(token)` then `window.location.href = ...` — a **hard page reload** that wipes Zustand. The persisted Zustand state rehydrates with `user: null` from before login. Dev-login users cannot test join state, host detection, or any feature requiring `storeUser.id`.

```typescript
// Current (broken):
window.location.href = `/${document.documentElement.lang || 'en'}`;

// Fix: populate Zustand BEFORE redirect
const profile = await fetcher<UserProfileApi>('/users/me');
useAppStore.getState().login({...profile}, res.token);
// Then use router.push() instead of hard reload
```

**Fixes:** Same cascade as verify page fix — join detection, host detection, isAuthenticated, stats, profile display.

---

**C-2: Messages page uses old sparse `useMyMatches` — no host/pitch/format data**

**File:** `app/[locale]/(main)/messages/page.tsx:7`  
Imports `useMyMatches` from `@/hooks/useMessages` which returns `MyJoinedMatch` (9 fields — old shape). The extended version in `@/hooks/useUser` returns `NearbyMatchApi` (18 fields).

```typescript
// Current: sparse data — no host_name, match_type, gender_rule, pitch data
import { useMyMatches } from '@/hooks/useMessages';

// Fix: use the extended hook
import { useMyMatches } from '@/hooks/useUser';
import { adaptMatchList } from '@/lib/api-adapter';
```

This means the messages page cards show only `venue_name`, `spots_filled`, `status`, and `scheduled_at`. Missing: `host_name`, `match_type`, `pitch_name`, `duration_mins`, `gender_rule`.

---

### 🟡 IMPORTANT (6 bugs)

**I-1: BottomNav has no active state for `/my-games` or `/personal-info`**

**File:** `components/layout/BottomNav.tsx:27-33`  
The `isActive` function checks `pathname.startsWith(fullPath)`. There are only 5 tabs: Feed, Clubs, Play, Messages, Profile. When user navigates to `/my-games` or `/personal-info`, NO tab is highlighted. Users lose spatial orientation.

**Fix:** Either treat these as sub-pages of Profile (highlight Profile tab when pathname includes `/my-games` or `/personal-info`), or add them as explicit nav items.

---

**I-2: Search bar on Play page is non-functional (dead `<span>`)**

**File:** `app/[locale]/(main)/play/page.tsx:53-57`  
```tsx
<Search ... />
<span className="text-sm text-gray-400">{t('play.searchPlaceholder')}</span>
```
This is a `<span>` — not an `<input>`. No typing, no filtering, no submit. It looks like a search bar but does nothing.

---

**I-3: Dead icon buttons (notifications, map, search) on multiple pages**

| Page | Element | Line | Status |
|------|---------|------|--------|
| Play | Bell notification button | 43-48 | 🔴 No onClick |
| Clubs | Map pin button | 56-58 | 🔴 No onClick |
| Messages | Search button | 40-42 | 🔴 No onClick |
| Feed (home) | Bell notification button | 31-33 | 🔴 No onClick |

All four are decorative — no handler, no navigation, no action.

---

**I-4: Community feed home page uses inline cards, not shared `MatchCard`**

**File:** `app/[locale]/(main)/page.tsx:88-153`  
The home feed renders match cards inline rather than using the shared `<MatchCard>` component. This means:
- MatchCard improvements (like roster preview, format/surface display) don't appear on the home page
- Two different card implementations to maintain
- Inconsistent UX between home feed and /play page (which does use MatchCard)

---

**I-5: Clubs "Book" button is misleading**

**File:** `app/[locale]/(main)/clubs/page.tsx:194-197`  
The button says "Book" but navigates to club detail. The club detail page then has a "Host a Match Here" CTA. The "Book" label implies a booking/reservation flow which doesn't exist.

**Recommendation:** Change label to "View" or "Details", or remove the button and make the entire card tappable.

---

**I-6: Wallet page shows 0 balance while loading**

**File:** `app/[locale]/(main)/wallet/page.tsx:114`  
```typescript
const balance = balanceData?.balance ?? 0;
```
During loading, `balanceData` is `undefined`, so balance shows `0`. The page doesn't distinguish between "loading" and "balance is actually 0". Users see a flash of SAR 0.00 before the real balance loads.

**Fix:** Only compute balance when data is loaded:
```typescript
const balance = balanceLoading ? null : (balanceData?.balance ?? 0);
// UI: show skeleton when balanceLoading, show 0 only when data loaded
```

---

### 🟢 MINOR (2 bugs)

**M-1: Complete profile page camera button is dead**

**File:** `app/[locale]/(auth)/complete-profile/page.tsx:82-84`  
Same issue as the profile page camera button had before C-3 fix — no onClick, no functionality.

---

**M-2: DevLoginBar seeded phones use masked numbers (`****`)**

**File:** `components/auth/DevLoginBar.tsx:30-34`  
```typescript
phone: '+966****0001'  // literal asterisks!
```
These masked phones are invalid. The dev-login endpoint won't match them. Dev login is effectively broken for seeded users. The actual seed data uses `+966500000001` (5 zeros).

---

## Feature Status Map (Post-Audit)

| Feature | Status | Issue |
|---------|--------|-------|
| Login + OTP flow | ✅ Works | (Verify fixed last cycle) |
| Dev Login | 🔴 C-1 | Doesn't populate Zustand |
| Complete Profile | 🟢 M-1 | Camera button dead |
| Play / Discovery | 🟡 I-2 | Search bar non-functional |
| Match Cards (play) | ✅ Works | Uses shared MatchCard |
| Match Detail + Join | ✅ Works | Fixed last cycle (C-1) |
| Host Match Form | ✅ Works | Full form with venue picker |
| Clubs list | 🟡 I-3, I-5 | Dead map button, misleading "Book" |
| Club detail | ✅ Works | Shows venue + pitches |
| Messages | 🔴 C-2 | Sparse data, dead search button |
| Wallet | 🟡 I-6 | Shows 0 during loading |
| Profile | ✅ Works | Fixed last cycle |
| My Games | ✅ Works | Fixed last cycle |
| Personal Info | ✅ Works | Created last cycle |
| BottomNav | 🟡 I-1 | No active state for sub-pages |
| Feed (home) | 🟡 I-3, I-4 | Dead bell, inline cards |
| Language switch | ✅ Works | Fixed last cycle |
| Real-time chat | 🟡 Known | Socket namespace correct, untested E2E |

---

## Recommendation

**Slice priority:**
1. C-1: Fix DevLoginBar user population (unblocks all dev testing)
2. C-2: Fix messages page data source (sparse → full)
3. I-1: Fix BottomNav active state for sub-pages
4. I-2: Fix Play page search bar (make functional or remove)
5. I-3: Wire or remove dead icon buttons
6. I-4: Unify feed cards to use MatchCard
7. I-5: Fix clubs "Book" label
8. I-6: Fix wallet loading balance display
9. M-1: Wire complete-profile camera button
10. M-2: Fix DevLoginBar seeded phone numbers

---

**⏸️ STOP — 10 bugs found. 2 CRITICAL, 6 IMPORTANT, 2 MINOR.**
