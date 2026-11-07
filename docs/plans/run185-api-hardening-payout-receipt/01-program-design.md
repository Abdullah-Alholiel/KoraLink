# Run #185 — Program Design (Gates 1–3 compact)

## Problem
1. WS `leave-conversation` is the only handler accepting an unvalidated id into a room name
   (Reviewer A IMPORTANT-1; violates the stated P2-6 invariant that every handler
   UUID-validates its ids).
2. Money/reads lack route-level throttles: `POST admin/settlements/:id/pay` + `generate`
   (admin money ops) and `GET wallet/balance` + `history` ride only the global 60/min guard.
3. Hosts get no payout breakdown anywhere (P2-293): the PRIZE ledger row carries no metadata,
   so a host cannot see payers count, fee pool, platform share, or forfeits.

## User stories
- As a host, after my match completes I open match detail and see exactly how my payout was
  computed (joiner fees, platform fee, forfeits, total credited) — EN+AR.
- As the platform, admin money mutations and wallet reads carry the same explicit throttle
  posture as every other money route.

## Scope
IN: gateway leave-conversation shape guard; 4 route throttles; GET /wallet/payout-receipt/:matchId
(owner-only) + PWA HostPayoutReceipt card on match detail + i18n EN/AR + specs.
OUT: withdrawal rail (P1-69, owner-gated), settlements void policy (P2-285, owner-gated),
schema changes (breakdown is computed on read — no migration), non-host receipt access.

## Exact API contract (Gate 3)

### GET /wallet/payout-receipt/:matchId  (JwtCookieAuthGuard)
404 when: match missing, OR caller is not the host, OR match is not player-hosted, OR
payout_state is 'held' or 'cancelled' (nothing released yet).
```json
{
  "matchId": "uuid",
  "matchTitle": "Sunset 7v7 Rooftop",
  "completedAt": "2026-11-04T10:00:00.000Z",
  "currency": "SAR",
  "payoutSar": 47.0,
  "breakdown": {
    "feePoolSar": 72.0,
    "payers": 3,
    "platformFeeSar": 15.0,
    "perJoinerFeeSar": 5.0,
    "forfeitSar": 5.0,
    "forfeits": 1
  }
}
```
Math mirrors releaseHostPayoutInTx EXACTLY: payout = round2(max(0, feePool − margin×payers));
feePool = Σ match_players.fee_paid_sar (host row is NULL by design, so unfiltered SUM is
joiners-only — verified against the release code, not assumed). forfeitSar = Σ REFUND-ladder
forfeit credits = transactions WHERE user_id=host AND reference_type='ADJUSTMENT' AND
reference_id IN (episode ids of this match) — forfeit reference_id stores the EPISODE id
(matches.service.ts:1999), so the episode→match join is required. status='Completed' only.
`reference_type='PRIZE' AND reference_id=matchId AND idempotency_key='host-payout-<id>'`
serves as the released-proof (no extra matches.payout_state read needed for the 404, but the
payout_state check stays for held/cancelled honesty).

### WS leave-conversation
Non-UUID-shaped conversationId → WsException('Invalid id format.') — identical message to the
9 gated handlers. Membership check stays deliberately omitted (P2-6 exemption unchanged;
ws-gate-coverage.spec EXEMPT_EVENTS untouched).

### Throttles (Throttler v6 route metadata, @nestjs/throttler already global APP_GUARD)
- POST admin/settlements/:id/pay → 10/60s; POST admin/settlements/generate → 10/60s.
- GET wallet/balance → 60/60s; GET wallet/history → 60/60s (explicit parity with topup GETs).

## TS signatures
```ts
// wallet.service.ts
async getPayoutReceipt(hostId: string, matchId: string): Promise<PayoutReceipt>
// PayoutReceipt = the JSON above; throws NotFoundException per the 404 rules.
```

## Frontend contract
- Hook `usePayoutReceipt(matchId, enabled)` → react-query ['wallet','payout-receipt',matchId],
  enabled only when match.isUserHost && match.isPlayerHosted && match.status==='completed';
  404 → returns null (card hidden), never error-toast.
- Card renders inside match detail money section; shows per-line breakdown + total; uses
  formatMoney (locale digits) + formatDate; z-index N/A (inline card, not a sheet).
- i18n keys (wallet ns): payoutReceiptTitle, payoutReceiptFeePool, payoutReceiptPlatformFee,
  payoutReceiptPerJoinerFee, payoutReceiptForfeits, payoutReceiptTotal — EN+AR parity.

## Checklist (Gate 3)
- [x] New read endpoint returns a fully-shaped object; no silent undefined fields
  (forfeits default 0, perJoinerFee = margin).
- [x] Frontend type matches the exact JSON; adapter unnecessary (shape consumed directly).
- [x] Every user-facing string has i18n keys in BOTH languages (6 keys × 2).
- [x] Mutation contract N/A (read-only endpoint).
- [x] Money math derived from the release code path, not re-invented.
