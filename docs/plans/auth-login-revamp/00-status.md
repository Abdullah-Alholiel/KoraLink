# Auth Login Revamp — Cycle Status

| Gate | Name | Status | Approved | Artifact |
|------|------|--------|----------|----------|
| 0 | Retrospective | ✅ APPROVED (off-schedule fire, defects) | Abdullah (direct request) | [00-retro.md](./00-retro.md) |
| 1 | Product Spec | ✅ APPROVED (P0 fixes) | Abdullah (direct request) | [01-product.md](./01-product.md) |
| 2 | Architecture | ✅ WRITTEN | autonomous (P0 fixes) | [02-architecture.md](./02-architecture.md) |
| 3 | Program Design | ✅ WRITTEN (inside 02) | autonomous (P0 fixes) | [02-architecture.md](./02-architecture.md) |
| 4 | Slices S1–S3 (P0 fixes) | ✅ BUILT + LIVE-VERIFIED | — | commit `fix(pwa): single-OTP signup…` on staging |
| 3→4 | Channel-affordance stance (A/B/C) | ⏸️ PENDING ABDULLAH'S PICK | — | `sketches/005-auth-login-revamp/variants.png` |
| 4 | Slice S4 (channel affordance) | 🔒 BLOCKED on the pick | — | login/page.tsx + i18n |

## Verification evidence (2026-09-17)

- vitest: **574/574** (82 files) — includes new `test/app/auth-signup-login.test.tsx`
  (7 regression cases) + null-user promote case in `useAuth.test.tsx`.
- `npm run type-check` (tsc --noEmit): clean — CI parity.
- `npm run build` (player-pwa): ✓ Compiled successfully; postbuild synced standalone +
  restarted koralink-pwa.service.
- **LIVE E2E on :3000** (`sketches/_render/probe-auth-signup.js`, real OTP from API
  journal — staging has no UNIFONIC_APP_SID, codes are logged not SMSed): **8/8 PASS**
  for phone 573597268: send → back (draft retained) → ONE code → verify →
  complete-profile → /play authenticated. Journal shows exactly ONE "Skipping SMS"
  for the probe phone (single send).
- Bonus fixes found during verification: complete-profile Save double-send guard
  (journal caught two PATCHes in one second); `t('verify.profileFetchError')` →
  `t('profileFetchError')` (raw key rendered on the error path).
- Known follow-up (not this cycle): handle collisions on common names —
  complete-profile derives handle from full_name and a taken handle surfaces the
  generic validation copy; should get a specific localized error + editable handle.
