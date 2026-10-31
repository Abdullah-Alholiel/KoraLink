# Run #176 — Gate 0 Retrospective (PWA screens lane, 176 % 4 = 0)

## Scope of this cycle
PWA screens lane. Recent cycle commits: `d3f83f3` (PR #193: P2-275 snapshot-chain
metadata repair + P2-276 topup callback money-truthful errors), `225a079` (P2-273
refund input), `fededb1` (P1-29 dispute refunds), `57b46ca` (P2-195 dispute tracking).

## Audit of the area touched this run
- `apps/player-pwa/src/lib/fetcher.ts` — Hunt run-#175 R4-1 (boarded P2-278):
  `fetcher()` attaches `Authorization: Bearer <localStorage JWT>` to ANY absolute
  URL a caller passes (line ~114). One compromised/buggy call site could exfiltrate
  the token cross-origin. Prod exposure low (cookie-only per P2-240) but the token
  path serves dev-login/cross-site flows — this run's hardening pick.
- No absolute-URL fetcher call sites exist in `src/` today (grep: zero) — the gate
  is purely preventive with zero behavior change on current callers.
- PR #193 area re-verified clean by Reviewer A (map↔i18n↔test consistent; 6/6 spec;
  note: run-#175 prose named `callbackAmountMismatch` but the shipped key is
  `callbackChargedDeclined` — PR-Agent r1 consolidation; stale prose, not code).

## Recent-commit pattern
fix:feat ratio healthy (mostly feat/fix with docs tails); no reactive fix loop.
No bare-row mutations touched (no API code this run).

## DECISIONS.md consulted (Gate-0 supremacy)
No design/UX change this run touches a ledger row. Wallet copy conventions
(money-truthful errors) were set by P2-276 and are respected.

## Full-stack connectivity audit
N/A this run (no data-flow feature). Previous-run verification handled by
Reviewer B: all 5 run-#175 claims PASS (d3f83f3 ancestry, live callback chunk
carries new copy, board rows DONE, i18n parity, tripwire spec exists).

## Findings → cascade
- Reviewer A: 0 CRITICAL / 0 IMPORTANT / 3 MINOR (role="status" vs "alert" on the
  callback failed branch — a11y polish, folded into P2-248 pickups; prefix-map
  precision note — pinned by test, no action; intentional single-fire deps — none).
- Reviewer B: claims (a)-(e) all PASS; product gaps: I-1 failed-topup leaves no
  wallet-visible trace (boarded P2-279), I-2 join fee discoverability spot-check
  (boarded P2-280), M-1..M-4 noted in board backlog row P2-281.

## Decision: proceed to Gate 4 via compact Gates 1-3 (autonomous mode)
Build pick = P2-278 (fetcher origin allowlist) — small, precise, boarded TODO,
no open PR collision (only #178 promote is open, unrelated).
