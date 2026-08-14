---
name: koralink-frontend-patterns
description: "KoraLink PWA: i18n maps, test wrappers, bottom-sheet forms."
version: 1.0.0
---

# KoraLink Frontend Patterns

Recurring patterns discovered during KoraLink PWA feature work. Supplement to `koralink-ui-standards` for component-level implementation concerns.

---

## 1. i18n Option Mapping

When a component renders a fixed set of selectable options (tabs, filters, gender rules, match types), each option has an untranslated logical key used in state logic and a translated label shown to the user. Use a const map pattern outside the component:

```tsx
const FILTER_KEYS = ['Nearby', 'Top Rated', 'Indoor', 'Available Now'] as const;
type FilterKey = (typeof FILTER_KEYS)[number];

const FILTER_LABEL_MAP: Record<FilterKey, string> = {
    Nearby: 'clubs.filters.nearby',
    'Top Rated': 'clubs.filters.topRated',
    Indoor: 'clubs.filters.indoor',
    'Available Now': 'clubs.filters.availableNow',
};

const GENDER_I18N_MAP: Record<string, string> = {
    'Men Only': 'host.genderMen',
    'Women Only': 'host.genderWomen',
    Mixed: 'host.genderMixed',
};
```

Inside the component, iterate the KEY array for rendering but use the MAP for display:
```tsx
{FILTER_KEYS.map((key) => (
  <button key={key} onClick={() => setFilter(key)}>
    {t(FILTER_LABEL_MAP[key])}
  </button>
))}
```

This keeps `setFilter('Top Rated')` working with the stable key while displaying the Arabic/English label from i18n.

### Pitfall: `useTranslations('namespace')` + dynamic key access
When using `useTranslations('clubs')`, the map values should be relative: `filters.nearby` not `clubs.filters.nearby`. When using root-scope `useTranslations()`, use full path: `clubs.filters.nearby`.

---

## 2. Multi-Line i18n (Anti-Pattern)

**NEVER split a translation string at an English word to insert a `<br />`:**

```tsx
// ❌ BROKEN — fails when Arabic translation doesn't contain "number"
{t('title').split('number')[0]} <br /> number

// ✅ CORRECT — dedicated line keys
{t('titleLine1')} <br /> {t('titleLine2')}
```

Each locale gets two independent keys that are naturally divided at a semantic boundary:
```json
// en.json
{ "titleLine1": "Enter your phone", "titleLine2": "number" }
// ar.json
{ "titleLine1": "أدخل رقم", "titleLine2": "هاتفك" }
```

This was I8 from the GLM 5.2 review — the split-on-word trick silently produced garbage in Arabic.

---

## 3. Testing Components with useTranslations()

Any test rendering a component that calls `useTranslations()` MUST wrap it in `NextIntlClientProvider`. Without it, all tests fail with:

`Failed to call useTranslations because the context from NextIntlClientProvider was not found.`

### Standard wrapper setup

```tsx
import { render } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import enMessages from '@/messages/en.json';

function renderWithProviders(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider messages={enMessages} locale="en">
      {ui}
    </NextIntlClientProvider>
  );
}

// Use everywhere instead of bare render():
renderWithProviders(<MatchCard match={baseMatch} />);
```

Add this to `test/setup.ts` if many test files need it, or define per-file for targeted suites.

### Tests must match actual i18n output

When the component uses `t('matchDetail.joinMatch')` which resolves to "Join Match", the test assertion must search for "Join Match", not "Book Spot" (a stale key from an older version). Always verify the actual resolved string in the locale file.

---

## 4. Bottom Sheet with Form Input (Replacing prompt())

Browser `prompt()` is blocked in PWA/webview contexts and has zero validation. Replace with a proper bottom sheet modal containing an input field:

> **z-index layering rule (CRITICAL):** Bottom sheets MUST use `z-[60]` (backdrop) and `z-[70]` (sheet) — NOT `z-50`. `BottomNav` uses `z-50` and renders later in the DOM, so a `z-50` sheet ties with it and content gets clipped behind the nav bar / Play FAB. This bug was found on `MatchRulesSheet`; `PaymentSheet` and `TeamLineupSheet` already use the correct values.

```tsx
const [showModal, setShowModal] = useState(false);
const [amount, setAmount] = useState('');
const [error, setError] = useState('');

// Modal trigger
<button onClick={() => setShowModal(true)}>Top Up</button>

// Modal
{showModal && (
  <>
    <div className="fixed inset-0 bg-black/50 z-[60]" onClick={() => {
      setShowModal(false); setAmount(''); setError('');
    }} />
    <div className="fixed bottom-0 inset-x-0 max-w-md mx-auto bg-white rounded-t-3xl z-[70] animate-slide-up">
      <div className="flex justify-center pt-3 pb-2">
        <div className="w-10 h-1 rounded-full bg-gray-300" />
      </div>
      <div className="px-5 pb-6">
        {/* Header with close */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-brand-black">{t('wallet.topUp')}</h2>
          <button onClick={() => { setShowModal(false); setAmount(''); setError(''); }}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100">
            <X className="w-5 h-5 text-gray-500" strokeWidth={2} />
          </button>
        </div>
        {/* Input */}
        <div className="flex items-center gap-2 bg-gray-50 rounded-xl border border-gray-100 px-4 py-3.5 mb-3 focus-within:border-brand-green transition-colors">
          <span className="text-sm font-bold text-gray-500" dir="ltr">SAR</span>
          <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)}
            className="flex-1 text-lg font-bold text-brand-black placeholder:text-gray-300 outline-none bg-transparent"
            autoFocus />
        </div>
        {/* Validation error */}
        {error && <p className="text-sm text-brand-red mb-3 text-center">{error}</p>}
        {/* Submit */}
        <button onClick={handleSubmit} disabled={mutation.isPending || !amount}
          className="w-full py-4 rounded-2xl bg-brand-green text-white text-sm font-bold
            shadow-[0_4px_20px_rgba(37,65,50,0.4)] active:scale-[0.98] transition-transform
            disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed disabled:shadow-none">
          {mutation.isPending ? t('payment.processing') : t('wallet.topUp')}
        </button>
      </div>
    </div>
  </>
)}
```

Key behaviors:
- Clear all state on modal dismiss (amount, error)
- `autoFocus` on the input so the keyboard opens immediately
- `inputMode="decimal"` for mobile numeric keyboard
- Disable submit when empty or mutation in flight
- Always show processing state during mutation

### Pitfall: Component with useEffect `onChange`/`onSelect` inside a bottom sheet

**Symptom**: A bottom sheet opens, renders a child component (like DatePicker) that fires `onSomeChange(currentValue)` in a `useEffect` on mount, and the parent closes the sheet on that callback. Result: the sheet opens and **instantly closes** before the user can interact.

**Canonical example** — club detail DatePicker:
```
Tap "View Calendar" → showCalendar=true → sheet renders <DatePicker>
→ DatePicker useEffect fires onDateSelect(todayDate)
→ handleDateSelect → setShowCalendar(false)
→ sheet CLOSED before user sees it
```

**Fix (RECOMMENDED) — suppress the initial fire via a `fireOnMount` prop**: Add an explicit prop to the child with a safe default, and pass `false` from the sheet context. This is the robust fix — it does not depend on React effect ordering.

```tsx
interface DatePickerProps {
  onDateSelect?: (d: Date) => void;
  /** Fire onDateSelect on mount. Default true (Play page needs it). */
  fireOnMount?: boolean;
}
function DatePicker({ onDateSelect, fireOnMount = true }) {
  useEffect(() => {
    if (fireOnMount) onDateSelect?.(dates[0].date);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // ...
}
// club detail (in a sheet): <DatePicker onDateSelect={handleDateSelect} fireOnMount={false} />
```

**⚠️ Do NOT use the ref-guard ordering trick.** An earlier attempt used `useRef` + `useEffect` on `showSheet` to skip the first callback, relying on "parent effects run before child effects". This was **proven fragile in production** — the user reported the calendar still closing, because that ordering is React-version/mode-dependent, not guaranteed. Prefer the explicit prop every time.

**When NOT to suppress**: If the child's mount-fire is needed for initial data initialization (like DatePicker on the Play page which is inline, not in a sheet), keep `fireOnMount={true}`.

### Pitfall: DatePicker loses selection highlight when a sheet remounts it

**Symptom**: Club detail "View Calendar" → pick a date → sheet closes → matches update. Reopen the sheet and the previously chosen date is NOT highlighted (resets to TODAY), confusing the user.

**Root cause**: `DatePicker` keeps internal `selectedIndex` state initialized to `0`. Because the sheet conditionally renders it (`{showCalendar && <DatePicker/>}`), it **remounts fresh every time the sheet opens**, discarding internal state.

**Fix — make it controlled**: Give `DatePicker` an optional `selectedDate?: Date` prop and derive the active day from it (fall back to internal `selectedIndex` only when the prop is absent, so the uncontrolled Play page keeps working):

```tsx
function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
const activeIndex = useMemo(() => {
  if (!selectedDate) return selectedIndex;
  const idx = dates.findIndex((item) => isSameDay(item.date, selectedDate));
  return idx >= 0 ? idx : selectedIndex;
}, [selectedDate, selectedIndex, dates]);
```

Club page passes the parent's state down: `<DatePicker onDateSelect={handleDateSelect} fireOnMount={false} selectedDate={selectedDate} />`. Compare with `isSameDay` (y/m/d only) so time-of-day differences between `new Date()` instances never break the match.

---

## 5. HostMatchForm i18n Checklist

The HostMatchForm is the most i18n-heavy component (~30 strings). Every label, placeholder, option text, disclaimer, and error message must go through `useTranslations()`. Use these keys (all under the `host` namespace):

| Context | Key | Example en |
|---------|-----|-----------|
| Page title | `host.title` | "Host a Match" |
| Section label | `host.venue` | "Venue" |
| Section label | `host.matchTitle` | "Match Title" |
| Placeholder | `host.matchTitlePlaceholder` | "e.g. Friday Night 7v7" |
| Validation | `host.matchTitleValidation` | "Title must be at least 3 characters" |
| Section label | `host.format` | "Format" |
| Section label | `host.matchType` | "Match Type" |
| Option label | `host.matchTypeCasual` | "Casual" |
| Option label | `host.matchTypeCompetitive` | "Competitive" |
| Section label | `host.gender` | "Gender" |
| Option label | `host.genderMen` | "Men Only" |
| Option label | `host.genderWomen` | "Women Only" |
| Option label | `host.genderMixed` | "Mixed" |
| Section label | `host.dateTime` | "Date & Time" |
| Sub-label | `host.date` | "Date" |
| Placeholder | `host.selectDate` | "Select date" |
| Sub-label | `host.time` | "Start Time" |
| Placeholder | `host.selectTime` | "Select time" |
| Section label | `host.duration` | "Duration" |
| Action | `host.change` | "Change" |
| Section label | `host.selectPitch` | "Select a pitch" |
| Display | `host.pitchRate` | "SAR {rate}/hr" |
| Placeholder | `host.searchVenuesPlaceholder` | "Search venues in Riyadh..." |
| Label | `host.disclaimer` | "Disclaimer:" |
| Body | `host.disclaimerText` | (full paragraph) |
| Cost label | `host.playerShare` | "Player share:" |
| Badge | `host.hostPlaysFree` | "HOST PLAYS FREE" |
| Cost label | `host.pitchCost` | "Pitch cost:" |
| Modal title | `host.selectVenueTitle` | "Select a Venue" |
| Placeholder | `host.searchByCity` | "Search by city..." |
| Empty state | `host.noVenuesFound` | "No venues found" |
| Empty (search) | `host.noVenuesFoundIn` | 'No venues found in "{city}"' |
| Error | `host.createError` | "Failed to create match. Please try again." |

Gender and match-type options use I18N_MAP constants (see Section 1) so state logic stays on the English key while display is translated.

---

## 6. Key Addition Protocol

When adding ANY new i18n key:
1. Add it to BOTH `en.json` and `ar.json` under the same path
2. Arabic values must be complete, natural translations (not machine-translated garbage)
3. Test by running `npm run build` from `apps/player-pwa` — build fails on missing keys
4. Commit JSON changes alongside the component changes that reference them

---

### Pitfall: `loading.tsx` / `error.tsx` / `not-found.tsx` — Hardcoded Strings

Next.js special files (`loading.tsx`, `error.tsx`, `not-found.tsx`) are **Server Components by default**. If they contain hardcoded text without `'use client'` + `useTranslations()`, they will show the wrong language or a fixed locale string everywhere.

**Symptom**: Arabic text appears when locale is set to English (e.g., `"جارٍ التحميل…"` on the loading spinner).

**Root cause**: The file lacks `'use client'` and uses a bare string instead of `t()`.

**Fix pattern**:

```tsx
// ❌ BROKEN — hardcoded Arabic, ignores locale
export default function Loading() {
  return <p>جارٍ التحميل…</p>;
}

// ✅ CORRECT — client component with i18n
'use client';
import { useTranslations } from 'next-intl';

export default function Loading() {
  const t = useTranslations();
  return <p>{t('common.loading')}</p>;
}
```

The `NextIntlClientProvider` from the root layout wraps these files, so `useTranslations()` works once the file is a client component.

### Pitfall: `MISSING_MESSAGE` Runtime Error

Using `t('namespace.key')` for a key that **does not exist** in `en.json` or `ar.json` passes `next build` cleanly but throws at runtime:

```
IntlError: MISSING_MESSAGE: Could not resolve `clubs.address` in messages for locale `en`.
```

**This is NOT caught by the build** — next-intl only validates keys in static analysis (template literals, JSX attributes with known paths). Dynamic `t()` calls with string variables are not checked.

**Prevention**: After adding any new `t()` call, grep both locale files to confirm the key exists:
```bash
grep '"address"' apps/player-pwa/src/messages/en.json
grep '"address"' apps/player-pwa/src/messages/ar.json
```

If a key is missing, add it to both files before the component references it. The build will pass either way — only the runtime will tell you.

---

## 7. Auth State Hydration: Populate Zustand After Login (Cascade-Fix Pattern)

> **CRITICAL — the #1 cascade-failure bug in KoraLink.** If Zustand `user` is null after login, every feature that checks `storeUser.id` breaks: join detection, host detection, stats display, profile name, `isAuthenticated` checks.

### The Root Cause

The OTP verify page (`verify/page.tsx`) and DevLoginBar navigate away WITHOUT calling `useAppStore.getState().login()`. Only `useCompleteProfile` (new-user path) calls `updateUser()`. Existing users skip it entirely → Zustand `user = null` forever.

### The Fix Pattern

After any auth event (OTP verify, dev-login, token refresh), fetch `/users/me` and populate Zustand BEFORE navigating:

```typescript
// In verify/page.tsx onSuccess callback:
onSuccess: async (data) => {
    if (data.isNewUser) {
        router.push(`/${locale}/complete-profile`);
    } else {
        // Populate Zustand for returning users
        const profile = await fetcher<UserProfileApi>('/users/me');
        const skillLevel = (profile.skill_level?.toLowerCase() ?? 'intermediate') as SkillLevel;
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

### Same Pattern for DevLoginBar

```typescript
const devLogin = async (phone: string) => {
    const res = await fetcher('/auth/dev-login', { method: 'POST', body: JSON.stringify({ phone }) });
    if (res.token) setAuthToken(res.token);
    // Populate Zustand BEFORE redirect — avoids hard reload wipe
    const profile = await fetcher<UserProfileApi>('/users/me');
    useAppStore.getState().login({...profile}, res.token ?? '');
    router.push(`/${locale}/play`); // Play screen, NOT Feed — client-side navigation, no reload
};
```

**PITFALL:** `window.location.href` causes a hard page reload that wipes Zustand. Use `router.push()` for client-side navigation. The persisted Zustand state rehydrates from localStorage asynchronously — if you hard-reload before `login()` is called, the old `user: null` state is what rehydrates.

**PITFALL (post-login landing page):** ALL auth success handlers (`verify`, `DevLoginBar`, `complete-profile`) must redirect to `/${locale}/play` — NOT `/${locale}` (which is the Feed). The product decision is: players want to land on Play to discover games, not the community feed. All three handlers had this bug simultaneously.

### Cascade Impact

Fixing this one root cause cascade-fixes 5 features:
- Match detail: `isJoined` check (was always false → now correct)
- Match detail: `isUserHost` check (was always false → now correct)
- Profile: stats row visibility (`isAuthenticated` → now true)
- Profile: name/avatar display (was fallback → now shows real data)
- Any component reading `selectUser` or `selectIsAuth`

### Dead Interactive Elements — Audit Checklist

These are common "looks functional but does nothing" patterns found across KoraLink pages:

| Pattern | Example | Fix |
|---------|---------|-----|
| MenuItem with no `onClick`/`href` | Language selector, Personal Info | Add `onClick` handler or `href` navigation |
| Decorative `<span>` styled as `<input>` | Play search bar | Replace with actual `<input>` + filter state |
| Icon buttons with no `onClick` | Notifications bell, Map pin | Wire handler or remove button |
| Hardcoded strings in components | PaymentSheet, HostMatchForm | Replace with `useTranslations()` |
| Fake operations with `setTimeout` | Payment flow | Replace with real API call |
| Display `<button>` with no `onClick` inside a card/section | LocationMap "View on Map", any icon-button styled as interactive | Wire to a real action (e.g. `window.open` Google Maps) or remove the button element. A `<button>` signals clickability — if it does nothing, it's dead UI. |
| Disabled button with no explanation | Wallet "Withdraw"/"Cards", any placeholder feature button | If the feature is planned, add a `title="Coming soon"` tooltip for accessibility AND a small pill badge below the button. Use an i18n key (`wallet.comingSoon`) so both locales get translated. If the button has no planned future, remove it entirely. |

---

## 8. Re-Adapting Already-Adapted Hook Data (Anti-Pattern)

**Symptom**: A page uses a hook like `useMatches()` that returns `{matches: Match[]}` but the page treats the return value as a raw array and calls `adaptMatchList()` on it again. Result: data is always empty because `Array.isArray({matches: [...]})` is `false`.

**Canonical example** — club detail page (fixed in commit `6dda533`):

```tsx
// useMatches returns { matches: Match[], total?: number, hasMore?: boolean }
const { data: matchesApi } = useMatches({ date, venue_id: id });

// ❌ BROKEN — matchesApi is an object, not an array. Always evaluates to [].
const matches = useMemo(() => {
  if (!matchesApi || !Array.isArray(matchesApi)) return [];
  return adaptMatchList(matchesApi);  // adaptMatchList already called inside useMatches!
}, [matchesApi]);

// ✅ CORRECT — use the already-adapted data directly
const matches = matchesApi?.matches ?? [];
```

**Rule**: When a hook's return type is documented as `{matches: Match[]}` (or similar wrapper), the page MUST consume the structured data directly — do NOT pass it through another adapter. The hook already called the adapter.

**How to spot this bug**: Look for pages that import `adaptMatchList`/`adaptNearbyMatch`/etc. AND also call `useMatches`/`useMatch`/etc. The adapter import is the tell — hooks call the adapter internally; pages should not need it.

---

## 9. usePathname() / useSearchParams() Null-Safety (Next.js 15 Strict)

Next.js 15 with strict TypeScript flags `usePathname()` and `useSearchParams()` return types as possibly `null`. Across KoraLink, 12+ files use `pathname.split('/')[1]` to extract the locale — every one must be null-guarded.

### Canonical patterns

```tsx
// ❌ BROKEN — build fails with "'pathname' is possibly 'null'"
const pathname = usePathname();
const locale = pathname.split('/')[1] || 'en';

// ✅ FIXED — null-safe with fallback
const pathname = usePathname();
const locale = (pathname ?? '').split('/')[1] || 'en';

// ✅ FIXED — ternary variant (error.tsx, offline.tsx)
const locale = ((pathname ?? '').split('/')[1] === 'ar' ? 'ar' : 'en') as keyof typeof i18n;
```

```tsx
// ❌ BROKEN — "'searchParams' is possibly 'null'"
const searchParams = useSearchParams();
const phone = searchParams.get('phone') || '';

// ✅ FIXED
const searchParams = useSearchParams();
const phone = searchParams?.get('phone') || '';
```

### Files affected (audited August 2026)

All 12+ `pathname.split('/')[1]` sites must use the null-safe pattern. The most affected files are in `(auth)` route groups where static generation triggers the null path more often, but the fix should be **universal** — apply to every instance found with:

```bash
rg "pathname\.split\('/'\)" apps/player-pwa/src
```

> **See also:** `references/derived-vs-local-state.md` — derived vs local state anti-pattern with the canonical `hasJoined` bug. Never shadow API-derived data with `useState`.
> **See also:** `references/venue-amenities-pre-select.md` — amenities badge display (emoji mapping, compact vs expanded views) and URL query param venue pre-selection for the Host form.
