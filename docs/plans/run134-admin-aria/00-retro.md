# Run #134 — Gate 0 Retrospective

## Baseline
- Last run: #133 merged PR #134 (`19fe073`) — WS handshake origin gate + fmtTime locale rider.
- Branch `lane/run134-P2-199` from `origin/staging`; tree clean, no sibling drift in `apps/admin`.
- Admin state check: `apps/admin` + partner/admin API surface clean; `koralink-admin.service` active.

## What changed since last run
- No new user-visible admin commits; only `fbefaef` graphify refresh and `ba57fa3` run #133 report.
- Reviewers verified PR #134 claims (WS origin 403/200/200, fmtTime locale-aware) and surfaced no regressions.

## Technical debt observed
1. **API lint gate residue (run #132/133):** `npm run lint` failed with 72 `@typescript-eslint/no-unused-vars` errors across API source + tests. Root cause: no underscore-placeholder config and no test-file override, so fixture-heavy specs and intentional destructured placeholders were flagged.
2. **Hex drift:** `api_exc_total` moved from baseline 273 → 277; attributed to legitimate new guarded-update exceptions in recent API lanes (P2-202 venues/pitches + P2-185 WS origin gate), not boundary violations.
3. **Admin a11y gap:** `apps/admin/src` had zero `aria-pressed` attributes; toggle buttons (language, notifications, mobile menu) gave no pressed-state feedback to screen readers.

## Decision
- Build P2-199 (admin aria-pressed/current sweep) as the user-visible item.
- Carry API lint cleanup as the run's single hardening item (residue, owner-optional).
- Update hex baseline to 277 after attribution.
