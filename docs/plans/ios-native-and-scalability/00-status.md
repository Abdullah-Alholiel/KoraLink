# iOS Native & Scalability — Cycle Status

| Gate | Name | Status | Approved | Artifact |
|------|------|--------|----------|----------|
| 0 | Retrospective | ✅ APPROVED | 2026-08-26 | [00-retro.md](./00-retro.md) |
| 1 | Product Spec | ✅ APPROVED (Path C) | 2026-08-26 | [01-product.md](./01-product.md) |
| 2 | Architecture | ✅ APPROVED | 2026-08-26 | [02-architecture.md](./02-architecture.md) |
| 3 | Program Design | ⏸️ PENDING APPROVAL | — | [03-program-design.md](./03-program-design.md) |
| 4 | Vertical Slices | 🔒 BLOCKED | — | — |

**Resolved:** Path C approved 2026-08-26. Capacitor (Path A) deferred until an
App Store requirement exists. See 01-product.md §"Recommended sequencing".

**Gate 4 (2026-08-26):**
- Slice 1 ✅ socket namespace fix + HTTPS cutover — `ALL CHECKS PASSED`
  (`scripts/https-cutover-verify.mjs`). Final origins: PWA
  `https://aa.tail2948f9.ts.net:9450`, API `https://aa.tail2948f9.ts.net:8443`.
  Port 443 is owned by a Docker Traefik and 8444 by a Docker Kong — both
  unusable (self-signed certs); see 02-architecture.md §"Port reality".
- Slice 3 ✅ Redis adapter shipped by sibling cycle (`d1b5c69`, env-gated
  `WS_REDIS_ADAPTER`, verified against the Gate 3 failure-mode contract).
- Slice 4 ✅ media storage decision locked → `../social-discovery/05-media-storage.md`.
- Slice 2 ⏸ iOS web push on-device verification — needs Abdullah's iPhone
  (PWA reinstall at the new origin first).
