# Run #214 — Program Design (auth/wallet UX states lane)

Items: **P2-378** (verify page offline state + useLocale fix — zeroshot lane) ·
**P2-379** (topup callback offline branch + code-first failure mapping — parent).

## Problem / user stories
- A player verifying an OTP (or returning from a Moyasar 3DS redirect) on a flaky connection
  sees either a generic error after a long timeout (verify) or an unbounded spinner
  (callback) — no immediate "you're offline" affordance, no honest retry path on the money
  return surface. (P2-378 P0-class, P2-379 P1 — Reviewer B #213, re-confirmed by Reviewer B #214.)
- A charged-but-declined player must see money-truthful copy even if the API's message wording
  changes — classification must key on the STABLE machine `code`, never English text.

## Scope
IN: verify page useLocale + offline state + tripwire; topup callback offline branch +
code-first mapping; API: stable `code` bodies on the wallet.topup.service verify-reject throws;
i18n keys EN+AR; unit/spec pins for every mapping.
OUT: host dashboard states (P2-381, separate row); PWA/`lib/error-classify.ts` changes;
new API endpoints; schema/migrations (none — coded bodies are response-shape only).

## Architecture delta
- API `wallet.topup.service.ts`: 5 `ConflictException` verify-reject throws switch from
  message-string to `{ message, code }` body (PR #262 P2-373 precedent — `getResponse().code`
  rides the JSON body; fetcher hoists it to `FetchError.code`). Message text UNCHANGED (the
  `code:` prefix stays in the message so log-greps and the message-prefix fallback keep
  working — deploy-skew tolerance).
- PWA `topup-callback-messages.ts`: matcher prefers `err.code` (exact match against the code
  constants), falls back to the legacy message-prefix match (stale-bundle/deploy-skew
  tolerance), then generic. Pure module, no new imports.
- PWA callback page: `useOnlineStatus()`; offline while verifying → offline failed state
  (phase 'failed' + `wallet.topup.callbackOffline`, retry affordance = remount verify via a
  `verifyNonce` state bump); offline at mount (offline || no ids) → same state without firing
  the verify mutation; success/failed render paths unchanged. Back-to-wallet button gains a
  localized aria-label (a11y).
- Verify page (lane): useLocale() replaces pathname-split; `useOnlineStatus()` +
  OfflineBanner (plain) + offline early-return guard on verify/resend; new keys
  `verify.offlineNotice`.

## Exact contracts (Gate 3)
### API — response body codes (NEW, additive)
| throw | code |
|---|---|
| payment_intent_mismatch 409 | `payment_intent_mismatch` |
| payment_not_paid 409 | `payment_not_paid` |
| currency_mismatch 409 | `currency_mismatch` |
| amount_mismatch 409 | `amount_mismatch` |
| topup_already_credited 409 | `topup_already_credited` |
Body shape: `{ message: '<unchanged text>', code: '<table value>' }`. HTTP status unchanged.
### PWA — `topupCallbackMessageKey(err: unknown): string` (signature unchanged)
`code` exact match → key; else message-prefix match → key; else `wallet.topup.callbackRetry`.
### PWA — callback page phases
`'verifying' | 'success' | 'failed'` (unchanged); offline resolves to `failed` with
`failedKey='wallet.topup.callbackOffline'` + a visible retry button that bumps `verifyNonce`
(re-running the verify effect when ids are present).
### i18n keys (both locales, leaf parity enforced by tripwire)
- `verify.offlineNotice` (NEW): EN "You're offline — check your connection, then try again."
  AR "لا يوجد اتصال بالإنترنت — تحقق من الشبكة ثم أعد المحاولة."
- `wallet.topup.callbackOffline` (NEW): EN "You're offline — we can't verify your payment
  right now. Top up only after reconnecting; nothing is lost." AR
  "لا يوجد اتصال بالإنترنت — لا يمكننا التحقق من عملية الدفع الآن. لا تتم المحفظة إلا بعد
  إعادة الاتصال؛ لن يضيع أي مبلغ."
  (Money-truth: offline ≠ failure of the charge — copy says nothing was lost, no false
  "no money was taken" claim either.)
- `wallet.topup.backToWalletAria` (NEW): EN "Back to wallet" AR "العودة إلى المحفظة".

## Files changed
| Layer | File | Change |
|---|---|---|
| API | apps/api/src/modules/wallet/wallet.topup.service.ts | 5 coded bodies |
| API | apps/api/src/modules/wallet/wallet.topup.service.spec.ts | code pins ×5 |
| PWA | apps/player-pwa/src/lib/topup-callback-messages.ts | code-first matcher |
| PWA | apps/player-pwa/test/topup-callback-messages.test.ts | code pins + legacy pins |
| PWA | apps/player-pwa/src/app/[locale]/wallet/topup/callback/page.tsx | offline branch + retry + aria |
| PWA | apps/player-pwa/test/topup-callback-page.offline.test.tsx | offline + context pins |
| PWA | apps/player-pwa/src/messages/{en,ar}.json | +3 wallet keys (verify.offlineNotice rides the lane item) |
| PWA | apps/player-pwa/src/app/[locale]/(auth)/verify/page.tsx | (lane) useLocale + offline |
| PWA | apps/player-pwa/test/verify-page.offline-locale.test.tsx | (lane) tripwire |

## Contract verification checklist (Gate 3 — explicit)
- [x] Every mutation endpoint shape unchanged except additive `code` body field — ✓ (5 throws;
      success path untouched; `verifyTopup` contract identical on 200).
- [x] Frontend types accept the exact JSON — ✓ (FetchError.code is `string | undefined`;
      matcher treats it as untrusted input).
- [x] Adapter/hook signatures unchanged — ✓ (`useVerifyTopup`, `topupCallbackMessageKey`).
- [x] No field silently undefined — ✓ (fallback chain ends in the existing generic key).
- [x] i18n keys exist for every user-facing string in BOTH locales — ✓ (3 new keys ×2;
      whole-file parity re-checked at gates; tripwire test pins parity).
