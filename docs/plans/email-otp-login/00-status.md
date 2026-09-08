# Email + OTP Login — Cycle Status

| Gate | Name | Status | Artifact |
|------|------|--------|----------|
| 0 | Retrospective | folded into environment-segregation v2 (same day) | — |
| 1 | Product Spec | ✅ | [01-product.md](./01-product.md) |
| 2 | Architecture | ✅ | [02-architecture.md](./02-architecture.md) |
| 3 | Program Design | ✅ | [03-program-design.md](./03-program-design.md) |
| 4 | Slices | 🔄 | slice table below |

Autonomy: "continue in best standard" standing directive; owner made the P0-9 call
(email OTP via Resend). Implementation proceeds on `staging` when `kanban/LOCK.json` is free.

## Slices

| # | Slice | Status |
|---|---|---|
| 1 | migration 0038 + schema phone nullable + redaction null-safe | 🔄 |
| 2 | ResendService + email-otp.service + endpoints + DTOs (+ tests) | ⏳ |
| 3 | PWA: login toggle + email form + verify channel + hooks + i18n EN/AR | ⏳ |
| 4 | staging deploy + live E2E (dev box) + dev-login regression | ⏳ |
| 5 | promote PR → prod; Render RESEND_API_KEY; real-email E2E gate | ⏳ (T2 promote = Abdullah) |

## Decisions

- 2026-09-08: Email OTP via Resend (P0-9 owner call). Unifonic/SMS remains future.
- 2026-09-08: P2-11 body-token exception on verify endpoints, explicit `responseToken` opt-in
  (third-party-cookie reality on Render↔Vercel cross-origin; obsoleted by Phase-2 same-domain).
