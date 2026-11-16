# Run #83 — Program Design: P2-120 deletePitch owner-scope-in-tx (+ journal 0043 alignment)

**Cycle:** run83-p2-120-deletepitch-owner-scope · **Status:** all gates complete (autonomous mode)

| Gate | Name | Status | Artifact |
|------|------|--------|----------|
| 0 | Retrospective | ✅ DONE | [00-retro.md](./00-retro.md) |
| 1 | Product Spec | ✅ compact | below |
| 2 | Architecture | ✅ compact | below |
| 3 | Program Design | ✅ compact | below |
| 4 | Vertical Slices | ✅ DONE | PR #45 squash `beedc2f` |

## Gate 1 — Problem / story / scope

- **Problem:** a venue-owner whose venue was transferred away mid-session could still
  delete a pitch on it: authorization ran before the tx, the tx re-scoped by id only.
- **User story:** as the platform, only the CURRENT owner (or an Admin) may delete a pitch,
  decided atomically at delete time — not at page-load time.
- **IN:** owner scope in tx SELECT+DELETE; affected-row guard; journal 0043 metadata fix.
- **OUT:** cascade/history guard (already correct, P2-105); UI changes; admin path changes.

## Gate 2 — Architecture delta

Single method change: `PartnerService.deletePitch` builds `scope` once
(admin → `eq(pitches.id, pitchId)`; otherwise `and(eq(id), owner-subquery)`), applies it to
the locked SELECT and the DELETE. Spec stub extended (rendered-SQL assertions).

## Gate 3 — Contract (verified ✓)

- Success: `{ deleted: true }` (unchanged); broadcastOps('venues') only on real delete.
- Stale-owner / non-owner / mid-flight-scope-miss → `NotFoundException('Pitch not found.')`.
- History>0 → `BadRequestException('This pitch has N match(es) in its history…')` (unchanged).
- Checklist: mutation returns the same public shape as before ✓; no silent undefined ✓;
  no i18n keys needed (API-only, existing error text) ✓; varchar(36) — no ::uuid casts ✓;
  tests assert rendered SQL (`PgDialect.sqlToQuery`) incl. `::uuid` absence ✓.

## Gate 4 — Slices (all landed in PR #45)

1. Owner scope on tx SELECT+DELETE + 5 spec cases (`129cbd6` on lane).
2. Affected-row guard on DELETE (PR-Agent MINOR) + stub `.returning()` + 1 case
   (`e41d798` + `6686688`).
3. Journal 0043 `breakpoints: true` normalization (rides slice 1).

**Gates (merged tree `beedc2f`):** turbo build 3/3 · vitest 760/760 · api jest 724/724 ·
tsc 0 · owner-scope string ×2 + NotFound ×5 grep-verified in serving dist · API restarted,
/health 200.
