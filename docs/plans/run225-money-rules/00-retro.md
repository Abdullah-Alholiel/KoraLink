# Run #225 — Gate 0 Retro: money rules (D-20261115-04, D-20261113-10)

## Money map before this run
- `cancelMatch` (matches.service.ts): status flip → waitlist clear → held host payout
  → `cancelled` → 100% joiner refund sweep (`refund-join-<mpId>`) → koralink slot release
  + **unconditional** 100% host pitch refund (`refund-<matchId>`). No time-of-cancel rule.
- `markNoShow`: flag write + `no_show_count` adjust + auto-dispute. **No money moved** and
  no karma effect, although terms section 2 already promises a karma consequence.
- Shared money primitives: `chargeMatchFeeTx` / `creditWalletTx` (match-fees.ts) run in the
  caller's tx, do a replay pre-check on (idempotency_key, user_id), and rely on the UNIQUE
  key as the race gate.

## What changed
- **Rule A:** `cancelMatch` reads `scheduled_at` under the existing FOR UPDATE lock. New pure
  helper `isLateHostCancel(scheduledAt, nowMs)` (exported from matches.service.ts):
  late = not started AND < 12h to kick-off. Late → slot still released, host credit skipped,
  `forfeitedSar` set, `pitch_forfeit` push (new key in push-text.ts, EN+AR) instead of
  `refund_credited`. Joiner sweep untouched. Log line now carries `forfeitedSar=`.
- **Rule B:** `markNoShow` reads `price_per_player` (match, still `.for('update')`) and
  `fee_paid_sar` (roster row). On a real flip: karma ±5 (`GREATEST(..,0)` / `LEAST(..,100)`,
  constant `NO_SHOW_KARMA_PENALTY`) in the same users UPDATE as `no_show_count`. Flip to true
  on a paid seat → `chargeMatchFeeTx(..., 'noshow-fee-<mpId>')`. Flip to false with a prior
  fee row → `creditWalletTx(..., 'noshow-fee-reversal-<mpId>', 'REFUND')` for the exact
  ledger amount. Dispute auto-open/close still runs after the money writes. `noshow_fee` log
  line post-commit.
- Terms: `legal.termsRefundBody5` + `legal.termsConductBody5` (EN+AR, key counts equal).
  **Naming deviation:** the brief asked for `termsCancelBody5` next to `termsCancelBody4`,
  but no `termsCancel*` keys exist. Section 6 "Refunds and cancellation" uses `termsRefund*`,
  so the new key follows that sibling.
- Lawyer brief §4.1 added. New spec `matches.money-rules-126.spec.ts` (11 tests).

## Residual risk
- **Terms page not wired:** `apps/player-pwa/src/app/[locale]/terms/page.tsx` lists its
  paragraphs explicitly, so the two new keys do not render until that file is extended. That
  edit was outside this lane's scope (PWA edits were limited to messages). It must ship before
  launch condition 6 can be called disclosed.
- Once-per-episode keys: mark → clear → mark leaves the player **uncharged** (the fee and its
  reversal both stand; the second charge replays). Chosen over any double-charge risk; flagged
  to counsel.
- The no-show fee is only debited; it is not credited to the host or venue. Where it goes is
  undecided.
- An unaffordable fee rejects the whole mark (400), so the host cannot record a no-show for a
  player with an empty wallet. This is correct per the brief, but ops should watch for host
  complaints.
- The scheduler auto-cancel path (`refund-${row.id}`) is unchanged: system cancels always
  refund.
