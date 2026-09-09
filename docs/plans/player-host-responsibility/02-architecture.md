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

## Data flow (money + signals) — REVISED per Abdullah 2026-09-09

**Mode semantics (both modes player-hosted = fee + payout + labeling; differ in WHO books/answers):**
- `koralink`: KoraLink books + collects pitch cost upfront; KoraLink resolves venue problems
  beyond the host; host runs the match. Host reimbursed from joiner fees on completion.
- `self`: host runs ALL pitch ops (venue access, pays venue directly, timing); KoraLink is the
  platform only. STRONGER amber responsibility warning. Host payout = joiner fees − margin
  (his venue money — venue is paid by him out-of-band).
- Fee condition (server): `is_player_hosted && price_per_player > 0` — BOTH modes.
  `host_payout_state` = 'held' when fee condition, else 'not_applicable'.

```
CREATE (host, either mode)
  └─ tx: [koralink only] balance-floor debit cost ─ PITCH_BOOKING ledger ─ slot book
       └─ require acceptedHostingTerms=true (both modes) → host_accepted_terms_at,
          is_player_hosted = (host.role==='Player'),
          host_payout_state = fee condition ? 'held' : 'not_applicable'
JOIN (joiner, fee match)
  └─ PaymentSheet (balance preview) → POST /matches/:id/join {idempotencyKey}
       └─ tx: FOR UPDATE match → checks → insert match_players (returns episode id)
            → guarded wallet debit price_per_player → MATCH_FEE ledger (key `join-fee-{clientKey}`)
            — one tx: a seat cannot exist without its fee; roster-unique guard blocks retries
LEAVE (joiner) — REFUND_WINDOW_HOURS = 4 (common/constants, server clock):
  └─ tx: FOR UPDATE match + read roster row (fee_paid_sar, episode id)
       ├─ now ≥ start−4h  → wallet CREDIT fee → REFUND ledger (`refund-join-{mpId}`)
       ├─ now < start−4h  → try waitlist backfill IN THIS TX:
       │     promoteNextInTx collects the next queued player's fee (paid, atomic)
       │       ├─ backfill seated → leaver refunded 100% (`refund-join-{mpId}`)
       │       └─ no queue/queued-can't-pay → FORFEIT: wallet CREDIT host fee
       │            (`host-forfeit-{mpId}`) — compensates the host for the empty seat;
       │            never refunded to the leaver, even on later cancellation
       └─ delete roster row → status flip Full→Open if needed (existing)
     after match started → leave forbidden (existing InProgress rules) → forfeit N/A
REMOVE PLAYER (host) → 100% refund to removed player (`refund-join-{mpId}`), any time
COMPLETE (host / auto-complete / admin fallback)
  └─ tx: FOR UPDATE where host_payout_state='held'
       └─ payout = round2(SUM(fee_paid_sar of CURRENT roster) − 5×count), floor 0
            (forfeits already credited at leave-time — not re-counted)
            wallet CREDIT host → PRIZE ledger (`host-payout-{matchId}`)
            single-shot UPDATE → 'released'   ← the regulated payout moment
CANCEL / AUTO-CANCEL
  └─ tx: existing host pitch-cost refund (koralink) + slot release
       └─ NEW: 100% refund EVERY current-roster payer (`refund-join-{mpId}`)
            forfeited fees stay with host (ToS-stated)
            UPDATE matches SET host_payout_state='cancelled' (guarded from 'held')
WAITLIST PROMOTION (any freeing path) → collects fee in-tx; can't pay → skip to next queued
```

## Component changes

| File | Change |
|------|--------|
| `apps/api/src/database/schema.ts` | +`HostPayoutState` enum; matches: +`is_player_hosted`, `host_payout_state`, `host_accepted_terms_at`, +`join_payments_verified`; match_players: +`fee_paid_sar` |
| `apps/api/drizzle/0039_player_host_payout.sql` | Hand-written idempotent migration (VPS recipe) |
| `apps/api/src/modules/matches/dto/create-match.dto.ts` | +`acceptedHostingTerms?: boolean` (validated REQUIRED-true for koralink mode in service) |
| `apps/api/src/modules/matches/dto/join-match.dto.ts` | NEW — `{ idempotencyKey?: string }` |
| `apps/api/src/modules/matches/matches.service.ts` | createMatch (consent+flags, both modes), joinMatch (in-tx fee, both modes), **leaveMatch (+4h-window conditional refund + waitlist backfill + forfeit credit), removePlayer (+100% refund)**, cancelMatch + auto-cancel (roster refunds), completeMatch + autoCompletePastMatches (+releaseHostPayout), promoteNextInTx (paid promotion), findOne + findNearby + getMyMatches (+3 fields) |
| `apps/api/src/modules/admin/matches.service.ts` | `settleHostPayout()` ops fallback (same tx/guards) |
| `apps/player-pwa/src/components/payment/PaymentSheet.tsx` | Balance preview stays; pay action now calls `POST /matches/:id/join {idempotencyKey}` (no /wallet/pay) |
| `apps/player-pwa/src/hooks/useMatchActions.ts` | `useJoinMatch` accepts optional `{ idempotencyKey }` |
| `apps/player-pwa/src/lib/api-adapter.ts` | Map `is_player_hosted`, `host_payout_state` |
| `apps/player-pwa/src/types/index.ts` | Match: +`isPlayerHosted?`, +`hostPayoutState?` |
| `apps/player-pwa/src/components/matches/MatchCard.tsx` | Mode-aware badge (both locales): `isPlayerHosted && bookingMode==='koralink'` → neutral green `playerHostedBadge`; `isPlayerHosted && bookingMode==='self'` → amber warning `selfHostedBadge` |
| `apps/player-pwa/src/app/[locale]/match/[id]/page.tsx` | Mode-aware responsibility banner: self = amber "run entirely by the host — all pitch ops are his responsibility"; koralink = neutral "KoraLink booked the pitch and will resolve problems the host can't" + payout/refund status lines (host vs joiner) |
| `apps/player-pwa/src/components/host/HostMatchForm.tsx` | Mandatory consent checkbox (both modes) + terms link; self mode shows the STRONGER amber warning copy |
| `apps/player-pwa/src/app/[locale]/terms/page.tsx` + `messages/{en,ar}.json` | New hosting/payout/refund sections, lastUpdated → September 2026 |
| tests (api + pwa) | Unit specs for payout math, refund fan-out, join-fee atomicity, consent guard; PWA badge/banner/consent tests |

## i18n keys needed (EN + AR, full values in Gate 3)
`matchCard.playerHostedBadge` · `matchDetail.playerHostedTitle/Banner/PayoutNote` ·
`hostForm.hostingConsent*` · `legal.termsHosting*/lastUpdated` · `errors.joinPaymentRequired*` ·
`wallet.hostPayout/joinerRefund labels`

## Risks & mitigations
- **Double-payout on concurrent completion** → FOR UPDATE + guarded UPDATE on `host_payout_state='held'` (single-shot wins).
- **Refund-window edge cases** → REFUND_WINDOW_HOURS=4 in `common/constants/`; window compare on server clock (Asia/Riyadh display is irrelevant — `scheduled_at` is timestamptz, compared against `NOW()`); unit tests pin boundary cases (exactly 4h → inside window = refund eligible).
- **Legal rejoin after leave (run #20 lesson)** → refund + forfeit idempotency keys derive from the roster-row (episode) id `refund-join-{mpId}` / `host-forfeit-{mpId}` — NEVER `{matchId}-{userId}` (deterministic per-entity keys 500 on a legal A→B→A leave/rejoin cycle). Each roster episode gets its own key space.
- **Paid-but-no-seat** → impossible by construction (debit+insert in ONE tx).
- **Free seat** → join fee enforced server-side; idempotencyKey 400 when missing for fee matches.
- **Underfilled match shortfalls** → by design host absorbs; consent + ToS state it explicitly ("payout = joiner fees − platform share").
- **Migration on live staging** → idempotent SQL + journal row + restart (VPS recipe); deploy via staging lane per devops-cycle.
- **Waitlist promotion regressions** → EXACTLY ONE promoteNextInTx call per freeing path (existing hard rule); fee attempt inside its tx; insufficient → skip candidate (position row kept? No — candidate is skipped and row deleted; they may re-queue).

## Descoped (and why)
- Self-booked (`booking_mode='self'`) — now IN scope for fee + payout + labeling (Abdullah
  2026-09-09: self = stronger warning, host runs ALL pitch ops). NOT changed: no koralink slot
  booking, no pitch-cost debit (venue paid by host out-of-band).
- Real payment gateway (P0-2 tracks) — wallet is the ledger of record for now.
- Disputes flow changes — existing no-show dispute flow covers abuse cases; ToS cross-references it.
- Admin console UI — service fallback only (console is Abdullah's lane).
