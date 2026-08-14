# Location & Social Discovery — Cycle Status

| Gate | Name | Status | Approved | Artifact |
|------|------|--------|----------|----------|
| 0 | Retrospective | ✅ APPROVED | 2026-08-14 | [00-retro.md](./00-retro.md) |
| 1 | Product Spec | ✅ APPROVED | 2026-08-14 | [01-product.md](./01-product.md) |
| 2 | Architecture | ✅ APPROVED | 2026-08-14 | [02-architecture.md](./02-architecture.md) |
| 3 | Program Design | ✅ APPROVED | 2026-08-14 | [03-program-design.md](./03-program-design.md) |
| 4 | Vertical Slices | 🚧 IN PROGRESS | — | — |

## Tracks

| Track | Feature | Priority | Depends on |
|-------|---------|----------|------------|
| A | Full location services | P0 | HTTPS secure context |
| B | Play screen rich first-look | P0 | A (distance) |
| C | Follow + direct messaging | P1 | — |
| D | Lively activity feed + triggers | P1 | A, C |

## Slice progress

| Slice | Description | Status |
|-------|-------------|--------|
| A1 | geolocation + clubs distance + radius 50 | ✅ DONE (`7634a48`) |
| A2 | play distance + location persistence | ⏸️ pending |
| B1 | all-games date sections + calendar toggle | ⏸️ pending |
| C1 | follow graph | ⏸️ pending |
| C2 | DM + WS rooms | ⏸️ pending |
| D1 | activity model + feed | ⏸️ pending |
| D2 | in-app notifications | ⏸️ pending |

## Blockers

- **HTTPS prerequisite** (geolocation secure context) — blocked on sudo.
  See [04-https-prerequisite.md](./04-https-prerequisite.md).
  Tracks A/B distance/sort won't work on-device until resolved; all code is
  built and degrades gracefully meanwhile.
