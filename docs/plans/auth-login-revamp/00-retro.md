# Auth Login Revamp — Gate 0 Retrospective (2026-09-17)

Off-schedule fire (Abdullah, direct request). Baseline: run #57 released (2c71671),
staging @ c6e1a16. This cycle does NOT touch admin/ops surfaces — admin-state check N/A.

## Recent auth-flow commit train (what we keep re-touching)

| Commit | What | Class |
|--------|------|-------|
| 1c5214a | email channel + channel-aware verify | feat |
| a36a6e5 | resend cooldown 30→60s | fix |
| 1253e8a | login double-send guard + OTP UX tests | fix |
| c96653b | back arrow → language toggle | fix |
| 242c9ca | locale applies app-wide; dead-tap login header | fix |
| 558846e (PR #25) | channel + drafts survive reloads (sessionStorage) | fix |

fix:feat ratio in the auth area ≈ 5:1 — reactive loop. Root pattern: the flow's
state and channel UX were built incrementally around a phone-only core, and every
new surface (email, locale, verify round-trip) exposed another assumption.

## Findings

### F1 — CRITICAL: new-user signup requires a SECOND OTP (both channels)
Cascade (all verified in code today):
1. `verify/page.tsx` `onSuccess`: `isNewUser → router.push(complete-profile)` and
   **returns without populating the auth store** (only the returning-user branch
   calls `login()`). The verify response DOES carry a session token
   (`responseToken:true` on both channels) — the session exists, the store doesn't.
2. `complete-profile` → `useCompleteProfile.onSuccess` calls `updateUser(...)`.
   `AuthSlice.updateUser` (slices.ts:42) **no-ops when `user` is null**
   (`state.user ? {...} : null`). New user ⇒ store user was never set ⇒ no-op.
3. `isAuthenticated` stays `false` → `(main)/layout.tsx` AuthGuard
   `router.replace('/login')` → user lands back on login, must request OTP #2.
4. Also poisons the cold-reload case ON complete-profile itself: a reload there
   re-renders the form fine ((auth) group has no AuthGuard), but nothing tells the
   app the user is signed in; any authed probe relies on cookie/Bearer only.
This is the same class as the `zustand-auth-population` cascade (skill §7) —
the returning-user path was fixed in that cycle; the NEW-user path was missed.

### F2 — CRITICAL: "back from OTP clears the field" is NOT fixed on real devices
PR #25 persists channel+drafts in **sessionStorage**. On iOS the PWA's background
tab is commonly discarded while the user reads the OTP SMS/email ("go read the
code, come back") → sessionStorage dies with the discarded tab → user returns to
an empty phone-mode form. Desktop/dev (tab kept alive) always passes, which is why
it keeps "passing tests" and still failing for Abdullah. Fix: localStorage
(survives tab discard + SW activation reloads + locale-toggle reload), still
cleared on successful verify / moderation block / sign-out.

### F3 — IMPORTANT: channel switch affordance is invisible
"Continue with email instead" is a tiny muted footer text-link below the legal row —
below the fold threshold on small phones and reads as legal fine print, not as an
alternative login method. Also the phone/email inputs swap with no animation and
no state hint (which channel am I on?). Needs a real designed control (Gate 1/2).

### F4 — MINOR: verify "Contact support" is dead UI
`verify/page.tsx:419` — `<span>` styled as a link with no handler (dead-UI rule).
Candidate to fold into this cycle (cheap) or park on the board.

## Tech-debt notes carried forward
- `useCompleteProfile` hardcodes `locale: 'ar'` in its updateUser payload
  (pre-dates the locale-seam rules); fold into F1 fix (derive from URL like
  AuthBootstrap does).
- Auth-flow tests live in 3 files (auth-flow-persistence, verify-otp-ux,
  login-language-toggle); the F1 regression was never covered by ANY of them —
  add a store-level integration test (verify isNewUser → store authenticated).

## Decision
Proceed to Gate 1. F1+F2 are correctness bugs on the primary funnel (signup) —
they justify an off-schedule cycle rather than waiting for the next 5h loop fire.
