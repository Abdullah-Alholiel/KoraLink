# Gate 1 — Product Spec: Interactive Completeness Remediation

**Feature:** `interactive-completeness-remediation`  
**Date:** 2026-08-09

---

## Scope: 10 fixes across 8 files

### Slice 1 (Critical)
- C-1: DevLoginBar populates Zustand before redirect
- C-2: Messages page uses extended `useMyMatches` from `useUser`
- I-1: BottomNav highlights Profile tab for sub-pages

### Slice 2 (Important)
- I-2: Play search bar → functional `<input>` with client-side filter
- I-3: Wire or remove 4 dead icon buttons
- I-6: Wallet shows skeleton during balance load

### Slice 3 (Minor)
- M-1: Complete-profile camera wired to personal-info
- M-2: Fix DevLoginBar seeded phone numbers

## Success Criteria
| # | Criterion |
|---|-----------|
| SC-1 | Dev-login → Zustand populated → join detection works |
| SC-2 | Messages page shows host_name, match_type, pitch data |
| SC-3 | BottomNav highlights Profile when on /my-games or /personal-info |
| SC-4 | `turbo run build` zero errors |
| SC-5 | `npx vitest run` 85/85 pass |
