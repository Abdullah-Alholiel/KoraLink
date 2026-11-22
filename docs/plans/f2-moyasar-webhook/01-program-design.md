# F2 Moyasar Webhook — Gates 1-3 compact (run #223)

## Gate 1 — Product
**Problem:** when WALLET_TOPUP_ENABLED flips on in prod, credit discovery depends on the
reconcile sweep (newest-100 Moyasar list window + up to 15 min latency) + the user's callback
page. A paid payment that ages out of the list window (P2-369c) is never credited.
**User story:** as a player, my completed top-up lands within seconds even if I close the app
before the callback fires.
**Scope IN:** POST /api/v1/wallet/webhook endpoint; Moyasar event handling (payment_paid,
payment_failed, webhook_verification); shared-secret auth (constant-time); idempotent credit by
payment id; flag-off default; .env.example contract; specs.
**Scope OUT:** Moyasar dashboard registration (owner 5-min step); HMAC (API doesn't offer it);
live keys; payment_refunded/voided handling (wallet has no debit-back path today — rides the
existing P2-285 void semantics; future row); email/push notification on credit.
**Success criteria:** endpoint live flag-off (403), specs green, flag-on behavior verified by
unit specs (no live sandbox E2E possible without dashboard registration — recorded as owner step).

## Gate 2 — Architecture
```
Moyasar ──POST /api/v1/wallet/webhook──▶ WalletWebhookController (public, throttled)
                                          │ 1. flag off → 403 (fail-closed)
                                          │ 2. shared secret constant-time compare (fail-closed)
                                          │ 3. event route:
                                          │    webhook_verification → log + Sentry (owner acts)
                                          │    payment_paid → resolve intent by desc binding
                                          │                   ▼
                                          │    WalletTopupService.creditFromWebhook(intentId, paymentId)
                                          │      · fetchMoyasarPayment (server truth)
                                          │      · verifyTopup's EXACT guarded tx (ledger+balance+flip)
                                          ▼
                                     2xx { received: true } (always, after auth)
```
**Files changed:** wallet.module.ts (+controller), wallet.webhook.controller.ts (NEW),
wallet.topup.service.ts (+1 public method `creditFromWebhook` extracting the guarded tx),
.env.example (+2 lines). No schema change, no migration, no i18n (server-only surface).
**Trust model:** the secret only proves "sender knows the secret"; every credit still re-fetches
the payment from Moyasar with the secret key and runs the same amount/currency/binding assertions
as /topup/verify. A forged event cannot credit — it can only trigger a re-check that itself
fails closed.

## Gate 3 — Program design (exact contracts)
### Request → response
- `POST /api/v1/wallet/webhook`, body = Moyasar webhook object (JSON):
  `{ id, type: 'payment_paid'|'payment_failed'|'payment_refunded'|'payment_voided'|'payment_authorized'|'payment_captured'|'payment_verified'|'card_auth_*'|'webhook_verification', created_at, secret_token, live, data }`
- Success: `200 { "received": true }` for every authenticated event whose outcome is
  DECIDED (Moyasar retries 5× on non-2xx — never tickle retries for settled outcomes).
- Flag off (or secret unset): `403 { "statusCode":403, "message":"Wallet webhook is disabled in this environment" }`.
- Auth fail (missing/non-string/mismatched `secret_token`, incl. unparseable bodies where
  the secret cannot be extracted): `401 { "statusCode":401, "message":"Invalid webhook secret" }`
  — fail closed (r2 revision: the original "malformed → 200" was wrong; an unparseable
  sender cannot be authenticated).
- Route throttling: `@SkipThrottle()` — the shared secret IS the gate; Moyasar's shared
  egress IPs would false-positive a per-IP limiter and its 5-retry cap would drop credits.
### Retry contract (final, post Claude tier-C review)
- ACK 2xx: decided refusals only — `payment_intent_mismatch`, amount/currency mismatch,
  `topup_already_credited`, unknown intent (NotFound), malformed-but-authenticated bodies,
  and ALL non-actionable event types.
- RETHROW → 5xx → Moyasar redelivers: `payment_not_paid` from the WEBHOOK path
  (read-after-write skew — Moyasar's GET can lag its own event), DB failures, Moyasar
  5xx/timeouts, unexpected errors.
- `payment_failed` / `payment_refunded` / `payment_voided` / `card_auth_*`: acknowledged
  2xx, deliberately NOT acted on (no debit-back path today — future board row).
### TS signatures
```ts
// wallet.webhook.controller.ts
@Controller('wallet/webhook')   // under global prefix api/v1; @SkipThrottle()
handleMoyasarWebhook(@Req() req: RawBodyRequest<Request>): Promise<{ received: boolean }>
// service (extracted, shared by verify + webhook):
creditFromWebhook(intentId: string, paymentId: string): Promise<VerifyTopupResult>
// internals:
private assertSecret(rawSecret: unknown, expected: string): boolean   // timingSafeEqual, fail-closed
```
### creditFromWebhook contract (reuse, not fork)
Assertion order: intent lookup → topup-flag gate (fail-closed parity with verifyTopup) →
fetch payment (sk) → binding (`payment_intent_mismatch`) → status paid
(`payment_not_paid`; retryable on the webhook path per the retry contract above) → then
creditPaidPaymentToIntent (shared by BOTH callers, single copy of P2-282 credited-refusal +
sequential replay + SAR + amount + guarded single-tx). Intent resolved by the
`wallet-topup:<intentId>` description binding — user comes from the intent row (webhook has
no JWT). If the intent is already `credited` with a DIFFERENT payment → ConflictException
(surfaced as warn log + Sentry; 2xx still returned — Moyasar needn't retry).
### Env contract (.env.example only, no secrets)
```
# MOYASAR_WEBHOOK_SECRET — the shared_secret you registered for the webhook in the Moyasar
#   dashboard (Settings → Webhooks). The endpoint compares it (constant-time) to each event's
#   secret_token. Leave unset while WALLET_WEBHOOK_ENABLED=false.
# WALLET_WEBHOOK_ENABLED=false — F2 Moyasar webhook (default OFF).
```
### Observability (AGENTS.md §4)
- verification code: `logger.log('moyasar webhook verification code: <code> — confirm webhook
  <id> in dashboard within 30 min')` + `Sentry.captureMessage(..., level: 'warning',
  tags: { scope: 'wallet.webhook', webhookId })` (Sentry = the pager Abdullah actually reads).
- paid-credit: `logger.log('topup webhook credited: intent=… payment=… amountSar=…')`.
- forged/other failures: warn log + `Sentry.captureException` with scope tag `wallet.webhook`.
### i18n keys
None — server-to-server surface, no user-facing copy.

## Gate 3 contract verification checklist
- [✓] Every mutation returns a fully populated object — creditFromWebhook returns the SAME
      `VerifyTopupResult` shape as verifyTopup (credited/alreadyCredited/balance/paymentId/amountSar).
- [✓] Frontend types unaffected — endpoint is server-only; no PWA/API type drift possible.
- [✓] Adapter functions — none needed (no new frontend shape).
- [✓] No field silently undefined — controller always returns `{ received: true }` on 2xx.
- [✓] i18n — N/A (server-to-server), documented above.

## 00-status.md
| Gate | Name | Status | Approved | Artifact |
|------|------|--------|----------|----------|
| 0 | Retrospective | ✅ DONE | autonomous | 00-retro.md |
| 1 | Product Spec | ✅ DONE | autonomous | §Gate 1 above |
| 2 | Architecture | ✅ DONE | autonomous | §Gate 2 above |
| 3 | Program Design | ✅ DONE | autonomous | §Gate 3 above + checklist |
| 4 | Vertical Slices | 🔄 THIS RUN | — | slices below |
```
