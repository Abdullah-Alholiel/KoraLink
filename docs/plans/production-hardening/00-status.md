# Production Hardening — Cycle Status

| Gate | Name | Status | Approved | Artifact |
|------|------|--------|----------|----------|
| 0 | Retrospective | ✅ DONE | — | [00-retro.md](./00-retro.md) |
| 1 | Product Spec | ⏸️ PENDING APPROVAL | — | [01-product.md](./01-product.md) |
| 2 | Architecture | ✍️ DRAFTED | — | [02-architecture.md](./02-architecture.md) |
| 3 | Program Design | ✍️ DRAFTED | — | [03-program-design.md](./03-program-design.md) |
| 4 | Vertical Slices | 🔒 BLOCKED | — | [04-slices.md](./04-slices.md) (to be written at Gate 4) |

## Sequencing note

Slices are ordered by **dependency + leverage**, not by P-rating alone. TLS (Slice A) must
land before Web Push, native share/clipboard, and `Secure` cookies can be verified end-to-end.
Observability (Slices B + C) must land before any other slice so regressions are *visible* while
we build the rest.
