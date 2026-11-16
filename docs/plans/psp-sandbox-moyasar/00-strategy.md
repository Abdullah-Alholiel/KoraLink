# PSP Sandbox Strategy — Moyasar (owner decision 2026-10-25)

**Goal:** payment integration ready for real cards BEFORE the company/CR exists — using
Moyasar's free sandbox (test keys) wired end-to-end on PROD as a demo, so the go-live
moment is an env flip, not a rebuild.

## Why Moyasar (assessment)
- **Saudi-native**: mada is first-class (KSA's dominant scheme), plus Visa/MC/Amex/UnionPay/Apple Pay/STC Pay.
- **Sandbox is free + needs NO company**: register at https://dashboard.moyasar.com/register/new → test keys (`pk_test_…` / `sk_test_…`) instantly. Live keys require CR + live onboarding later.
- **Integration shape fits us**: hosted payment form (card data never touches our servers → minimal PCI scope), server-side verification via secret key, amounts in halalas (SAR*100).
- Board P0-2 note: PSP decision MUST consider mada — Moyasar satisfies this.

## Test cards (sandbox — from docs.moyasar.com/guides/card-payments/test-cards)
| Scenario | Card | Result |
|---|---|---|
| mada success | `4201320111111010` | paid, code 00 |
| mada insufficient funds | `4201320000311101` | failed, 51 |
| mada declined | `4201321234411220` | failed, 41 |
| Visa 3DS frictionless | `4111114005765430` | paid |
| MC success | `5421080101000000` | paid |
Expiry: any future month/year. CVC: any 3 digits. Name: any two words.

## Architecture (the contract)
1. `POST /api/v1/wallet/topup/intent` (auth'd, amount SAR with min/max bounds) → server creates
   a Moyasar payment (source: creditcard, amount = SAR×100 halalas, callback_url = PWA
   `/wallet/topup/callback`) → returns the hosted-form URL / payment id.
2. Player pays on Moyasar's hosted page → redirect back with `?id=<payment_id>`.
3. `GET /api/v1/wallet/topup/verify?id=` → server fetches the payment from Moyasar API with
   `sk_test` (Basic auth), checks `status==='paid'` AND `amount` AND `currency==='SAR'`
   AND amount matches the intent → credits wallet **in the same Drizzle tx** with the
   existing `idempotency_key` unique constraint (wallet.service.ts already has it).
4. Never trust the redirect alone; never expose `sk_*` to the PWA; publishable key only in the form.

## Phases
- **P0 — promote audit** ✅ this session (see run context; verdict delivered 2026-10-25).
- **P1 — Render pre-deploy + promote package** (factory lane, small): one Dockerfile line
  (`COPY scripts ./scripts`) so `node scripts/migrate-vps.mjs` works in the runtime image;
  then assemble the promote PR → owner merges.
- **P2 — sandbox account (owner, ~10 min, free):** register at dashboard.moyasar.com → copy
  `sk_test_…` + `pk_test_…` → add to `/home/ubuntu/.hermes/profiles/koralink/.deploy-tokens`
  as `MOYASAR_SECRET_KEY_TEST` / `MOYASAR_PUBLISHABLE_KEY_TEST` → tell the agent the NAMES only.
- **P3 — wallet top-up vertical slice (factory lane):** intent+verify endpoints, hosted-form
  init on PWA wallet page, tx credit, i18n EN/AR, PostHog `topup_completed`, Sentry capture,
  vitest+jest, E2E with the test-card table above. Gated by `WALLET_TOPUP_ENABLED`
  (already on Render) so demo can stay off until owner flips it.
- **P4 — money-path completion on sandbox:** refund flow (P1-29 disputes) + payout design
  (P1-14) validated against sandbox APIs.
- **P5 — go-live (owner prerequisites):** CR/company registration → Moyasar live onboarding
  (mada merchant enablement via bank) → swap `sk_test→sk_live` keys → owner flips
  `WALLET_TOPUP_ENABLED` on Render → DIA e-invoicing registration (no VAT/ZATCA handling
  exists in code yet — separate slice before charging real players).

## Standing security rules
- `sk_*` keys only ever in Render env / `.deploy-tokens` — never repo, never chat, never PWA bundle.
- Every credit path re-verifies amount+currency+status server-side; client callbacks are hints.
- All top-ups idempotent (existing unique `idempotency_key`); rate-capped endpoint.
