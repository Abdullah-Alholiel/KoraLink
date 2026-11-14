# Run #157 — Gate 0 Retrospective (compact)

**Date:** 2026-10-23 ~01:16–02:00Z · **Rotation:** 157 % 4 = 1 → API modules (security lens) ·
**Ledger:** kanban/DECISIONS.md checked first — no design/UX change proposed this cycle; no
contradictions.

## Continuity

STATE said `last_run: 156` (report `2026-10-22T15-37Z-run156.md`); this fire = **run #157**
(01:15Z slot). Cron pin verified intact at boot (`glm-5.3-flash`/`zai` — run #154's self-heal
held, no drift recurrence); delegation.* verified clean; GLM probe 200 in 1.9s (z.ai weekly 1%).

## Recent-cycle audit

- `79166e6` docs run #156 · `f33e94c` P2-193 refund/payout pushes (PR #163, live-deployed) ·
  `fafec0b`/`6dff738` run #155 docs · `b4e93c6` PR #162 payment/wallet hardening.
- fix:feat ratio healthy — recent merges are reviewer-driven hardening rounds with triaged
  PR-Agent findings, not regression churn.
- Hex audit: all 10 metrics flat vs baseline 283 → **HEX LANE: clean**.
- Strix monthly gate: Oct 23 → not due (window = 1st–3rd).

## Findings triaged this cycle (claims ≠ facts — verified in code before boarding)

- **Reviewer A IM-1 CONFIRMED:** `creditWalletTx` (match-fees.ts:129-140 pre-fix) had NO replay
  pre-check and an UNGUARDED balance UPDATE — diverges from its own debit twin
  `chargeMatchFeeTx` and from `wallet.service.recordTransaction`, both of which guard. Risk:
  silent ledger/balance divergence on vanished rows; raw 23505→500 on concurrent same-key
  refunds. → **P2-242, built this run (PR #165).**
- **Reviewer A IM-2 PARTIALLY REFUTED, kernel CONFIRMED:** the claimed removePlayer↔leaveMatch
  double-credit CANNOT happen — `transactions.idempotency_key` is UNIQUE (schema.ts:548) and the
  shared `refund-join-<episode>` key makes the loser abort. The REAL defect: the loser dies with
  an unhandled 23505 → raw 500 (creditWalletTx had no replay path). Fixed by the same P2-242
  replay pre-check; recorded as refuted-with-kernel so the board carries the accurate shape.
- **Reviewer A MINOR (forfeit typing) CONFIRMED:** host-forfeit credit typed REFUND +
  reference_id `forfeit:<episode>` — not a refund to any payer; folds into P2-242 (ADJUSTMENT).
- **Reviewer A MINOR (auto-cancel fan-out) CONFIRMED:** post-commit activities/push/waitlist
  fan-out unguarded (matches.service.ts:960-1010 pre-fix) — scheduler tick surfaced provider
  throws after the cancel committed. → **P2-243, built this run (PR #165).**
- **New sibling finding (parent):** auto-cancel's koralink-slot refund (matches.service.ts:925-938)
  is a RAW ledger insert with the key `refund-<matchId>` — same shape chargeMatchFeeTx replaced
  for fees in the run-#20 generation. No same-match double-cancel is reachable today (guarded
  status flip), but the site should unify onto creditWalletTx when touched. → **P2-244 (noted,
  not built — scope discipline).**
- **Reviewer B product gap: wallet withdraw is a fake button** (wallet/page.tsx:271 —
  `active: false` + comingSoon toast; no withdraw endpoint exists). Real gap, but cash-out is a
  payout-rail product decision (PSP-adjacent, owner-gated per the defaults register) → surfaced
  in the owner decisions queue, NOT boarded as buildable.
- **Reviewer B P2s (review moderation/reporting, review helpful-votes, push-category UI depth)
  → backlog P2-245** (review moderation as the anchor item; votes + push-UI-depth folded as
  sub-notes).

## Previous-run verification (run #156 claims)

- PR #163 merged f33e94c + live in dist + money-notify spec: **VERIFIED** (Reviewer B, files+
  dist greps). P2-144 closure: **VERIFIED** (7 export pages wired; PR #145 diff is
  earnings-scoped, no collision). 1C Sentry: parent re-read — 26 events total on the issue,
  only 2 since run #156's window (Oct 22 20:00Z + Oct 23 00:00Z): active but low-rate; owner
  action unchanged (Neon billing).

## Gate 0 verdict

Proceed to Gate 4 (compact Gates 1-3 in 01-program-design.md): P2-242 + P2-243 as the build
item (API lane, security lens, money-path hardening), PR flow on lane/run157-credit-guard.
