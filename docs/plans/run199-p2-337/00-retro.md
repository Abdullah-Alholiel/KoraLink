# Run #199 — P2-337 Partner earnings settlement-status breakdown — Gate 0 Retro

Cycle: run #199 (2026-11-10 15:16Z, DB & Infra lane by rotation, item is Admin/user-visible).
Item source: Reviewer B run #198 P2 → boarded P2-337; re-confirmed by Reviewer B run #199
(claims pass: per-row badges exist at earnings/page.tsx:203-211 + drawer, but NO aggregate
status counts anywhere; settlement status data already rides the payload → pure UI
aggregation gap + cadence hint needs one additive API field).

## Ledger check (DECISIONS.md first)
- No ledger row contradicts this item. P2-285 (settlement void policy) was DECIDED by owner
  (D-20261106-03) — voided settlements EXIST in prod data (feature shipped run #195, PR #229),
  so surfacing a `voided` count is consistent with the ledger, not a new policy.
- Money display: formatMoney + numerals standard (P2-257b lineage) — reuse, no new money paths.

## Recent-commit audit (fix:feat)
Last 8 commits: 3 feat/fix code PRs (#233/#234/#235) + docs. No reactive fix loop; the
three #198 merges re-verified live this run (E2E audit-logs probes + dist/chunk greps).

## Tech debt in the touched area
- earnings page carries CSV (P2-178), payout request (P2-3), trend (P1-65) — all clean;
  reviewer A found only cosmetic MINORs (settings page, not this file).
- getEarnings empty-scope early return + main return both need the new fields (union shape).
- settings service is optional-param in PartnerService (legacy-spec pattern) → cadence
  read must guard `this.settings ?` → fallback 7 (same as requestPayout:176).

## Admin state check (Phase 3.5 step 0)
- `git status --short apps/admin apps/api/src/modules/partner apps/api/src/modules/admin` → CLEAN.
- Last admin commits: e244fdd (audit filter), c09254c (settings stale-guard) — both mine/factory.
- koralink-admin.service active. Routes exist: partner/earnings present with live page.

Verdict: PROCEED to Gate 1.
