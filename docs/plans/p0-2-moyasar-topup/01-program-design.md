# Gate 1-3 — Program Design: Moyasar wallet top-up vertical slice (run #169)

## Problem / user story (Gate 1)
Players cannot add real money to their wallet (P0-2): the only top-up path is the
dummy self-credit endpoint, 403-gated by WALLET_TOPUP_ENABLED since the Strix P0-7 fix.
As a player, I want to top up my wallet with a mada/Visa/Mastercard card through a
hosted, PCI-minimal form and see my balance grow — in EN and AR.

Scope IN: intent+verify API (sandbox keys), SDK form in the PWA wallet page (flag-gated),
3DS callback route, idempotent credit, i18n EN+AR, offline guard, PostHog+Sentry wiring,
specs for both apps. Scope OUT: payouts/withdraw (P1-14 family), refunds (P1-29),
Apple Pay/STC Pay (later methods), LIVE keys, webhooks (verify-on-callback is the
sandbox-demo integration; webhooks = production hardening row).

## Architecture delta (Gate 2)
```
PWA wallet page ──POST /wallet/topup/intent──▶ API: insert wallet_topup_intents
             ◀──{intentId, amount, publishableKey, enabled}──   (idempotent per user key)
PWA TopupSheet: Moyasar.init({amount: halalas, publishable_api_key, callback_url,
                methods:['creditcard'], supported_networks:[visa,mastercard,mada,unionpay]})
  card data goes browser ──▶ api.moyasar.com ONLY (never our servers; PCI-minimal)
  3DS frictionless: on_completed(payment) ──▶ POST /wallet/topup/verify {paymentId, intentId}
  3DS challenge: full-page redirect ──▶ GET /<locale>/wallet/topup/callback?id=… ──▶ verify
API verify: GET https://api.moyasar.com/v1/payments/:id (Basic sk:) →
  status==='paid' && source_message/code checked && currency==='SAR'
  && payment.amount === intent.amount_halalas → credit wallet in ONE tx
  (CREDIT ledger row, idempotency_key = `topup:<paymentId>`, UNIQUE → replay-safe)
```

### Files changed
| Layer | File | Change |
|---|---|---|
| DB | apps/api/drizzle/0056_wallet_topup_intents.sql (+journal idx 57 + snapshot) | new table |
| DB | apps/api/src/database/schema.ts | walletTopupIntents declaration |
| API | apps/api/src/common/moyasar/moyasar.client.ts (NEW) | fetch client (sk, halalas, UA pitfall) |
| API | apps/api/src/modules/wallet/dto/topup-intent.dto.ts (NEW) | amount bounds 5-2000 SAR |
| API | apps/api/src/modules/wallet/dto/verify-topup.dto.ts (NEW) | paymentId+intentId uuid |
| API | apps/api/src/modules/wallet/wallet.service.ts | createTopupIntent, verifyTopup |
| API | apps/api/src/modules/wallet/wallet.controller.ts | 3 routes, flag-gated, @Throttle |
| API | apps/api/src/modules/wallet/*.spec.ts | unit specs (mocked Moyasar fetch) |
| PWA | apps/player-pwa/src/components/wallet/TopupSheet.tsx (NEW) | SDK form wrapper, client-only |
| PWA | apps/player-pwa/src/hooks/useTopupIntent.ts (NEW) | intent creation + verify mutation |
| PWA | apps/player-pwa/src/app/[locale]/(main)/wallet/page.tsx | Top-up button → sheet (flag) |
| PWA | apps/player-pwa/src/app/[locale]/wallet/topup/callback/page.tsx (NEW) | 3DS redirect verify |
| PWA | next.config.mjs | prod script-src += cdn.moyasar.com/jsdelivr; frame-src form host |
| PWA | messages/en.json, ar.json | wallet.topup.* keys EN+AR parity |
| PWA | test/components/wallet/TopupSheet.test.tsx (NEW) | specs |

### CSP (verified against next.config.mjs:274-310)
- prod script-src: += `https://cdn.moyasar.com` (form JS host per docs; dev already has it)
- frame-src 'none' → the SDK form is an in-DOM component (no iframe) — frame-src stays
  'none'; add NOTHING for 3DS (full-page redirect navigates, no frame).
- connect-src: card data posts browser→api.moyasar.com from inside the form lib. Add
  `https://api.moyasar.com` to connect-src (needed for the XHR tokenization calls).

## Gate 3 contracts (exact shapes)

### GET /wallet/topup/config (auth) → 200
```json
{ "enabled": true, "publishableKey": "pk_test_…", "minAmount": 5, "maxAmount": 2000 }
```
disabled flag → `{ "enabled": false, "publishableKey": null, "minAmount": 5, "maxAmount": 2000 }`.

### POST /wallet/topup/intent (auth) — body `{"amountSar": 50}`
Idempotency: client supplies `{"amountSar": 50, "idempotencyKey": "<uuid>"}`; key scoped
`topup-intent:<userId>:<key>` on the intent row's UNIQUE idempotency_key → replay returns
the ORIGINAL intent. → 201
```json
{ "intent": { "id": "<uuid>", "amountSar": "50.00", "status": "pending",
  "idempotencyKey": "topup-intent:<userId>:<key>" },
  "publishableKey": "pk_test_…" }
```
Errors: 403 flag off · 400 bounds (5.00–2000.00 SAR, 2dp) · 401.

### POST /wallet/topup/verify (auth) — body `{"paymentId":"<moyasar id>","intentId":"<uuid>"}`
→ 200 `{"credited": true, "balance": "150.00", "paymentId": "…", "alreadyCredited": false}`
Replay (same paymentId again): 200 `{"credited": false, "alreadyCredited": true, …}`.
Errors: 404 unknown intent / payment not found at Moyasar · 409 `payment_not_paid`
(status≠paid, message: "payment is not completed yet — no money was credited") ·
409 `amount_mismatch` · 403 flag off · 400 validation.
Verify does: Moyasar fetch → assertions → tx{ INSERT transactions
(type CREDIT, reference_type TOPUP, reference_id paymentId, amount, idempotency_key
`topup:<paymentId>`) + UPDATE users.wallet_balance } → unique-violation replay path
reuses existing findReplay semantics (isUniqueViolation helper).
Intent flip: pending→credited in the same tx; mismatch/intent-owner checks first.

### TS signatures
```ts
// wallet.service.ts
createTopupIntent(userId: string, dto: TopupIntentDto): Promise<{ intent: TopupIntentRow; publishableKey: string }>
verifyTopup(userId: string, dto: VerifyTopupDto): Promise<VerifyTopupResult>
getTopupConfig(): { enabled: boolean; publishableKey: string | null; minAmount: number; maxAmount: number }
// moyasar.client.ts
fetchMoyasarPayment(paymentId: string): Promise<MoyasarPayment>  // throws MoyasarHttpError{status}
```

### PWA hook signatures
```ts
useTopupConfig(): { data?: {enabled,publishableKey,minAmount,maxAmount}; isLoading }
useCreateTopupIntent(): UseMutationResult<IntentResponse, Error, { amountSar: number; idempotencyKey: string }>
useVerifyTopup(): UseMutationResult<VerifyResponse, Error, { paymentId: string; intentId: string }>
```

### i18n keys (EN + AR parity, namespace wallet.topup)
`title, subtitle, amountLabel, quick5/quick10/quick20/quick50, customAmount, payWithCard,
secureNote, processing, successTitle, successBody, failedTitle, notPaid, amountMismatch,
offlineNote, configUnavailable, callbackVerifying, callbackSuccess, callbackFailed,
callbackRetry` — error copy follows error-message-standards (what+why+next; money
reassurance "no money was taken" on failure paths).

### Contract verification checklist (Gate 3)
- [x] Mutations return fully populated shapes (verify returns balance + paymentId; intent returns row + key)
- [x] PWA types accept the exact JSON (VerifyResponse/IntentResponse typed from controller shapes)
- [x] Adapters: none needed (numeric strings from Drizzle `numeric` map via moneyToNumber on read; hook returns raw strings, page formats)
- [x] No silently-undefined fields: verify computes balance AFTER credit within tx; replay path re-reads balance
- [x] i18n keys enumerated above, both locales, parity-checked in specs? — parity enforced by vitest i18n suite (leaf counts)
