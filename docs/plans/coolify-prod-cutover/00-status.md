# Coolify Prod Cutover — Cycle Status

| Gate | Name | Status | Approved | Artifact |
|------|------|--------|----------|----------|
| 0 | Retrospective | ✅ DONE | auto (user mandate) | [00-retro.md](./00-retro.md) |
| 1 | Product Spec | ✅ DONE | auto (user mandate) | [01-product.md](./01-product.md) |
| 2 | Architecture | ✅ DONE | auto (user mandate) | [02-architecture.md](./02-architecture.md) |
| 3 | Program Design | ✅ DONE | auto (user mandate) | [03-program-design.md](./03-program-design.md) |
| 4 | Vertical Slices | ⏸️ **AWAITING USER GO** to start Slice 0 | — | [04-vertical-slices.md](./04-vertical-slices.md) |

**Pre-Gate-4 verification:** `env -u NODE_ENV npx turbo run build` → 3/3 successful, 0 errors (full output captured at Gate 3 → 4 boundary).

## Slices

| # | Slice | Tier | Status |
|---|---|---|---|
| 0 | Delete Supabase stack | T1 | ⏸️ ready to start |
| A | Close public funnels :10000 + :8443 | T1 | ⏸️ ready |
| B | Rebind Coolify :8000 to 127.0.0.1 (iptables) | T1 | ⏸️ ready |
| C | 8 GB swapfile + OOM-guard on koralink-api | T1 | ⏸️ ready |
| D | Offsite backup to R2 + restore drill | T1 | ⏸️ needs `R2_*` tokens |
| E | Coolify koralink-api service | T1 | ⏸️ needs `COOLIFY_TOKEN` |
| F | Coolify managed PostGIS DB | T1 | ⏸️ after E |
| G | CORS/secret cutover + Render DEV_LOGIN flip | **T2** | ⏸️ after F (your go per action) |
| H | Cloudflare CNAME for prod API | T2 | ⏸️ needs `CLOUDFLARE_API_TOKEN` |

## Token handoff pending

| Token | Slice | `.deploy-tokens` name |
|---|---|---|
| Cloudflare R2 access key | D | `R2_ACCESS_KEY_ID` |
| Cloudflare R2 secret | D | `R2_SECRET_ACCESS_KEY` |
| Cloudflare R2 bucket name | D | `R2_BUCKET` |
| Coolify API token | E | `COOLIFY_TOKEN` |
| Cloudflare API token | H | `CLOUDFLARE_API_TOKEN` |
| Unifonic AppSid (optional) | G | `KL_PROD_UNIFONIC_APP_SID` (Brevo is fine for now) |

## Decisions log

- 2026-09-10: full 4-Gate cycle, autonomous mode (user mandate: "proceed recommended on all")
- 2026-09-10: staging = Tailscale only, prod = public, friends don't need Tailscale
- 2026-09-10: delete Supabase stack as Slice 0 (reclaim ~2.4 GB RAM + ~7.5 GB disk, zero app dependency)
- 2026-09-10: staging quartet stays systemd, never in Coolify (factory loop invariant)
