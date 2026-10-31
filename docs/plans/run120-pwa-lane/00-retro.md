# Run #120 — Gate 0 Retrospective (PWA screens lane, 120%4=0)

## Baseline
- HEAD `a4f9fc6` (staging, in sync with origin at preflight 15:18Z).
- Last cycle: run #119 (DB & Infra) — P2-173 top-rated sort (PR #107) + snapshot repair (PR #106).

## Ledger check (kanban/DECISIONS.md FIRST)
- Drawer RIGHT-anchored owner standard re-affirmed 2026-10-04 — no drawer work this cycle; Reviewer B
  corrected the skill-file's stale LEFT-anchored checklist line against the ledger (ledger wins).
- Default+48h-veto: no open clocks; none proposed this run (P1-64 is a plain board TODO, not a clock row).
- No design/UX change this cycle contradicts any ledger row.

## Area audit (what this cycle touches)
- `apps/player-pwa/src/components/host/HostMatchForm.tsx` (448 lines) — koralink-only slot booking,
  deposit pre-check (`useWalletBalance`, `shortBy`), publish sheet with `classifyPublishError` mapping.
- `apps/api/src/modules/matches/matches.service.ts` `createMatch` (:1998-2259) — single-slot tx:
  slot FOR UPDATE → match insert → slot marked booked → guarded wallet debit (balance-floor predicate)
  → ledger `slot-booking-<slotId>` → host into match_players; `findOne` OUTSIDE tx; followers fan-out.
- Capacity derived from pitch size (never client); cost derived from hourly_rate × duration (P2-168
  exact-cents); hosting-terms consent gate before any write.
- Tech-debt note: partner-side recurring slot templates exist (`partner.service.ts:742`) but the PLAYER
  host path had no repeat story — hosts re-create the same weekly game by hand every week (P1-64).

## Previous-run verification (claims ≠ facts, run #119)
- P2-173: venues.sort.spec 6/6 + clubs-top-rated 5/5 re-run green; LIVE E2E re-probed — top_rated puts
  the two 4★ venues first (name tiebreak), unrated last; default order unchanged; junk sort 400.
  **DONE ✅.**
- PR #106 snapshots: content-true per content probe (0048 has venue_reviews, no dead rating col;
  0049 adds disputes.sla_escalated); journal/snapshot tripwires 8/8. **DONE ✅.**

## Findings → actions
- Reviewer A (PWA quality): CLEAN — zero CRITICAL/IMPORTANT; 2 documented MINORs (PaymentSheet direct
  fetcher import is pre-existing and lib-layered; DevLoginBar dev-only).
- Reviewer B (product gaps + design lens): all run-#119 claims TRUE; parity 1067/1067. ONE IMPORTANT
  design-lens finding: **clubs filter pills lack `aria-pressed`** (page.tsx:249-260) — screen readers
  cannot tell which filter is active. → BUILT THIS RUN as companion fix (small, same lane).
- Hex lane: clean (10/10 metrics at baseline).

## Fix:feat ratio
Recent cycle commits are feature-led (P1-55, P1-63, P2-173, P2-107, P1-51) with fix commits riding
review findings — ratio healthy (<1:1), no reactive loop.

## Recommendation
Proceed to Gate 1: P1-64 recurring matches (user-visible P1) + aria-pressed companion fix.
