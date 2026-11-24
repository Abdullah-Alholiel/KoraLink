# Run #227 — Gates 1–3 Compact: P2-400 part 2 (Admin RBAC wiring + section dedupe)

## Problem
HQ write surfaces (settlements pay/void/generate, transactions refund, users ban/suspend,
matches edit/cancel, venues approve) render action buttons for EVERY role that can reach the
page; only the API 403 stops a Partner/VenueOwner. Users see buttons that fail with raw 403s.

## User story
As a VenueOwner-partner using the ops console, I should never see an HQ-only action button
(pay settlement, refund transaction, ban user) that will 403 when tapped.

## Scope
IN: wire `can(role, action)` gates on all HQ write affordances (hide/disable + why-hidden is
role, not data); single-source the section list in rbac.ts (sectionForPath derives from
SECTION_BY_ROLE keys); vitest setup in apps/admin + rbac-census tripwire + rbac parity tripwire.
OUT: backend permission changes (API remains the boundary); (d) LoadError raw-reason (accepted);
(f) Intl money (premise-stale); new RBAC roles/actions (RBAC design = owner-gated).

## Contract (exact shapes)
- `can(role: Role | null, action: ConsoleAction): boolean` — UNCHANGED signature.
- Gate shape per surface: `const canPay = can(role, 'settlement.pay')` — hide button +
  optionally render a localized "HQ-only" hint; NEVER gate on data state alone.
- Mutations keep their existing hooks/bodies; ONLY affordance visibility changes.
- i18n: reuse existing keys where present; new keys ONLY if a surface needs an
  explicit "not permitted" hint (both locales, parity checked).

## Files changed
- apps/admin/src/app/(dashboard)/settlements/page.tsx — pay/void/generate gated
- apps/admin/src/app/(dashboard)/transactions/page.tsx — refund gated
- apps/admin/src/app/(dashboard)/users/page.tsx — ban/suspend/setRole gated (if write UI exists)
- apps/admin/src/app/(dashboard)/matches/ — edit/cancel gated (if write UI exists)
- apps/admin/src/app/(dashboard)/venues/ — approve/transfer gated (if write UI exists)
- apps/admin/src/lib/rbac.ts — sectionForPath derives from SECTION_BY_ROLE (single source)
- apps/admin/test/rbac-census.test.ts (NEW) — mutation-bearing pages must reference `can(`
- apps/admin/test/rbac-parity.test.ts (NEW) — ACTION tokens ↔ ACTIONS_BY_ROLE consistency
- apps/admin/package.json + vitest.config.ts + tsconfig (test setup, type-check includes tests)

## Verification checklist (Gate 3)
- [x] rbac.ts `can()` signature unchanged — pure wiring
- [x] Every HQ mutation affordance its exact existing action token (no new tokens invented)
- [x] API stays the security boundary (no backend edits)
- [x] Any new i18n key exists in BOTH en.json and ar.json
- [x] Tripwire specs pin the census so regression = red test
