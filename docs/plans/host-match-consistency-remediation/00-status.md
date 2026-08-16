# Host Match Consistency Remediation — Cycle Status

| Gate | Name | Status | Approved | Artifact |
|------|------|--------|----------|----------|
| 0 | Retrospective | ✅ DONE (awaiting approval) | — | [00-retro.md](./00-retro.md) |
| 1 | Product Spec | ⏸️ PENDING APPROVAL | — | [01-product.md](./01-product.md) |
| 2 | Architecture | ⏸️ PENDING APPROVAL | — | [02-architecture.md](./02-architecture.md) |
| 3 | Program Design | ⏸️ PENDING APPROVAL | — | [03-program-design.md](./03-program-design.md) |
| 4 | Vertical Slices | 🔒 BLOCKED | — | — |

**Findings recap (CRITICAL):**
- C1 — cancel refund overpays host by platform margin (money leak).
- C2 — pitch cost never prorated by duration.
- C3 — CostFooter player share ≠ actual charged price.

**Proposed slices (Gate 4, after approval):**
1. Slice 1 (tracer): server-authoritative `pitchCostSar` + `pitch_cost_sar` column + migration + refund fix — verify create → cancel → wallet → ledger end-to-end.
2. Slice 2: FE pricing mirror (`pricePerPlayer`/`pitchCostForDuration`) + CostFooter parity + pinning tests.
3. Slice 3: Riyadh `scheduled_at` + `SlotPicker` today + title fallback + Zod enforcement + type contracts.
4. Slice 4: Sentry/Pino/PostHog observability on pricing + cancel/refund paths (AGENTS.md §4).
