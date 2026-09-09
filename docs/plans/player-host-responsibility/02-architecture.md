# Gate 2 — Architecture: Player-Hosted Responsibility & Payout Regulation

## Design principles
1. **Server-authoritative money**: every debit/credit happens inside the API transaction that
   grants the right (seat / payout / refund). The client can never orchestrate money.
2. **Idempotent by key**: every ledger write carries a unique idempotency key; every state
   transition is a guarded single-shot UPDATE (pattern proven in `settlements.pay`/`cancelMatch`).
3. **Explicit, not derived**: `is_player_hosted` is persisted at create — labeling must not
   depend on a JOIN against `users.role` at read time (feed SQL stays cheap, history stays
   stable even if a user's role changes later).
4. **Legacy-safe defaults**: existing rows get `host_payout_state='not_applicable'`,
   `is_player_hosted=false`, NULL consent — zero behavior change for old matches.

## Data flow (money + signals)

```
CREATE (host, koralink mode)
  └─ tx: balance-floor debit cost ─ PITCH_BOOKING ledger ─ slot book
       └─ NEW: require acceptedHostingTerms=true → persist host_accepted_terms_at,
          is_player_hosted = (host.role==='Player'), host_payout_state='held'
JOIN (joiner)
  └─ PaymentSheet (balance preview) → POST /matches/:id/join {idempotencyKey}
       └─ tx: FOR UPDATE match row → checks → NEW: if player-hosted koralink & price>0:
            guarded wallet debit price_per_player → MATCH_FEE ledger (dto key)
            → insert match_players WITH fee_paid_sar (atomic — no paid-without-seat ever)
COMPLETE (host, auto-complete, or admin fallback)
  └─ tx: FOR UPDATE where host_payout_state='held'
       └─ payout = SUM(fee_paid_sar) − 5×paidCount  (floor 0)
            wallet CREDIT host → PRIZE ledger (`host-payout-{matchId}`)
            single-shot UPDATE → 'released'   ← the regulated payout moment
CANCEL / AUTO-CANCEL (host or scheduler)
  └─ tx: existing host refund + slot release
       └─ NEW: refund EVERY roster player with fee_paid_sar:
            wallet CREDIT → REFUND ledger (`refund-join-{matchId}-{userId}`)
LEAVE (voluntary) → NO refund (anti-abuse; stated in ToS) — fee stays until match completes/cancels
WAITLIST PROMOTION → promotion now attempts the same join-time fee collection; insufficient
  balance → seat passes to next queued player (queue fairness preserved, no free seat)
```

## Component changes

| File | Change |
|------|--------|
| `apps/api/src/database/schema.ts` | +`HostPayoutState` enum; matches: +`is_player_hosted`, `host_payout_state`, `host_accepted_terms_at`, +`join_payments_verified`; match_players: +`fee_paid_sar` |
| `apps/api/drizzle/0039_player_host_payout.sql` | Hand-written idempotent migration (VPS recipe) |
| `apps/api/src/modules/matches/dto/create-match.dto.ts` | +`acceptedHostingTerms?: boolean` (validated REQUIRED-true for koralink mode in service) |
| `apps/api/src/modules/matches/dto/join-match.dto.ts` | NEW — `{ idempotencyKey?: string }` |
| `apps/api/src/modules/matches/matches.service.ts` | createMatch (consent+flags), joinMatch (in-tx fee), cancelMatch + auto-cancel (roster refunds), completeMatch + autoCompletePastMatches (+releaseHostPayout), promoteNextInTx (paid promotion), findOne + findNearby + getMyMatches (+3 fields) |
| `apps/api/src/modules/admin/matches.service.ts` | `settleHostPayout()` ops fallback (same tx/guards) |
| `apps/player-pwa/src/components/payment/PaymentSheet.tsx` | Balance preview stays; pay action now calls `POST /matches/:id/join {idempotencyKey}` (no /wallet/pay) |
| `apps/player-pwa/src/hooks/useMatchActions.ts` | `useJoinMatch` accepts optional `{ idempotencyKey }` |
| `apps/player-pwa/src/lib/api-adapter.ts` | Map `is_player_hosted`, `host_payout_state` |
| `apps/player-pwa/src/types/index.ts` | Match: +`isPlayerHosted?`, +`hostPayoutState?` |
| `apps/player-pwa/src/components/matches/MatchCard.tsx` | "Player-hosted · Booked on KoraLink" badge (both locales) when `isPlayerHosted && bookingMode==='koralink'` |
| `apps/player-pwa/src/app/[locale]/match/[id]/page.tsx` | Responsibility banner (visitors) + payout status line (host) |
| `apps/player-pwa/src/components/host/HostMatchForm.tsx` | Mandatory consent checkbox (koralink mode only) + terms link |
| `apps/player-pwa/src/app/[locale]/terms/page.tsx` + `messages/{en,ar}.json` | New hosting/payout/refund sections, lastUpdated → September 2026 |
| tests (api + pwa) | Unit specs for payout math, refund fan-out, join-fee atomicity, consent guard; PWA badge/banner/consent tests |

## i18n keys needed (EN + AR, full values in Gate 3)
`matchCard.playerHostedBadge` · `matchDetail.playerHostedTitle/Banner/PayoutNote` ·
`hostForm.hostingConsent*` · `legal.termsHosting*/lastUpdated` · `errors.joinPaymentRequired*` ·
`wallet.hostPayout/joinerRefund labels`

## Risks & mitigations
- **Concurrent double payout** → FOR UPDATE + guarded UPDATE on `host_payout_state='held'` (single-shot wins).
- **Paid-but-no-seat** → impossible by construction (debit+insert in ONE tx).
- **Free seat** → join fee enforced server-side; idempotencyKey 400 when missing for fee matches.
- **Underfilled match shortfalls** → by design host absorbs; consent + ToS state it explicitly ("payout = joiner fees − platform share").
- **Migration on live staging** → idempotent SQL + journal row + restart (VPS recipe); deploy via staging lane per devops-cycle.
- **Waitlist promotion regressions** → EXACTLY ONE promoteNextInTx call per freeing path (existing hard rule); fee attempt inside its tx; insufficient → skip candidate (position row kept? No — candidate is skipped and row deleted; they may re-queue).

## Descoped (and why)
- Real payment gateway (P0-2 tracks) — wallet is the ledger of record for now.
- Partial/refund windows & disputes policy changes — existing disputes flow covers; ToS states the 100%-on-cancel / none-on-leave rule.
- Self-booked (`booking_mode='self'`) matches — economics unchanged; no fee, no payout, no badge.
- Admin console UI — service fallback only (console is Abdullah's lane).
