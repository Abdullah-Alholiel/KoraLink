# Auth Login Revamp — Gate 1 Product Spec (2026-09-17)

## Problem Statement (Abdullah's report, 2026-09-17)
1. "The login screen's 'use email or phone' text/link is not well shown" — the
   alternative-login affordance is buried as muted fine print at the bottom.
2. "After entering the OTP when signing up, the user has to log in AGAIN with a
   second OTP instead of being logged straight in." (Both email and phone signup.)
3. "Returning from the OTP (to read the SMS/email) and hitting back — the
   email/phone field is cleared, so small edits are impossible."

## User Stories

| # | Pri | Story | Acceptance |
|---|-----|-------|------------|
| US-1 | P0 | As a NEW user who just verified the OTP, I am signed in and land on complete-profile **without any second code** | verify(isNewUser) → auth store authenticated BEFORE navigation; AuthGuard lets complete-profile successor pages through; zero extra OTP on the signup path (phone AND email channels) |
| US-2 | P0 | As a user who leaves the app to read my OTP and comes back, my typed phone/email is still in the field | Draft survives full tab discard/reload (localStorage, not sessionStorage); back from verify shows my input for editing |
| US-3 | P1 | As a new visitor, I can clearly see I can sign in with EITHER phone OR email | Designed channel affordance (variant chosen at Gate 2) — visible without scrolling on 390×844, EN+AR parity, ≥44pt target |
| US-4 | P2 | As an Arabic-first user, everything above works RTL with natural Arabic copy | Both locales, Tajawal, logical properties, Hindi-digit OTP entry unaffected |

## Scope
**IN:** PWA auth surfaces only — `(auth)/login`, `(auth)/verify`, `(auth)/complete-profile`,
`lib/auth-flow.ts`, `hooks/useAuth.ts` (store population), auth i18n keys, sketches + gate docs.
(Revision 2026-09-17, Gate 2: `store/slices.ts` REMOVED from scope — the null-user case is
eliminated upstream by populating the store in the verify page; no updateUser semantic change.)
**OUT:** API changes (verify-otp already returns token+isNewUser correctly on both
channels; complete-profile contract unchanged). Admin console. Ops surface. Landing pages.
DevLoginBar (dev-only). Push/observerability changes (Sentry breadcrumbs already exist
in the fetcher; no new providers).

## Success Criteria (verifiable)
1. `turbo run build` zero errors; all vitest suites green (incl. new tests).
2. New store-level integration test: verify-otp success with `isNewUser:true` →
   `useAppStore` has `isAuthenticated === true` and a populated user (regression pin for US-1).
3. New test: drafts persist across a `sessionStorage.clear()` + remount (US-2 — proves
   the storage tier, since jsdom cannot simulate iOS tab discard).
4. New test/pattern guard: channel affordance present above-the-fold in both locales (US-3).
5. E2E probe on :3000 staging — signup path via dev OTP: verify → complete-profile →
   /play with NO second code request (server journal shows a single send-otp per signup).
6. updateORcreate: no sessionStorage usage left for auth-flow drafts (grep-proof).

## Open Questions → Gate 2
- Q1: Which channel affordance stance? (3 variants being sketched; Abdullah picks.)
- Q2: Should complete-profile become skippable ("later") — NOT in this cycle's scope;
  noted for the board only.
- Q3: Verify-screen identifier pill currently comes from query params (?phone/?email).
  With drafts in localStorage the verify screen can self-heal a missing param from the
  draft — include (cheap, fixes deep-link/back-from-discarded-tab edge) — default YES.

## Risks
- localStorage persistence = drafts may survive longer than the flow (mitigated: cleared
  on verified success, on moderation block, on BlockedCard sign-out; leftover draft on
  next visit is a FEATURE — "resume where you left off" — not a leak; it's the user's own
  device).
- Changing `updateUser` semantics — keep the null-guard fix INSIDE useCompleteProfile's
  path (call login when store empty), and additionally make updateUser promote
  null→populated (defensive for every future caller).
- Multi-agent tree: stage only our paths; foreign in-flight changes exist (admin
  components, worker/index.js, kanban) — never `git add -A`.
