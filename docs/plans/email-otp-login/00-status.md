# Email + OTP Login — Cycle Status

| Gate | Name | Status | Artifact |
|------|------|--------|----------|
| 0 | Retrospective | folded into environment-segregation v2 (same day) | — |
| 1 | Product | ✅ | 01-product.md |
| 2 | Architecture | ✅ (phone-nullable 0038, P2-11 responseToken exception, email-keyed caps) | 02-architecture.md |
| 3 | Program Design | ✅ (contracts locked) | 03-program-design.md |
| 4 | Vertical Slices | ✅ 5/5 on staging — 449 jest + 422 vitest green, build 3/3, deploy H1–H6 ×2, live E2E matrix pass (see kanban/RUNS/2026-09-08T16-11Z-run46.md) | — |
| Promote | T2 — **AWAITING EXPLICIT GO** (Neon migration first, then PR staging→main) | ⏸️ | runbooks/prod-migrations.md |

## Post-promote checklist
- [ ] Neon: reconcile journal (36 vs VPS 40), apply missing incl. 0038, verify, journal
- [ ] PR staging→main, CI green, merge
- [ ] Render deploy live + /api/v1/health 200
- [ ] Vercel ×2 READY; chunk-grep prod API origin; dev-login markers absent
- [ ] CORS: Vercel origin allowed / staging rejected
- [ ] (User) Resend sending-domain verified → prod OTP reaches arbitrary recipients
- [ ] (Later) turn dev-login OFF on prod once email OTP is the proven path (otp-go-live.md)
