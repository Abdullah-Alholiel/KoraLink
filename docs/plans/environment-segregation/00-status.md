# Environment Segregation — Cycle Status

| Gate | Name | Status | Approved | Artifact |
|------|------|--------|----------|----------|
| 0 | Retrospective | ✅ DONE (auto — no blockers found) | — | [00-retro.md](./00-retro.md) |
| 1 | Product Spec | ⏸️ PENDING APPROVAL | — | [01-product.md](./01-product.md) |
| 2 | Architecture | ⏸️ PENDING APPROVAL | — | [02-architecture.md](./02-architecture.md) · [env-matrices.md](./env-matrices.md) |
| 3 | Program Design | 🔒 BLOCKED | — | — |
| 4 | Vertical Slices | 🔒 BLOCKED | — | — |

## Planned slices (Gate 4 preview)

1. **S1 — Branch split + staging deploy script**: create `staging` branch, VPS clone tracks it,
   `scripts/deploy-staging.sh` + first full staging deploy, health matrix green.
2. **S2 — Env segregation**: staging CORS drops Vercel origins; Render env-vars set to
   production identity (NODE_ENV, CORS-only-Vercel, SENDER_ID); `NODE_ENV=staging` flip on VPS
   API; dev-login regression on VPS.
3. **S3 — Observability split**: `NEXT_PUBLIC_SENTRY_ENV` in both Sentry client configs +
   env files; verify one tagged event per env.
4. **S4 — Prod-prep runbooks**: promote flow, Neon reset + migration application, Unifonic
   AppSid wiring + dev-login flip; Vercel env-var handoff list for Abdullah.

## Decisions log

- 2026-09-08: Staging = VPS quartet ONLY (no new Vercel staging projects) — per Abdullah's
  message; simpler and matches "vps dev pwa and admin, vps prod backend, vps postgres".
- 2026-09-08: `main` stays the production branch (Render+Vercel already track it); `staging`
  is NEW and becomes the factory working branch. No origin re-pointing needed.
