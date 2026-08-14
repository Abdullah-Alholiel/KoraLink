# Gate 0 — Retrospective: PWA UI/UX Standardization

## Context

7 remote commits from VPS Hermes are ahead of local HEAD. Local changes include
real-time match lifecycle WebSocket integration (Cycle 2). Before proceeding to
the next development cycle, we must:

1. **Merge remote safely** — resolve 6 conflicting files without losing work.
2. **Fix critical PWA layout defects** — safe-area violations, floating CTA overlaps,
   overflow/rubber-banding, and inconsistent bottom padding across all screens.

---

## Root Cause Analysis

### A. Merge Conflicts (6 files)

| File | Remote Changed | Local Changed | Overlap | Strategy |
|------|---------------|---------------|---------|----------|
| `app.gateway.ts` | CORS validation, auth from cookies, broadcast helpers | Added `broadcastPomDecided` | Additive, different areas | Auto-merge |
| `PostMatchSection.tsx` | POTM status cards + `PomVotingSheet` | Full 6-state POTM lifecycle | Same component body | Keep local (superset) |
| `useMatches.ts` | Filter expansion, dual response, `booking_mode` schema | Socket listeners, `useMarkNoShow` | Same hooks, different logic | Manual merge both |
| `ChatSheet.test.tsx` | Updated mocks for `useMatchChat` | Added 6 unit tests (CS-1–CS-6) | Same test file | Manual merge both |
| `MatchCard.test.tsx` | Tests for organizer, price, routing | Tests for status badges, spot counter | Additive test cases | Auto-merge |
| `useMatches.test.tsx` | Filter param tests, wrapped response | `booking_mode` payload, empty ID guard | Same describe blocks | Manual merge both |
| `package-lock.json` | Dep updates | Dep updates | Hash conflicts | Regenerate from remote |

### B. PWA Layout Defects (Audit Summary)

| Severity | Issue | Affected Files | Root Cause |
|----------|-------|---------------|------------|
| **Critical** | Floating CTA buttons hidden under BottomNav on mobile | `match/[id]/page.tsx`, `clubs/[id]/page.tsx` | `fixed bottom-20` (80px) < BottomNav height with safe-area (~90px) |
| **Critical** | White overscroll edges when user drags PWA boundaries | All screens | Missing `overscroll-behavior: contain` on scroll containers |
| **High** | Toast notification collides with iPhone Notch/Dynamic Island | `Toast.tsx` | `fixed top-6` without safe-area-inset-top |
| **High** | 15 bottom sheets missing `pb-safe` — buttons touch home indicator | All Sheet components | Hardcoded `pb-6`/`pb-8` without `env(safe-area-inset-bottom)` |
| **Medium** | `CostFooter` (Host page) CTA touches bottom edge | `CostFooter.tsx` | `pb-5` without `pb-safe` |
| **Medium** | Inconsistent page bottom padding (`pb-4` to `pb-28`) | play, profile, my-games, messages | No standardized padding convention |
| **Low** | `<a>` tags instead of `<Link>` causing full page reloads | `my-games/page.tsx` | Already fixed locally |

### C. New Remote Files to Adopt

- `apps/player-pwa/src/app/[locale]/privacy/page.tsx`
- `apps/player-pwa/src/app/[locale]/terms/page.tsx`
- `apps/player-pwa/src/components/auth/AuthGuard.tsx`
- `apps/player-pwa/src/lib/uuid.ts`
- `apps/player-pwa/src/providers/ObservabilityProvider.tsx`

---

## Decision Log

| # | Decision | Rationale |
|---|----------|-----------|
| 1 | Stash → pull → pop → resolve | Safest merge path; preserves both codebases |
| 2 | Regenerate `package-lock.json` from remote | Lockfile merges always conflict; `npm install` resolves |
| 3 | Adopt Apple HIG safe-area conventions | `env(safe-area-inset-*)` with Tailwind `pb-safe`/`pt-safe` |
| 4 | Standardize floating CTAs with `calc()` offsets | `bottom-[calc(4.5rem+env(safe-area-inset-bottom))]` |
| 5 | Add `overscroll-behavior: contain` to scroll containers | Prevents white edge drag on PWA |
| 6 | Normalize page bottom padding to `pb-6` | Flex layout makes excessive padding unnecessary |
