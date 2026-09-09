# Gate 1 — Product Spec: Player-Hosted, KoraLink-Booked Matches

## Problem statement
When a **player** hosts a match on a slot **booked through KoraLink**, the app gives no signal
that the hosting player — not KoraLink — is responsible for the booking (payment, schedule,
venue conduct). Other players join seeing the same card as any club match, with no idea who
carries the responsibility, whether their money is protected, and when the host gets his money.

## User stories
- **P0-US1** (visitors know): As any user viewing a match card or the match screen, I can see
  explicitly when a match is **hosted by a player on a KoraLink-booked slot** — so I know the
  hosting player is responsible for everything (venue access, schedule, fairness), not KoraLink.
- **P0-US2 (host consent)**: As a host creating a koralink-booked match, before I pay I see and
  must accept the hosting responsibility + payout-on-completion terms (explicit checkbox +
  terms link). No consent → no booking.
- **P0-US3 (payout timing)**: As the hosting player, my payout (reimbursement from joiner
  payments) is released **only after the match is completed** — never before. If cancelled:
  everyone refunded, no payouts.
- **P0-US4 (joiner protection — refund matrix, Abdullah 2026-09-09)**: Refunds are
  conditional, not blanket:
  | Event | Refund |
  |---|---|
  | Host cancels / auto-cancel (underfilled) | 100% to every paying joiner |
  | Host removes a player | 100% to the removed player |
  | Joiner leaves ≥ 4h before start | 100% |
  | Joiner leaves < 4h before start AND a waitlisted player backfills the seat (paid, in-tx) | 100% |
  | Joiner leaves < 4h and no backfill possible | **No refund** (fee forfeited → host pot at completion) |
  | Joiner leaves after match started | **No refund** (forfeit) |
  | No-show | No refund (existing disputes flow) |
  Forfeited fees are NOT returned even if the match is later cancelled (ToS-stated).
- **P1-US5 (server enforcement)**: As the platform, a seat is only granted when payment is
  verified **server-side** in the same transaction as the join — client can no longer create a
  free seat or lose money to a dropped call.
- **P1-US6 (visibility parity — MODE-AWARE responsibility labeling, Abdullah 2026-09-09)**:
  - **Self-booked (`booking_mode='self'`) carries the STRONGER warning**: the match is fully
    run by the hosting user — all pitch operations (venue access, venue payment, timing, game
    management) are the host's responsibility; KoraLink is the platform only. Amber warning
    styling on card badge + detail banner.
  - **KoraLink-booked (`booking_mode='koralink'`)**: shared model — KoraLink owns the pitch
    booking and steps in to resolve problems the host cannot solve; the host remains
    responsible for running the match (pitch ops on the day, fairness, timing).
  Both appear identically on feed cards, my-games cards, and match detail, EN+AR.
- **P2-US7 (ops fallback)**: As ops, if auto-verification fails at completion, the admin can
  mark a match "settled-by-ops" so the payout reg isn't a dead end.

## Scope
**IN**: schema (booker concept, host payout state machine), API (join-payment enforcement both
modes, host payout release on completion, conditional refund engine: 4h window + waitlist
backfill + forfeit + remove-player refunds, new API fields), PWA (mode-aware card badges +
detail banners + host consent + leave-outcome toasts + wallet ledger labels), i18n EN+AR, ToS
update, tests, observability.
**OUT**: real-money gateway (P0-2), venue settlement regen, disputes flow changes, admin
console UI work (only the service fallback method).

## Success criteria
1. A player-hosted match (either mode) shows the explicit mode-aware responsibility label on
   feed card + detail (EN+AR), everywhere the match appears.
2. Host cannot complete booking without accepting responsibility terms; consent is persisted
   (`host_accepted_terms_at` NOT NULL on new player-hosted matches, both modes).
3. Joiners of player-hosted matches (both modes) pay at join; host-cancel / auto-cancel /
   host-removal refunds every eligible joiner 100% to wallet + ledger REFUND rows (idempotent;
   forfeited fees excluded per the refund matrix).
4. Refund matrix enforced exactly: host-cancel/remove → 100%; leave ≥4h → 100%; leave <4h with
   waitlist backfill → 100%; leave <4h without backfill → forfeit to host; forfeits never
   refunded on later cancellation. Join without verified payment → 402/409, no seat, no charge.
5. Host payout released exactly once, only on Completed (manual, auto-complete, admin settle
   fallback), amount = collected fees − platform share, idempotent.
6. Mode-aware labeling shipped: self-booked = stronger amber host-runs-everything warning;
   koralink-booked = shared-responsibility message (KoraLink books + resolves venue problems);
   both EN+AR on cards, detail, host form, and ToS.
7. `turbo run build` green + all tests green, E2E money assertions pass.

## Open questions (answered by Gate 2 decisions — documented there)
- Where does the payout money come from if joiner fees currently sit in platform balance?
  → This is a ledger-level design (see Gate 2 §4).
- Does the "host payout" include the SAR 5/player platform share? → No; share stays platform's.
- What about `self` booking mode? → Unchanged; labeling only applies to koralink-booked.

## Risks
- Ledger semantics complexity → solved by explicit state machine + idempotency keys (Gate 2).
- Existing open matches at deploy time → migration defaults them to legacy-safe states.
- Double-payout on concurrent completion → single-shot guarded UPDATE pattern (proven in
  cancelMatch/settlements.pay).
