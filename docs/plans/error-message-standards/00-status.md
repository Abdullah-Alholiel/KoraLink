# Error Message Standards — Cycle Status

| Gate | Name | Status | Approved | Artifact |
|------|------|--------|----------|----------|
| 0 | Retrospective | ✅ APPROVED | autonomous ("do full implementation needed by a cycle") | [00-retro.md](./00-retro.md) |
| 1 | Product Spec | ✅ APPROVED | autonomous | [01-plan.md](./01-plan.md) |
| 2 | Architecture | ✅ APPROVED | autonomous | [01-plan.md](./01-plan.md) |
| 3 | Program Design | ✅ APPROVED | autonomous | [01-plan.md](./01-plan.md) |
| 4 | Vertical Slices | ✅ COMPLETE | build gate | see slices below |

## Slices

| Slice | Scope | Result |
|-------|-------|--------|
| 1 | `lib/error-classify.ts` + `errors.*` i18n (EN+AR) + Toast `detail` + publish-error delegation + classifier tests | ✅ vitest 7 new pass; publish-error tests untouched & green |
| 2 | Money flow: wallet top-up copy, PaymentSheet pay copy (reassurance wording) | ✅ |
| 3 | useMatchActions ×6, waitlist toasts, login/verify/complete-profile, profile export/delete, error.tsx | ✅ raw `err.message` grep-clean on audited surfaces |
| 4 | Standards encoded (factory skill pitfalls + kanban board) | ✅ |

## Hard-gate evidence (2026-09-06)

- `npx vitest run` (apps/player-pwa): **54 files, 389/389 passed** (was 370)
- `npm run type-check`: exit 0
- `npm run build` (root turbo): **EXIT=0, 3/3 tasks**, postbuild restarted `koralink-pwa.service`

## Out of scope (logged)

- M2: success-copy localization (English success toasts)
- `global-error.tsx` / `ErrorBoundary.tsx` copy alignment to `errors.*` (they have no i18n context in bootstrap; static copy acceptable)
- API-side copy contract (4xx messages) — unchanged by design
