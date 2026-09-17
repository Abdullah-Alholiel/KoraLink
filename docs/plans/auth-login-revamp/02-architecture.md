# Auth Login Revamp — Gate 2 Architecture + Gate 3 Program Design (compact, 2026-09-17)

Scope note: only the two P0 defect fixes proceed to Gate 4 now (Abdullah away at
clarify-timeout; defects, not design). The channel-affordance stance (mockups
`sketches/005-auth-login-revamp/variants.png`) is APPROVAL-PENDING — a follow-up
slice once Abdullah picks A/B/C; it touches only `login/page.tsx` + i18n keys and
does NOT interact with the fixes below except sharing the file.

## Architecture (data flow after fix)

```
verify(page) ── verify-otp/email verify (responseToken:true) ──► { isNewUser, token? }
   │ setAuthToken(token)                     (session exists: cookie dev / Bearer prod)
   ├─ GET /users/me                          (authenticated)
   ├─ useAppStore.login(profile, '')         ◄── THE FIX: store populated BEFORE any navigation
   ├─ isNewUser? → /complete-profile         (AuthGuard now passes; updateUser works — user non-null)
   └─ else      → /play
complete-profile PATCH → { user row } → updateUser(merge) | login(fallback if store empty)
```

## Files changed

| File | Change |
|------|--------|
| `apps/player-pwa/src/app/[locale]/(auth)/verify/page.tsx` | Unified `onSuccess`: profile fetch + `login()` BEFORE the isNewUser branch; draft self-heal for missing `?phone/?email` params (effect-hydrated, SSR-safe); redirect to /login when no identifier exists at all |
| `apps/player-pwa/src/hooks/useAuth.ts` | `useCompleteProfile.onSuccess`: `login(responseRow)` fallback when the store user is null (a partial `updateUser` promote would be type-unsound — rejected; the null case is eliminated upstream by the verify-page fix, this is defense-in-depth with the FULL response row); derive `locale` from URL (was hardcoded `'ar'`) |
| `apps/player-pwa/src/lib/auth-flow.ts` | sessionStorage → **localStorage** (survives iOS tab discard while reading the OTP); cleared on verified success / moderation block / BlockedCard sign-out (unchanged call sites) |
| `apps/player-pwa/src/messages/{en,ar}.json` | + `login.titleEmail` (channel-conditional title; stance-independent) |
| `apps/player-pwa/src/app/[locale]/(auth)/login/page.tsx` | email mode renders `login.titleEmail` instead of the phone title |

## Gate 3 — contracts (exact shapes)

1. `POST /auth/verify-otp` / `POST /auth/email/verify-otp` (responseToken:true) →
   `{"isNewUser": boolean, "token"?: string}` — UNCHANGED (verified in
   auth.controller.ts:109 + email-auth.controller.ts:99). No API change.
2. `GET /users/me` → `UserProfileApi` (snake_case row) — UNCHANGED.
3. `PATCH /auth/complete-profile` → complete user row — UNCHANGED.
4. TS: `useAppStore.getState().login(user: User, token: string)` — called with `''`
   (token already persisted via `setAuthToken`; store token is not the session carrier).
5. auth-flow storage keys UNCHANGED (`koralink_auth_channel/_email_draft/_phone_draft`)
   — only the storage backend moves. `clearAuthFlow()` semantics unchanged.
6. i18n contract: `login.titleEmail` = "Enter your email address" /
   "أدخل بريدك الإلكتروني" — added to BOTH locales.

## Contract verification checklist (Gate 3 exit)

- [✓] Verify response shapes unchanged — controller code read, both channels return
      `{ isNewUser }` / `{ isNewUser, token }`; frontend types already match.
- [✓] No field silently undefined: `login()` payload built from `UserProfileApi` with
      `?? ''` fallbacks — same mapping as the proven returning-user path.
- [✓] Adapter: none new (store maps profile inline; pattern identical to AuthBootstrap).
- [✓] i18n keys exist in both locales before the component references them (added in
      the same commit; grep-verified post-edit).
- [✓] Auth-flow consumers audited: login page (hydrate/write), verify page (clear on
      success + block), BlockedCard sign-out — all call sites behave identically under
      the new storage backend.
