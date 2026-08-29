---
name: koralink-ui-standards
description: "KoraLink PWA: colors, components, RTL, forms, 5 UX states."
version: 1.0.0
---

# KoraLink UI Standards

Complete design system for the KoraLink player PWA. Every UI change MUST follow these standards.

---

## 1. Color Palette

> **Source:** Extracted from 5 design screenshots via pixel sampling (2026-08-09).
> Screenshots analyzed: `D_Main_nav.png`, `FD_Phone_Number.png`, `fo_KoraLink_Match.png`, `Fo_Checkout_and.png`, `Fo_User_Profile.png`.
> When screenshots and `tailwind.config.ts` conflict, **screenshots are the authority**.

### Primary Colors (from screenshots)

| Token | Screenshot Hex | Current config | Usage |
|-------|---------------|----------------|-------|
| **brand-green** | `#254132` (checkout CTA), `#264233` (match badge), `#2b4638` (login avg) | `#1B4332` ❌ too dark | Primary CTAs, active nav, FAB, status badges |
| **brand-dark** | `#202124` (consistent across ALL screens) | `#111827` ❌ too dark | Primary text, headings, dark surfaces |
| **brand-bg** | `#f7f8f7` (slight green tint) | `#F9FAFB` ❌ bluer gray | Page/sheet backgrounds |
| **brand-red** | `#d4494c` (checkout price) | `#E63946` ❌ too bright | Destructive actions, warnings, alerts |
| **brand-surface** | `#ffffff` | `#ffffff` ✅ | Cards, menu items, elevated surfaces |
| **brand-gray** | `#6B7280` | `#6B7280` ✅ | Secondary text (not sampled — keeping) |
| **brand-border** | `#E5E7EB` | `#E5E7EB` ✅ | Dividers, input borders |

### Color Update Required

```diff
# tailwind.config.ts must be updated:
- 'brand-green': '#1B4332',
+ 'brand-green': '#254132',   // from checkout CTA button
- 'brand-green-light': '#2D6A4F',
+ 'brand-green-light': '#2d5c3e',  // lighter shade of #254132
- 'brand-red': '#E63946',
+ 'brand-red': '#d4494c',    // from checkout price text
- 'brand-black': '#111827',
+ 'brand-black': '#202124',   // from all screenshot text
- 'brand-bg': '#F9FAFB',
+ 'brand-bg': '#f7f8f7',     // from all screenshot backgrounds
```

### Usage pattern
Always use Tailwind class names like `bg-brand-green`, `text-brand-black`, `bg-brand-bg`. Never hardcode hex values in components.

---

## 2. Typography

### Fonts

| Context | Font | CSS Variable |
|---------|------|-------------|
| LTR (English) | **Outfit** (300–800) | `var(--font-outfit)` |
| RTL (Arabic) | **Tajawal** (300–800) | `var(--font-tajawal)` |

Font switching happens automatically via `[dir='rtl']` / `[dir='ltr']` selectors in `globals.css`.

### Text Hierarchy

| Level | Classes | Example |
|-------|---------|---------|
| Page Title | `text-2xl font-bold text-brand-black` | "KoraLink" |
| Section Title | `text-base font-bold text-brand-black` | "Recent Activity" |
| Card Title | `text-base font-bold text-brand-black leading-tight` | Match title |
| Body | `text-sm text-gray-600` | Match description |
| Caption | `text-xs text-gray-400` | Location, time |
| Label | `text-[10px] font-bold text-brand-green uppercase tracking-widest` | Section labels |
| Price | `text-xl font-extrabold text-brand-black leading-none` | "SAR 37" |
| Badge | `text-[10px] font-bold uppercase tracking-wide` | Status badges |

### Arabic Typography Notes
- Tajawal is thicker at the same weight — reduce `font-bold` to `font-semibold` in Arabic where appropriate
- Arabic numbers use Hindi numerals (`٠١٢٣٤٥٦٧٨٩`) — display logic handled by locale
- Text alignment flips: `text-start`/`text-end` instead of `text-left`/`text-right`

---

## 3. Layout System

### MobileFrame (shell for every screen)

```tsx
<MobileFrame>
  <main className="flex-1 overflow-y-auto scroll-container bg-brand-bg">
    {/* page content */}
  </main>
  <BottomNav />
</MobileFrame>
```

**Rules:**
- `MobileFrame` is `max-w-md mx-auto w-full min-h-[100dvh]` — it simulates a phone screen
- ALL pages inside `(main)` route group use `MobileFrame` + `BottomNav` via `layout.tsx`
- Auth pages (`(auth)`) do NOT use `MobileFrame` or `BottomNav`
- Host page, match detail use `MobileFrame` directly (not via group layout)
- Content areas use `overflow-y-auto scroll-container` for smooth touch scrolling

### BottomNav

Fixed 5-tab bar: Feed (community), Clubs, Play (center FAB), Messages, Profile.

```tsx
// Center FAB pattern:
<Link href={`/${locale}/play`} className="flex flex-col items-center -mt-7 relative">
  <div className="w-16 h-16 rounded-full bg-brand-green flex items-center justify-center
    shadow-[0_4px_20px_rgba(27,67,50,0.4)] border-4 border-white">
    <Image src="/images/play-icon.png" width={32} height={32} className="brightness-0 invert" />
  </div>
  <span className="text-[10px] font-semibold mt-0.5 text-brand-green">Play</span>
</Link>
```

Active state: `text-brand-green` + `strokeWidth={2.5}`. Inactive: `text-gray-400` + `strokeWidth={1.5}`.

### TopAppBar

Used inline in `play/page.tsx` (not globally). Contains logo + notifications + search + "+" host button.

### Safe Areas

Always account for iPhone notch / home indicator:
- `pt-safe` — safe-area-inset-top
- `pb-safe` — safe-area-inset-bottom
- `ps-safe` / `pe-safe` — horizontal safe areas

---

## 4. Component Patterns

### Card Pattern (MatchCard, VenueCard, FeedCard)

```tsx
<div className="bg-white rounded-2xl shadow-card mx-4 mb-3 p-4
  transition-shadow hover:shadow-card-hover">
```

**Standard card structure:**
1. Header row: avatar + title + meta (time/status)
2. Body: key info (location, format, surface)
3. Footer: price + CTA button

### Form Input Pattern

```tsx
<div className="flex items-center gap-2 bg-gray-50 rounded-full px-4 py-2.5 border border-gray-100
  focus-within:border-brand-green transition-colors">
  <SomeIcon className="w-4 h-4 text-gray-400 flex-shrink-0" strokeWidth={2} />
  <input className="flex-1 text-sm text-brand-black placeholder:text-gray-300 outline-none bg-transparent" />
</div>
```

**Rules:**
- Rounded inputs: `rounded-full px-4 py-2.5`
- Background: `bg-gray-50 border border-gray-100`
- Focus: `focus-within:border-brand-green`
- Icons: always `flex-shrink-0` + `text-gray-400`
- Placeholder: `placeholder:text-gray-300`
- Disabled state: `bg-gray-100 text-gray-400 cursor-not-allowed`

### Pill/Toggle Pattern

```tsx
<div className="flex rounded-full border border-gray-200 overflow-hidden">
  <button className={`flex-1 py-2.5 text-xs font-semibold text-center transition-all
    ${active ? 'bg-brand-green text-white' : 'bg-white text-gray-500'}`}>
    Option
  </button>
</div>
```

### Bottom Sheet Pattern

```tsx
{/* Overlay */}
<div className="fixed inset-0 bg-black/50 z-50" onClick={onClose} />

{/* Sheet */}
<div className="fixed bottom-0 inset-x-0 max-w-md mx-auto bg-white rounded-t-3xl z-50
  max-h-[85vh] overflow-y-auto animate-slide-up">
  {/* Pull handle */}
  <div className="flex justify-center pt-3 pb-2">
    <div className="w-10 h-1 rounded-full bg-gray-300" />
  </div>
  {/* Content */}
</div>
```

### FAB (Floating Action Button)

```tsx
<button className="w-16 h-16 rounded-full bg-brand-green flex items-center justify-center
  shadow-[0_4px_20px_rgba(27,67,50,0.4)] border-4 border-white
  active:scale-95 transition-transform">
```

### CTA Button (Primary)

```tsx
<button className="w-full py-4 rounded-2xl bg-brand-green text-white text-sm font-bold
  flex items-center justify-center gap-2
  shadow-[0_4px_20px_rgba(27,67,50,0.4)]
  active:scale-[0.98] transition-transform">
  Action
</button>
```

### CTA Button (Disabled)

```tsx
<button disabled className="w-full py-4 rounded-2xl bg-gray-100 text-gray-400
  font-bold text-base cursor-not-allowed">
  Continue
</button>
```

---

## 5. RTL / LTR Patterns

### Logical Properties (MANDATORY)

Use Tailwind logical properties instead of directional ones:

| ❌ Do NOT use | ✅ Use instead |
|--------------|---------------|
| `ml-*` | `ms-*` (margin-inline-start) |
| `mr-*` | `me-*` (margin-inline-end) |
| `pl-*` | `ps-*` (padding-inline-start) |
| `pr-*` | `pe-*` (padding-inline-end) |
| `text-left` | `text-start` |
| `text-right` | `text-end` |
| `left-*` | `start-*` |
| `right-*` | `end-*` |
| `border-l-*` | `border-s-*` |
| `border-r-*` | `border-e-*` |
| `rounded-tl-*` | `rounded-ss-*` |

### Icon Flipping

Some icons should flip in RTL:
- ArrowLeft ↔ ArrowRight
- ChevronLeft ↔ ChevronRight
- Forward/Back navigation icons

Do NOT flip: checkmarks, search, plus, user, calendar, clock, map pins.

### Text and Numbers

```tsx
// Numbers stay LTR even in RTL context
<span dir="ltr" className="inline-block">SAR 37</span>
```

---

## 6. The 5 UX States (Required for EVERY screen)

### 1. Loading
```tsx
// Skeleton card pattern
<div className="bg-white rounded-2xl shadow-card mx-4 mb-3 p-4 animate-pulse">
  <div className="flex items-start gap-3">
    <div className="w-10 h-10 rounded-full bg-gray-200" />
    <div className="flex-1 space-y-2">
      <div className="h-4 bg-gray-200 rounded w-3/4" />
      <div className="h-3 bg-gray-100 rounded w-1/2" />
    </div>
  </div>
  <div className="flex justify-between items-end mt-4">
    <div className="h-6 bg-gray-200 rounded w-20" />
    <div className="h-9 bg-gray-200 rounded-full w-24" />
  </div>
</div>
```

### 2. Empty
```tsx
<div className="flex flex-col items-center justify-center py-20 px-8">
  <div className="w-20 h-20 rounded-full bg-gray-100 flex items-center justify-center mb-4">
    <Trophy className="w-10 h-10 text-gray-300" strokeWidth={1.5} />
  </div>
  <h3 className="text-lg font-bold text-brand-black mb-1">No matches yet</h3>
  <p className="text-sm text-gray-400 text-center mb-6">Be the first to host a match in your area!</p>
  <Link href={`/${locale}/host`} className="bg-brand-green text-white px-6 py-3 rounded-full text-sm font-bold">
    Host a Match
  </Link>
</div>
```

### 3. Error
```tsx
<div className="flex flex-col items-center justify-center py-20 px-8">
  <div className="w-16 h-16 rounded-full bg-brand-red/10 flex items-center justify-center mb-4">
    <AlertTriangle className="w-8 h-8 text-brand-red" strokeWidth={1.5} />
  </div>
  <h3 className="text-lg font-bold text-brand-black mb-1">Something went wrong</h3>
  <p className="text-sm text-gray-400 text-center mb-6">Couldn't load matches. Check your connection.</p>
  <button onClick={retry} className="bg-brand-green text-white px-6 py-3 rounded-full text-sm font-bold">
    Try Again
  </button>
</div>
```

### 4. Populated (Normal)
Normal content rendering — follow card/form patterns above.

### 5. Edge Cases
- **Form validation errors**: red border + inline error text below field
- **Network offline**: banner at top "You're offline — showing cached data"
- **Max length exceeded**: character counter + disabled submit
- **Already joined**: "You're In" badge instead of "Join" CTA
- **Full match**: grayed-out card + "FULL" badge
- **Past match**: "Completed" state with no join option
- **Own match**: "Your Match" badge instead of join button

---

## 7. i18n Requirements

### Translation File Structure

```json
// en.json
{
  "play": {
    "title": "KoraLink",
    "searchPlaceholder": "Where to play?",
    "discoveringMore": "Discovering More"
  }
}
```

```json
// ar.json
{
  "play": {
    "title": "كورالينك",
    "searchPlaceholder": "أين تريد اللعب؟",
    "discoveringMore": "اكتشاف المزيد"
  }
}
```

### Usage in Components

```tsx
import { useTranslations } from 'next-intl';

export default function PlayPage() {
  const t = useTranslations('play');
  return <h1>{t('title')}</h1>;
}
```

### Rules
- EVERY user-facing string needs keys in BOTH `ar.json` and `en.json`
- Nested keys by screen: `login.title`, `play.searchPlaceholder`
- No hardcoded English strings in components
- Use `useFormatter()` for dates and numbers (respects locale)

---

## 8. Form Validation Pattern (Zod + react-hook-form)

```tsx
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

const schema = z.object({
  phone: z.string().regex(/^5\d{8}$/, 'Enter a valid Saudi number').min(9),
  name: z.string().min(2, 'Name must be at least 2 characters'),
});

type FormData = z.infer<typeof schema>;

export function MyForm() {
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (data: FormData) => {
    // call API via fetcher
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <input {...register('phone')} />
      {errors.phone && <p className="text-xs text-brand-red mt-1">{errors.phone.message}</p>}
      <button type="submit" disabled={isSubmitting}>
        {isSubmitting ? <Loader2 className="animate-spin" /> : 'Submit'}
      </button>
    </form>
  );
}
```

---

## 9. API Data Fetching Pattern (TanStack React Query)

```tsx
// hooks/useMatches.ts
import { useQuery } from '@tanstack/react-query';
import { fetcher } from '@/lib/fetcher';
import type { Match } from '@/types';

export function useNearbyMatches(lat?: number, lng?: number) {
  return useQuery({
    queryKey: ['matches', 'nearby', lat, lng],
    queryFn: () => fetcher<Match[]>('/matches', {
      params: lat && lng ? { lat: String(lat), lng: String(lng) } : undefined,
    }),
    staleTime: 60_000,
  });
}
```

```tsx
// In component:
const { data: matches, isLoading, error, refetch } = useNearbyMatches(lat, lng);

if (isLoading) return <LoadingSkeleton />;
if (error) return <ErrorState onRetry={refetch} />;
if (!matches?.length) return <EmptyState />;
return matches.map(m => <MatchCard key={m.id} match={m} />);
```

**Rules:**
- Query key: `[resource, action, ...params]`
- Always handle `isLoading`, `error`, and empty states
- Use `staleTime: 60_000` for match data (cached 60s at API level)
- On mutation success, call `queryClient.invalidateQueries({ queryKey: ['matches'] })`

---

## 10. Animation Tokens

| Class | Use Case |
|-------|----------|
| `animate-slide-up` | Bottom sheets appearing |
| `animate-slide-in-bottom` | Sticky footer CTAs |
| `animate-fade-in-up` | Cards appearing in list |
| `animate-scale-in` | Badges, success indicators |
| `active:scale-95` | Button press feedback |
| `active:scale-[0.98]` | CTA button press |
| `transition-transform` | Pair with active:scale for smooth press |
| `transition-colors` | Hover color changes |
| `transition-shadow` | Card hover shadows |
| `animate-pulse` | Skeleton loading |
| `animate-spin` | Spinner (Loader2 icon) |

---

## 11. Icons (lucide-react)

All icons come from `lucide-react`. Standard props:

```tsx
<IconName className="w-5 h-5 text-gray-400" strokeWidth={1.5} />
```

| Stroke Width | Use Case |
|-------------|----------|
| `1.5` | Default — icons in lists, nav, cards |
| `2` | Emphasis — inputs, important actions |
| `2.5` | Active nav items, primary CTAs |

### Commonly Used Icons
`ArrowLeft`, `ArrowRight`, `Bell`, `Calendar`, `Camera`, `ChevronRight`, `Clock`, `CreditCard`, `Globe`, `Headphones`, `Info`, `Loader2`, `Lock`, `LogOut`, `MapPin`, `MessageSquare`, `Plus`, `Rss`, `Search`, `Share2`, `Shield`, `Sparkles`, `Star`, `Trophy`, `User`, `Users`, `Wallet`

---

## 12. Spacing Conventions

| Context | Padding/Margin |
|---------|---------------|
| Page horizontal padding | `px-4` or `px-5` |
| Card margin | `mx-4 mb-3` |
| Card internal padding | `p-4` |
| Section gap | `space-y-3` or `space-y-4` |
| Component gap | `gap-3` |
| Header to body spacing | `pt-5 pb-4` |
| Bottom sheet header | `px-5 pt-6 pb-3` |
| List item padding | `px-4 py-3.5` |
| FAB offset | `-mt-7` from nav bar |

---

## 13. Border Radius

| Element | Radius |
|---------|--------|
| Cards | `rounded-2xl` |
| CTAs | `rounded-2xl` |
| FAB | `rounded-full` |
| Inputs | `rounded-full` or `rounded-2xl` |
| Pills/Badges | `rounded-full` |
| Bottom sheets (top) | `rounded-t-3xl` |
| Toggles | `rounded-full` |
| Avatars | `rounded-full` |

---

## 14. Verification Checklist (Per Screen)

Before marking any screen complete, verify:

- [ ] Renders in both `ar` and `en` locales
- [ ] All 5 UX states handled (loading, empty, populated, error, edge)
- [ ] Uses logical properties (`ms-*`/`me-*` not `ml-*`/`mr-*`)
- [ ] All strings from i18n keys (both `ar.json` and `en.json` updated)
- [ ] API calls via `lib/fetcher.ts` with React Query
- [ ] Forms use Zod + react-hook-form
- [ ] Buttons have `active:scale-*` press feedback
- [ ] Safe area padding on relevant edges
- [ ] No hardcoded colors — all from Tailwind config
- [ ] Icons from lucide-react with consistent strokeWidth
- [ ] `use client` directive present (for interactive components)
- [ ] Numbers wrapped in `<span dir="ltr">` in Arabic mode
- [ ] Build passes: `npm run build` from `apps/player-pwa`

---

## 15. Screenshot Reference

Screenshots are stored at `.hermes-bootstrap/screenshots/` in the repo root.
These are the **design authority** — all UI work must match these exactly.

### Available Screenshots

| File | Size | Screen | Key Design Notes |
|------|------|--------|-----------------|
| `FD_Phone_Number.png` | 1594×1112 | Login — Phone Number | Light bg `#f7f8f7`, green button, rounded input with flag, "Enter your phone number" centered |
| `fo_KoraLink_Match.png` | 1418×1358 | Match Detail | Dark hero with stadium gradient, white card below with rounded top corners, "Join Match" green CTA at bottom |
| `Fo_Checkout_and.png` | 774×834 | Checkout / Payment Sheet | Bottom sheet pattern, green CTA `#254132`, red price `#d4494c`, wallet balance display |
| `Fo_User_Profile.png` | 1124×1038 | User Profile | White menu cards, avatar + name at top, wallet balance, sign out in red |
| `D_Main_nav.png` | 778×284 | Main Navigation (wireframe) | 5-tab bottom nav with center FAB, dark surface `#202124` |

### How to Use Screenshots

1. **Before building any screen**, open the corresponding screenshot
2. **Extract exact colors** — use the values in Section 1 above (already sampled)
3. **Match spacing** — measure padding/margin ratios relative to screen width
4. **Match typography** — compare font sizes, weights, and alignment
5. **Match component shape** — border radius, shadows, icon sizes
6. **All 5 UX states must match screenshot quality** — not just "functional"

## Layout invariants (session-proven regressions — never violate)

- **TeamLineup**: FULL per-side slots; teams ALWAYS side-by-side flex — never cap slots or stack large formats (caused the 52c85bc regression).
- **iOS PWA**: `apple-mobile-web-app-capable` + `status-bar-style` meta directly in layout JSX; `--app-height=100dvh` via `@supports` (not 100vh); top bars `pt-[var(--top-safe-inset)]`, bottom nav `pb-safe`. Reinstall PWA after changes to these metas.
