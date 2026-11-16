# Settlement void path — Gate 0 Retrospective (run #195, 2026-11-08)

## Trigger
P2-285 (Reviewer B run #178): settlements have NO void/cancel path — a duplicate/erroneous
pending settlement row is only fixable via direct DB. Owner policy landed via Life OS portal
2026-11-07 (D-20261106-03, recorded in kanban/DECISIONS.md by a sibling session): **"Void
pending only, with audit trail."** That decision unblocks this build.

## ADMIN STATE CHECK (mandatory)
- `git status --short apps/admin apps/api/src/modules/partner` → CLEAN (no in-flight owner work).
- `git log --oneline -5 -- apps/admin` → PR #228 (P2-323 pitch error surfaces) is the latest
  settlements-adjacent landing; the settlements page itself last changed on P2-267 (PR #211-era).
- `systemctl --user is-active koralink-admin.service` → active. Tree safe to build against.

## Prior-commit audit (since run #194, 1846a43)
- No code commits landed since run #194's three merges (PRs #226/#227/#228) — clean baseline.
- Reviewer A (run #195): 0 CRITICAL / 0 IMPORTANT / 4 MINOR (unbounded bookedMatches list —
  follow-up row; tripwire regex form; ternary-chain readability; redundant endsWith — cosmetic).
- fix:feat ratio last 12 commits: 2 fix / 3 feat / docs — healthy.

## Tech-debt scan of the exact area to touch (settlements)
- `settlements.service.ts` pay(): conditional-update + TOCTOU guard + audit + ops broadcast —
  the shape the new void() must mirror.
- `settlement-revenue.ts` NOT EXISTS dedupe guard has **no status predicate** → a voided row
  would block re-settlement forever unless the guard skips voided rows.
- `settlements_venue_period_uidx` is a FULL unique index → after a void, regenerating the same
  (venue_id, period_start) is swallowed by onConflictDoNothing → the window stays unsettled.
  Needs a PARTIAL unique index (`WHERE status <> 'voided'`) in the same migration.
- `metrics.service.ts:62` pending_payouts SUM filters `status = 'pending'` → voided excluded
  correctly by default; pin with a tripwire.
- Admin settlements page (P2-267) already has the moneyActionFailure bucket pattern + drawer
  alerts — the void action reuses them (zero new error-surface invention).

## Standing decisions honored
- kanban/DECISIONS.md read FIRST (Gate supremacy): D-20261106-03 governs the void policy.
- No design/UX change contradicts the ledger (Drawer, RTL, error-copy standards untouched).
- Owner-only boundary respected: voiding is an ADMIN console action (operator-gated, audit-logged),
  not a factory-executed prod DB mutation.

## Verdict
PROCEED to Gate 1 — decision-backed, admin tree clean, area fully mapped.
