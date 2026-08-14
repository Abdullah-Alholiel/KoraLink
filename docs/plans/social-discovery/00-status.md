# Location & Social Discovery — Cycle Status

| Gate | Name | Status | Approved | Artifact |
|------|------|--------|----------|----------|
| 0 | Retrospective | ✅ APPROVED | 2026-08-14 | [00-retro.md](./00-retro.md) |
| 1 | Product Spec | ✅ APPROVED | 2026-08-14 | [01-product.md](./01-product.md) |
| 2 | Architecture | ✅ APPROVED | 2026-08-14 | [02-architecture.md](./02-architecture.md) |
| 3 | Program Design | ⏸️ PENDING APPROVAL | — | [03-program-design.md](./03-program-design.md) |
| 4 | Vertical Slices | 🔒 BLOCKED | — | — |

## Tracks

| Track | Feature | Priority | Depends on |
|-------|---------|----------|------------|
| A | Full location services | P0 | HTTPS secure context |
| B | Play screen rich first-look | P0 | A (distance) |
| C | Follow + direct messaging | P1 | — |
| D | Lively activity feed + triggers | P1 | A, C |

## Slice order

A1 (geolocation + clubs distance) → A2 (play distance + persistence) →
B1 (all-games date sections + calendar toggle) → C1 (follow graph) →
C2 (DM + WS rooms) → D1 (activity model + feed) → D2 (in-app notifications).
