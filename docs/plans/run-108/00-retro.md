# Run #108 — Gate 0 Retro + Program Design (compact, autonomous mode)

**Cycle:** run #108 (2026-10-06 15:18Z) · branch model: lane PRs → staging · rotation: run#%4=0 → PWA lane

## Gate 0 — Retro

**Baseline:** `9f3349b` (staging, post-run-#107).

**DECISIONS.md consulted first** (owner-standards supremacy): no row contradicts this cycle's
work. P2-147's default (full-set-with-cap) survived its 48h veto window (elapsed 10:16Z, no veto
line in chat or board — re-checked at 15:20Z). Attribution: the default was proposed by run #102
per the owner-approved Defaults+48h-Veto register (2026-10-04 chat go-ahead); today's build is
**factory-built (owner-optional)** — the veto clock is the owner's channel, and it passed clean.

**Admin state check (Phase 3.5 step 0):** `apps/admin` + partner modules CLEAN (no in-flight
edits), admin service active, recent log: PR #88 csvAmount fix (44efff1). No ADMIN HOLD.

**Recent-commit audit:** three XS fixes merged via PRs #87/#88/#89 (LIKE-escape sweep, CSV null
wallet cell, reschedule toast i18n). fix:feat ratio this stretch is high but they were audit
remediations, not regressions. Standing bug classes (per Reviewer A, this run): all zero.

**Findings carried in:** Reviewer B (run #108) IMPORTANT → new **P2-160**: club-detail venue
error state had generic copy + no retry on a booking-entry surface (inconsistent with match
detail's classify+retry standard). Boarded this run, built this run.

## Gates 1–3 — Program design (both items)

### P2-147 — full-set-with-cap CSV exports (7 admin pages)
- **User story:** as an admin I export the whole filtered dataset, not the 20 rows on screen;
  the note tells me the true count and warns when the 10k cap truncated the export.
- **Contract (verified live before merge):** GET /admin/{users,matches,transactions,settlements,
  disputes,reports,audit-logs}?page&perPage → `{ <key>, total, page, perPage }`, perPage @Max(100);
  audit key = `logs` (audit.controller.ts:46) — the others are the plural resource names.
- **Design:** frontend-only. `fetchAllForExport` loops perPage=100 (max 200 iters, stop ≥10k or
  short page) → `runFullExport` in use-export-feedback (one-at-a-time, abort-on-unmount, Sentry +
  trackEvent on error, mode-aware notes) → pages pass a `build(allRows)` closure; exportCsv /
  formula-guard untouched. i18n: exportAllSuccess/exportCapped/exporting/exportAllFailed, EN+AR.
- **Gate-3 checklist:** mutation contract N/A (no API change) ✓ · envelope keys verified live
  (ENVELOPE_CONTRACT_OK, all 7) ✓ · no new adapter (rows feed existing exporters) ✓ · i18n keys
  in both locales, parity 662/662 ✓ · button disabled while exporting + existing conditions ✓.

### P2-160 — club-detail venue error: classified copy + Retry
- **User story:** a transient network blip on a club page shows what happened (localized per
  status) and a Try Again button — no dead end on a booking-entry surface.
- **Design:** render-only; mirror match/[id]/page.tsx exactly: `t(errorKey(classifyError(error)))`
  + `common.retry` wired to `useVenue().refetch`. Guard `!venue` so stale-data render survives a
  failed refetch. Zero new i18n keys (errors.* + common.retry already exist, both locales).
- **Gate-3 checklist:** no API change ✓ · keys exist both locales ✓ · SSR/hydration unchanged ✓.

## Gate 4 — slices
1. P2-160: edit → vitest 122f/898t + type-check 0 → commit `19ac6d2` → **PR #90**.
2. P2-147: lane build (zeroshot 01a111da) → parent re-apply → turbo 3/3 + admin --force rebuild →
   live E2E envelope probe → commit `c8abd4d` → **PR #91**.
