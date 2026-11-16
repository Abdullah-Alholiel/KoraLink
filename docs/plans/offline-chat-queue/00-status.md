# Offline Chat Queue — Cycle Status

| Gate | Name | Status | Approved | Artifact |
|------|------|--------|----------|----------|
| 0 | Retrospective | ✅ APPROVED (autonomous, run #144) | auto | [00-retro.md](./00-retro.md) |
| 1 | Product Spec | ✅ APPROVED (autonomous) | auto | 01-program-design.md §Problem/User stories |
| 2 | Architecture | ✅ APPROVED (autonomous) | auto | 01-program-design.md §Architecture delta |
| 3 | Program Design | ✅ APPROVED (autonomous) | auto | 01-program-design.md (chat queue contract; money actions excluded by recorded decision) |
| 4 | Vertical Slices | ✅ chat half run #144 (PR #149) · ✅ hardening run #145 (PR #150) | gates green | kanban/RUNS/ reports |

Run #145 addendum: PR #149 merged (`c8c1f4b`, head 517812a escaped the P2-208 kora-link
status); hardening slice shipped as PR #150 (TTL prune + cap + orphan guard + ack-timer
stand-down). Live E2E on staging API: send 201 → idempotent replay 201 → cancel 200.
