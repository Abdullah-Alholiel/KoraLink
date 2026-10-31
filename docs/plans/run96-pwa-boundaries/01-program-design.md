# Run #96 — Gates 1-3 Compact (P2-138 re-scoped: per-surface isolation + route loading skeletons)

## Problem (Gate 1)
A render crash inside any (main) surface unmounts the ENTIRE app chrome (BottomNav/Toast) because
the single ErrorBoundary in (main)/layout.tsx wraps everything. Slow route navigations show no
surface-specific skeleton (only the root spinner). ErrorBoundary fallback copy is hardcoded English.
Success criteria: crash in one surface keeps chrome + shows localized retry scoped to the content
area; each heavy route renders its own skeleton while its RSC loads; i18n parity holds; all gates green.

## Scope
IN: 7 route `loading.tsx` skeletons (play, wallet, messages, my-games, clubs, profile, match/[id]);
2 route-level `error.tsx` ((main), match/[id]) using the house `errorKey(classifyError(error))`
pattern (error-copy-standard.test.ts rule 1 BANS `t('common.error')` under src/app); layout.tsx
surface-boundary rewiring; ErrorBoundary i18n + `compact` mode; hex fix match/[id]:955;
2 structure tests; i18n keys EN+AR.
OUT: match/[id] aria sweep (board note), P2-133-class staleness work, admin areas.

## Architecture (Gate 2)
- `SurfaceBoundary` = ErrorBoundary with `variant="surface"`: fallback mirrors ScrollableMain's
  outer box (flex-1, scroll-container, bg-brand-bg) so BottomNav/Toast survive; localized copy.
- `(main)/error.tsx` + `match/[id]/error.tsx`: 'use client', captureError + reset + localized
  routeError.* copy; never `t('common.error')`.
- loading.tsx: server components (no directive) — static skeleton divs mirroring each page's layout
  (cards / list rows / hero+sheet), `role="status"` + aria-label common.loading.

## Contracts (Gate 3 — exact shapes)
- ErrorBoundary props AFTER: `{ children; fallback?: ReactNode; variant?: 'page' | 'surface';
  titleKey?: string; descriptionKey?: string; retryKey?: string }` — defaults preserve current
  behavior exactly (English copy, min-h-dvh center); `variant="surface"` swaps the wrapper box to
  content-area form. Layout uses variant="surface" with localized keys (routeError.title /
  routeError.description / common.retry).
- i18n additions (both locales, leaf-key count 1008 → 1010): `routeError.title`
  (en "Something went wrong" / ar "حدث خطأ ما"), `routeError.description`
  (en "This section couldn't load. The rest of the app still works." /
  ar "تعذّر تحميل هذا القسم. باقي التطبيق يعمل بشكل طبيعي."). Reused existing: common.retry,
  common.loading, errorKey(classifyError(error)) (errors.* ns).
- Structure tests (vitest): route-boundaries.test.ts (7 loading.tsx exist under the exact routes,
  each contains role="status"; (main)/error.tsx + match/[id]/error.tsx exist, contain reset usage,
  and contain NO `t('common.error')`); boundary-copy-i18n.test.ts (ErrorBoundary.tsx contains no
  hardcoded 'Something went wrong'/'Try Again' literals, has titleKey/descriptionKey props).
- Checklist: [x] every touched surface keeps 5 UX states (skeleton adds surface-level loading;
  in-page fetch states untouched) [x] adapters unaffected (zero API shape changes) [x] i18n keys
  both locales [x] fallback renders inside ScrollableMain's slot → chrome preserved.

## Verification gates (parent, post-merge — the authoritative tree)
vitest run ('Test Files' grep) + pwa tsc --noEmit + `npx turbo run build --concurrency=1` 3/3
+ jest api (tripwire edit) + turbo build in shared tree. Lane gates: vitest + tsc (symlinked
node_modules makes lane webpack builds unreliable — proven run #92; CI + parent own the build).
