# Run #238 — Gate 0 Retrospective (P2-410 admin a11y slice)

**Item:** P2-410 residual — reports/[id] resolve/dismiss outcome chips lack `aria-pressed` (+ Reviewer A #238 riders: `role="alert"` on saveError, api.ts timeout throw shape).
**Rotation:** 238 % 4 = 2 → Admin lane (matches run #237 recommendation).

## Area audit
- Recent admin commits (git log -12): P2-412 offline choke-point (18e82d53), P2-413 classify split (1520ed88), P2-414 section sentinel (a78be9c0), P2-408 login offline (e5522540), P2-401 localized errors (3d3e2fe2). Cadence healthy: all PR-merged with bot reviews, no fix:feat spike.
- ADMIN STATE CHECK (Phase 3.5 step 0, run in shared tree): `git status --short apps/admin` = CLEAN → no Abdullah in-flight work, no ADMIN HOLD. koralink-admin.service active. Dashboard routes present as expected.
- Claims≠facts on Reviewer A #238: use-data/use-live-data raw-error IMPORTANT **REFUTED** (documented P2-400d ops-line exemption, board row P2-401: census = exactly those 2). Chips/role-alert/timeout findings **CONFIRMED** by parent code read (reports/[id]/page.tsx:258-310, api.ts:88-104).
- Claims≠facts on Reviewer B #238 part-2: users bare loading ✓ real, disputes 0 `!online` ✓ real, audit 0 `can()` ✓ real (all P2-class → one consolidated backlog row, this run is not that sweep).
- Run #237 claims (PR #308 P2-254): Reviewer B verified all 4 (service + fire points + deep-link test + spec file) — board row updated to VERIFIED.
- Hex audit: CLEAN 11/11 at baseline (355/27/1).
- Prior half of P2-410 (Sidebar aria-current, filter selects) closed premise-refuted run #236; this slice closes the row's last confirmed gap.

## Tech-debt notes
- Sentry 1C (Neon quota) ×106/24h — unchanged root cause, owner-gated (Coolify cutover). 1F ×20 same cause.
- STATE notes field near cap — restructure note carried from run #237 directive; done in Phase 5 this run.
