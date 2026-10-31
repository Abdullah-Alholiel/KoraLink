# Run #80 — Program Design (P2-101 a11y batch + reviewer minors)

Single feature PR, PWA-only. Layer rotation lane: PWA screens.

## Problem
First screen + money + roster surfaces carry unlabeled icon-only controls (screen-reader users get
"button" with no name), a11y strings are partially hardcoded English (Arabic screen readers hear English),
a dead component carries 3 hardcoded strings, and one component runs a private SSR-unsafe clock.

## Scope (IN)
1. **Feed `(main)/page.tsx`**: aria-labels on scroll-to-top pill + retry button (`home.*` + `common.scrollToTop` keys).
2. **Wallet top-up modal X**: aria-label (`wallet.closeModal`).
3. **aria-label i18n**: Toast dismiss → `common.dismiss`; Attendance/MatchRules/Appeal sheets close → `common.close`
   (Attendance + Appeal keep their ns hooks and read the root via a second `useTranslations()` call;
   MatchRules already has a root `t`).
4. **my-games error state**: add `common.errorDescription` line (messages-page pattern).
5. **Dead code**: delete `TopAppBar.tsx` (zero imports — verified grep src/ + test/).
6. **PostMatchSection**: swap private `useNow` for shared `@/hooks/useNow` (`number | null`),
   pre-mount `timeLeft = null` (deadline-not-yet-elapsed posture per hook contract).
7. **i18n keys** EN+AR: 4 NEW leaf keys (`common.scrollToTop`, `home.retry`, `home.errorDescription`,
   `wallet.closeModal`) — parity 989→993 both files.

## Scope (OUT)
- RestoreAccountBanner (client-state-gated; convention note only — reviewer classified MINOR/latent).
- P2-103 CSP, P2-111 chat predicate, admin surfaces.

## Contracts (unchanged API surface; UI-only)
- No API changes, no schema changes, no new hook exports.

## Gates
- `npx turbo run build --concurrency=1` (3/3)
- `npx vitest run` (752 baseline + new cases)
- api jest 692 (untouched surfaces)
- `npx tsc --noEmit` (PWA) 0
- i18n parity test green (test/i18n.test.ts enforces EN=AR parity)
- `npm run type-check` (PWA — next build does not type-check test/)
