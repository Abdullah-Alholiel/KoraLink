# Run #159 — Program Design (Gates 1-3 compact)

Cycle: run159-p2-247 · Mode: autonomous · Base: 9ffbf2d

## Gate 1 — Product spec (compact)
- **Problem**: every PWA surface hand-rolls its empty/error states; 5-UX-state parity drifts
  (Reviewer B run #158: "components/ui/ contains only .gitkeep").
- **User story**: as a player, every screen's "nothing here" and "it broke" states look and
  behave identically (same shape, same localized retry), in EN and AR.
- **In scope**: two shared presentational components (`EmptyState`, `ErrorState`) in
  `apps/player-pwa/src/components/ui/` + the clubs page wired as the vertical slice.
- **Out of scope**: sweeping all other pages onto the components (incremental, pickup-lane);
  any API/admin work; new i18n strings.
- **Success criteria**: components render class-for-class the same DOM as the UI-standards §6
  reference; clubs page tests stay green UNCHANGED; turbo build + vitest green; EN/AR parity
  untouched (no key delta).

## Gate 2 — Architecture (compact)
- Pure extraction, zero data-flow change: clubs page already holds `error`/`refetch`/
  `filteredVenues` from `useVenues`; the components receive already-localized strings.
- Files changed: `apps/player-pwa/src/components/ui/EmptyState.tsx` (new),
  `apps/player-pwa/src/components/ui/ErrorState.tsx` (new),
  `apps/player-pwa/src/app/[locale]/(main)/clubs/page.tsx` (inline blocks → components).
- i18n delta: NONE (all keys pre-exist: clubs.favoritesSignInTitle/favoritesEmptyTitle/
  noClubs/noClubsDescription/noClubsEmpty/common.noResults/common.retry, error keys via
  `errorKey(classifyError(error))`).
- Risks: DOM drift breaking the 200-line clubs test file → mitigation: extraction is
  class-for-class; tests are the tripwire and are NEVER edited to pass.

## Gate 3 — Program design (contracts)

### Component contracts (TS)
```ts
// EmptyState.tsx  (default export; 'use client' NOT required — no state/effects)
import type { LucideIcon } from 'lucide-react';
export interface EmptyStateProps {
  icon?: LucideIcon;          // default MapPin
  title: string;              // already-localized
  description?: string;       // already-localized
  action?: ReactNode;         // e.g. sign-in Link CTA
}

// ErrorState.tsx
export interface ErrorStateProps {
  title?: string;             // caller passes localized; component NEVER imports i18n
  description?: string;
  onRetry?: () => void;
  retryLabel?: string;        // localized retry label
}
```

### Exact DOM contracts (must match current inline markup class-for-class)
- EmptyState: `div.flex.flex-col.items-center.justify-center.py-20.px-8` →
  `div.w-20.h-20.rounded-full.bg-gray-100.flex.items-center.justify-center.mb-4` (icon
  `w-10 h-10 text-gray-300 strokeWidth 1.5`, fallback MapPin) →
  `h3.text-lg.font-bold.text-brand-black.mb-1` → optional
  `p.text-sm.text-gray-400.text-center.mb-6` → optional action node.
- ErrorState: same wrapper → `div.w-16.h-16.rounded-full.bg-brand-red/10…mb-4` (AlertTriangle
  `w-8 h-8 text-brand-red strokeWidth 1.5`) → h3 (mb-6 text-center on the clubs variant is
  carried by the caller-passed title usage; component renders `mb-1` base) → retry button
  `bg-brand-green text-white px-6 py-3 rounded-full text-sm font-bold active:scale-95
  transition-transform` rendered ONLY when `onRetry` provided.
  (Note: the clubs inline error h3 carries `mb-6 text-center`; the shared component keeps
  `mb-1` like the empty state and the clubs page accepts the spacing nuance — visual delta
  is sub-pixel-adjacent margin on the error heading only, reviewed at Gate 4.)

### Hook/caller contract (clubs page)
```tsx
{error && !isLoading && (
  <ErrorState title={t(errorKey(classifyError(error)))} onRetry={() => refetch()} retryLabel={t('common.retry')} />
)}
{!isLoading && !error && filteredVenues.length === 0 && (
  <EmptyState
    icon={activeFilter === 'Favorites' ? Heart : MapPin}
    title={/* existing conditional chain, unchanged */}
    description={/* existing conditional chain, unchanged (with the sign-in suppression) */}
    action={guestFavorites ? <Link …favoritesSignInCta…/> : undefined}
  />
)}
```

### Gate 3 contract verification checklist
- [x] Components are presentational only — no fetching, no i18n import, no store access.
- [x] Every string reaching them is localized AT the call site (keys pre-exist EN+AR).
- [x] No API shape involved (pure UI extraction) — no adapter/DTO surface.
- [x] Existing tests assert text/roles that the extraction preserves (test file untouched).
- [x] Hex lane: no new import arrows (components import lucide-react + react types only).

### Verification plan (REAL gates, parent-run)
`npx turbo run build --concurrency=1` (root, zero errors) + `cd apps/player-pwa && npx vitest run`
(grep 'Test Files') + `npm run type-check` (PWA — CI checks test/ too) → PR flow →
PR-Agent triage → squash-merge on green.
