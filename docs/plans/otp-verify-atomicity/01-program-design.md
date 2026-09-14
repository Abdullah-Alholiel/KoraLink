# OTP Verify Atomicity — Gate 1-3 Compact (run #53)

## Problem
Two IMPORTANT security findings (Reviewer A, run #53):
1. **Timing side-channel** — `users.service.ts` phone-change verify compares the OTP with plain `!==` while every other flow uses constant-time `otpMatches`.
2. **Verify TOCTOU** — all three OTP verify paths (login, email, phone-change) do get → compare → delete. Two concurrent verifies of the same code both pass before either delete lands → double token mint / double phone flip.

## User story
As a player, my OTP works exactly once: a second concurrent use of the same code must fail; a wrong guess must never leak how close it was.

## Scope
IN: one shared `verifyMutex` in `OtpStoreService`; per-phone verify locks; new `claimChangeOtp`/`consumeChangeOtp` (change-namespace claim-and-consume); all three verify paths route through the lock; `otpMatches` used everywhere.
OUT: Redis GETDEL/SET NX atomicity upgrade (deferred until Redis actually backs the cache — current in-memory store is per-instance), waitlist promotion fairness (boarded separately), wallet `/pay` server-side validation (P0-2 money-path decision needed first).

## Shared mutex (the root fix)
`OtpStoreService` gets `private readonly verifyMutex: Map<string, Promise<unknown>>`. Public API:
- `runExclusive<T>(key: string, fn: () => Promise<T>): Promise<T>` — per-key chain mutex, releases in `finally`, log-and-release on chain rejection.
- `claimChangeOtp(phone)` → `runExclusive('change:' + phone, ...)` claim-and-delete; `consumeChangeOtp(phone)` same under the same lock (mutating DB before release).
- `withVerifyLock(key, fn)` — full verify path under one lock; compare-then-delete inside → atomic claim-or-fail, retries still see the code.

## Gate 3 contract
```ts
// otp-store.service.ts
runExclusive<T>(key: string, fn: () => Promise<T>): Promise<T>
withVerifyLock<T>(key: string, fn: () => Promise<T>): Promise<T>  // runExclusive('verify:'+key)
claimChangeOtp(phone: string): Promise<string | undefined>        // claim + delete inside lock
consumeChangeOtp(phone: string, fn: () => Promise<unknown>): Promise<void> // hold lock across DB mutation
```
Auth flow (login): lock 'verify:<phone>' → check fails < 5 → claim → miss → 401 + incrementFail inside lock → hit → delete + resetFails inside lock → release → user lookup/mint (outside).
Email flow: same shape, key includes lower(email) namespace.
Change flow: actor gates → claimChangeOtp → miss → lockout check → incrementFail → 401 → hit → consumeChangeOtp(tx) → delete+resetFails inside → release → activity write outside.

## Files changed
| File | Change |
|---|---|
| apps/api/src/modules/auth/otp-store.service.ts | +verifyMutex Map, +runExclusive, +withVerifyLock, +claimChangeOtp, +consumeChangeOtp |
| apps/api/src/modules/auth/auth.service.ts | verifyOtp body inside withVerifyLock; delete before mint |
| apps/api/src/modules/auth/email-otp.service.ts | verifyEmailOtp body inside withVerifyLock; delete before insert |
| apps/api/src/modules/users/users.service.ts | verifyPhoneChange: claim/consume + otpMatches (kills the `!==`) |
| apps/api/src/modules/auth/otp-store.service.spec.ts | +8 cases: mutex atomicity, chain isolation, claim/consume |
| apps/api/src/modules/auth/auth.service.spec.ts | mocks + assertion updates |
| apps/api/src/modules/users/users.phone-change.spec.ts | claim/consume mocks + one new double-spend spec |

## Gate 3 checklist
- [x] No DTO/JSON contract change — internal service refactors only; endpoint shapes identical
- [x] Every verify path uses otpMatches (constant-time) after this slice
- [x] Double-spend closed at the root for all three flows
- [x] Typo-retry UX preserved (claim-or-fail under lock, delete only on match)
- [x] Locks release in finally; a throwing fn cannot poison later verifies
- [x] i18n: none (no user-facing strings changed)
