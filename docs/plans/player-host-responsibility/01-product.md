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
- **P0-US4 (joiner protection)**: As a joiner who paid to join, if the match is cancelled (by
  host or automatically), my payment is **automatically refunded** to my wallet.
- **P1-US5 (server enforcement)**: As the platform, a seat is only granted when payment is
  verified **server-side** in the same transaction as the join — client can no longer create a
  free seat or lose money to a dropped call.
- **P1-US6 (visibility parity)**: The responsibility labeling appears identically on feed cards,
  my-games cards, and the match detail screen in EN+AR.
- **P2-US7 (ops fallback)**: As ops, if auto-verification fails at completion, the admin can
  mark a match "settled-by-ops" so the payout reg isn't a dead end.

## Scope
**IN**: schema (booker concept, host payout state machine), API (join-payment enforcement,
host payout release on completion, joiner refunds on cancel, new API fields), PWA (card badge
+ detail banner + host consent + wallet ledger labels), i18n EN+AR, ToS update, tests,
observability.
**OUT**: real-money gateway (P0-2), venue settlement regen, refund windows/partial refunds
(disputes flow exists), admin console UI work (only the service fallback method), changes to
self-booked matches' economics (self = free, no join fee).

## Success criteria
1. A player-hosted koralink-booked match shows the explicit responsibility label on feed card +
   detail (EN+AR), everywhere the match appears.
2. Host cannot complete booking without accepting responsibility terms; consent is persisted.
   (`host_accepted_terms_at` NOT NULL on new koralink matches.)
3. Joiners of player-hosted koralink matches pay at join; on cancellation every joiner
   automatically gets 100% refund to wallet + ledger REFUND row (idempotent).
4. Host payout released exactly once, only on Completed (manual, auto-complete, admin settle
   fallback), amount = collected fees − platform share, idempotent.
5. Join without verified payment → 402/409, no seat, no charge.
6. `turbo run build` green + all tests green, E2E money assertions pass.

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
