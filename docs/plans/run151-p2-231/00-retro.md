# Run #151 — P2-231 Typing Moderation-Gate TTL Cache — Gate 0 Retrospective

**Date:** 2026-10-21 (01:15Z cron fire) · **Rotation:** run 151 % 4 = 3 → DB & Infra · **Mode:** autonomous

## Area audit (what we touch)

- `apps/api/src/modules/gateway/app.gateway.ts` — WS gateway. The P1-48 mid-session
  moderation gate (`requireActiveUser`, :293-313) runs a 3-column users-table PK SELECT
  on EVERY state-changing event (:336, :372, :389, :634, :682, :714, :739, :766, :794).
  The two typing handlers fire per ~2.5s per typing user (client-driven re-emit),
  so a 20-player lobby with typing indicators generates ~8 gate SELECTs/sec sustained.
- Recent history of this file: P2-220 match-chat tx serialization (PR #151, run #146),
  WS twin (PR #152, run #147), P2-225 conv-typing relay (PR #154, run #149), P2-227
  DM-send serialization (PR #154, run #149). All landed via lane PRs with guard-chain
  tripwires updated; the file carries a live `ws-gate-coverage.spec.ts` pin asserting
  every gated handler's source contains `await this.requireActiveUser(` as first await.

## Tech-debt finding → this cycle

Reviewer A (run #150, IM2) boarded **P2-231**: the typing handlers don't need a
fresh read on every burst event — messages do (money/content safety), typing signals
are read-feel only. Same shape pre-exists in the match handler; fix both.

## DECISIONS.md check (owner-standards doctrine)

No design/UX change: this is pure backend perf hardening with an explicit, documented
moderation-lag tradeoff (≤10s for typing-only signals; message sends stay uncached).
No ledger row contradicts it. **Proceed.**

## Standing bug-class sweep (Reviewer A run #151)

::uuid casts: none outside regression tripwires · eq(col,null): none · console.* in
API src: zero · i18n parity: 1099 = 1099 · hydration/z-index: conform. Migrations
discipline sound (56 SQL files, journal through 0053, hand-written convention intact).

## Gate 0 verdict

Proceed to Gates 1-3 compact (01-program-design.md), then Gate 4 via zeroshot lane
`lane/run151-p2-231` (preconditions verified: Pro OAuth + zeroshot 10.7.0 + vertical
slice + no admin-area files + no live-DB dependency).
