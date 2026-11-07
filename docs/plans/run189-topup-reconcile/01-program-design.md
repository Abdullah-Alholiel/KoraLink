# Run #189 — Program Design (Gates 1–3 compact)

## Problem
Top-up credit happens ONLY when the PWA calls `POST /wallet/topup/verify`. A player who pays
successfully at Moyasar but closes the app before verify returns has real SAR gone from their
bank and no wallet credit until they reopen and retry. On the most trust-sensitive surface
(money), that is a P1 gap (Reviewer B, run #189).

## User story
As a player, if my bank was charged for a wallet top-up, the credit reaches my wallet even if
my app died mid-confirmation — without me having to know what "verify" means.

## Scope
IN: server-side reconcile sweep (every 5 min, users-scheduler pattern): finds paid Moyasar
payments bound to our intents (`description = wallet-topup:<intentId>`) with no matching
ledger credit, and re-runs the EXISTING guarded `verifyTopup` (all P2-282/binding/amount/
idempotency guards preserved verbatim). Description-fetch fallback for slots whose payment
row aged out of the 100-payment list window. Observability: Pino logs + Sentry on failures,
PostHog `topup_reconciled` only on actual credits.
OUT (never this cycle): Moyasar webhook receiver (different trust shape — needs public
endpoint + signature verification; owner call later), withdrawal path (P1-27/69 owner),
saved cards, admin surfaces.

## Architecture delta
- `moyasar.client.ts`: + `listMoyasarPayments(secretKey, query?)` (GET /v1/payments, Basic
  auth, same UA as fetch; contract live-probed 200 on sandbox 2026-11-05 — returns
  `{payments:[…]}`, max 100/page; `q=` filter IGNORED server-side → client-side description
  filter; no server-side status filter observed on the probe).
- `wallet.reconcile.service.ts` (NEW, WalletModule provider): `reconcileOnce()` =
  1. early-return if `!enabled || !secretKey` (flag/key off → silent skip, log once);
  2. `SELECT id, user_id, created_at FROM wallet_topup_intents WHERE status='pending' ORDER BY created_at DESC LIMIT 200`;
  3. `listMoyasarPayments` (recent 100); build map description→paid payment;
  4. `NOT EXISTS (SELECT 1 FROM transactions tx WHERE tx.idempotency_key = 'topup:'||p.id)` → discoverable;
  5. For each discoverable intent: try map hit first; else `fetchMoyasarPayment(descriptionId)`
     with 404→mark no further action; call `verifyTopup(intent.user_id, { intentId, paymentId })`
     in try/catch — ConflictException('payment_not_paid') = normal (3DS pending), swallow;
     any other error = log + Sentry, next sweep retries;
  6. credited results → Pino structured log (PostHog has NO server-side client —
     it is PWA-only; server-side observability = Pino + Sentry per users-scheduler
     pattern).
- `wallet-topup-reconcile.service.ts` — wait, ONE file: all of the above lives in
  `wallet.reconcile.service.ts`; scheduling via `@Cron('*/5 * * * *', { name: 'wallet-topup-reconcile' })`
  on a method in the SAME service (ScheduleModule.forRoot() already wired in app.module).
  Guard: re-entrancy lock (module-level boolean; cron fires are sequential in Nest scheduler,
  the guard covers manual invocations and overlaps).
- HEX: +1 api_services, +1 api_schema_files (+ exceptions on failure paths) → fold into
  hex-audit.mjs baseline with attribution comment (ALLOWED class).

## Exact API JSON shapes
No new endpoints. No controller changes. (Sweep is server-internal; the PWA surface is
untouched this cycle — P2-279's pending card + polling already carry the UX.)

## TS signatures
```ts
// moyasar.client.ts
export interface MoyasarPaymentList { payments: MoyasarPayment[]; }
export async function listMoyasarPayments(secretKey: string, query?: string): Promise<MoyasarPayment[]>;

// wallet.reconcile.service.ts
@Injectable() export class WalletReconcileService {
  reconcileOnce(): Promise<{ scanned: number; credited: number; skipped: number; failed: number }>;
}
```

## i18n keys
NONE (no user-visible string changes). P2-310 rides the same cycle: add `role="status"` +
aria-live to the profile stats error block (profile/page.tsx ~:282) — zero new keys.

## Contract verification checklist (Gate 3)
- [x] Every mutation guarded: sweep calls verifyTopup verbatim (binding :276, amount :304, currency :301, replay :284, in-tx flip assertion :347 — unchanged).
- [x] No new frontend types/adapters needed (no endpoint change).
- [x] No field silently undefined (sweep result is server-logged only).
- [x] i18n: no new keys; P2-310 is attribute-only.
- [x] Money rule: credits ride the ONE-tx ledger+balance+flip with UNIQUE idempotency key → double-credit impossible (UNIQUE violation path already returns winner outcome).
- [x] Migration: NONE (uses existing tables/indexes).
