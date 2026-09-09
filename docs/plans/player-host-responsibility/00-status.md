# Player-Host Responsibility & Payout Regulation — Cycle Status

## ✅ CYCLE COMPLETE (2026-09-09) — Gate 4 executed and released to staging

| Gate | Name | Status | Artifact |
|------|------|--------|----------|
| 0 | Retrospective | ✅ APPROVED | [00-retro.md](./00-retro.md) |
| 1 | Product Spec | ✅ APPROVED (owner "proceed", with 2 revisions folded in) | [01-product.md](./01-product.md) |
| 2 | Architecture | ✅ APPROVED (joiner-warning surfaces added per owner revision 2) | [02-architecture.md](./02-architecture.md) |
| 3 | Program Design | ✅ APPROVED (234-line contract; migration renumbered 0039→0040 after sibling collision) | [03-program-design.md](./03-program-design.md) |
| 4 | Vertical Slices | ✅ COMPLETE — 4/4 slices shipped | commits below |

## Implementation record (staging)

| Slice | Commit | Delivers |
|-------|--------|----------|
| 1 | `5c03425` | Mode-aware labeling end-to-end: migration 0040 (HostPayoutState enum, is_player_hosted, host_payout_state, host_accepted_terms_at, match_players.fee_paid_sar), consent gate in createMatch (both modes, 400 pre-write), MatchCard badges (amber self / green koralink), detail banners, PaymentSheet + OngoingGameJoinSheet joiner warnings, PublishWarningSheet consent checkbox blocks publish, ToS sections (EN+AR, September 2026) |
| 2 | `a60a6a5` | Server-authoritative join payment: POST /matches/:id/join {idempotencyKey} charges fee INSIDE the join tx (no seat without payment); per-episode keys (run #20); replay no-recharge; 23505→409; PaymentSheet uses single fetcher call (client /wallet/pay two-step deleted) |
| 3 | `8f4c8a7` | Held host payout released EXACTLY ONCE on completion: releaseHostPayoutInTx (Σfees − margin×payers, floored 0; FOR UPDATE + guarded settle + per-match PRIZE key); wired into completeMatch + auto-complete; cancelMatch flips held→cancelled |
| 4 | `38c5e07` | Conditional refund matrix: REFUND_WINDOW_HOURS=4; leaveMatch engine (≥4h→refund; <4h+paid backfill→refund; <4h no backfill→forfeit to host); paid waitlist backfill (promoteNextInTx feePriceSar); removePlayer always refunds; cancelMatch/auto-cancel refund ALL payers; PWA refund toasts EN+AR; your_leave_refund in API response |

## Final verification (per factory rule, shown at each slice boundary)
- API: `npx jest` → **58 suites, 468/468 passed** (21 new money-safety specs)
- PWA: `npx vitest run` → **463/463 passed** (4 new consent-contract specs)
- Build: `npx turbo run build --force` → **3/3 successful** (slice-4 run EXIT=0; two earlier transient failures were sibling build races — each app verified green from clean `.next`)

## Deviations from the Gate 3 contract (documented)
1. Migration renumbered `0039_player_host_payout.sql` → `0040` (sibling took 0039 for conversations); journal idx 41, `when` bumped past sibling's future-dated 0039 entry to keep journal-parity spec green.
2. `chargeMatchFeeTx`/`creditWalletTx` live in `matches/match-fees.ts` (contract implied in-service helpers) — waitlist needs them for paid backfill without a circular import.
3. Auto-cancel payer sweep + payout flip gated on `is_player_hosted` (added to the Pass-2 SELECT) so venue-owned legacy rows keep the exact legacy behavior (auto-cancel atomicity spec still canonical).
4. `Insufficient balance` surfaces as 400 (matching wallet.service wording) rather than the contract's 409 sketch — the atomic-rollback guarantee is what matters and is tested.

## Known follow-ups (not blockers)
- PostHog events `host_payout_released` / `joiner_refunded` currently structured Pino logs; PostHog capture needs the T2 env fix noted in run #48 ops-log.
- Ops fallback release endpoint (manual payout retry if the scheduler is down >24h) deferred — scheduler failure isolation already prevents poisoning; add when ops load justifies it.
- E2E pass on staging with 2 wallets: join→complete→payout and join→leave(<4h, no queue)→forfeit.
