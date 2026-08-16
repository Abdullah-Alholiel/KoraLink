# Host Match Consistency Remediation — Cycle Status

| Gate | Name | Status | Approved | Artifact |
|------|------|--------|----------|----------|
| 0 | Retrospective | ✅ APPROVED | 2026-08-16 | [00-retro.md](./00-retro.md) |
| 1 | Product Spec | ✅ APPROVED | 2026-08-16 | [01-product.md](./01-product.md) |
| 2 | Architecture | ✅ APPROVED | 2026-08-16 | [02-architecture.md](./02-architecture.md) |
| 3 | Program Design | ✅ APPROVED | 2026-08-16 | [03-program-design.md](./03-program-design.md) |
| 4 | Vertical Slices | ✅ DONE | — | implementation + verification below |

## Gate 4 — Slices (completed)

| Slice | Scope | Status |
|-------|-------|--------|
| 1 | Server-authoritative `pitchCostSar` + `pitch_cost_sar` column + migration + refund fix | ✅ |
| 2 | FE pricing mirror (`pricePerPlayer`/`pitchCostForDuration`) + CostFooter parity + pinning tests | ✅ |
| 3 | Riyadh `scheduled_at` + SlotPicker today + title fallback + Zod enforcement + type contracts | ✅ |
| 4 | Pino logs (create/cancel) + PostHog `match_cancelled` + enriched `match_created` | ✅ |

## Verification

| Check | Result |
|-------|--------|
| `npm run build` | ✅ 2/2 tasks (1m28s) |
| `npx vitest run` | ✅ 17 files / 138 tests (12 new) |
| Migration `0010_milky_lionheart.sql` | ✅ generated + applied (local DB) |
| API service restarted with new `dist/` | ✅ |
| E2E money path (dev-login → create koralink → cancel) | ✅ `pitch_cost_sar=200.00`, `price_per_player=20.39`, wallet 680→480→680, refund `200.00` (exact, no margin inflation) |

## Resolved findings

- ✅ C1 — cancel refund now returns the exact debited `pitch_cost_sar` (no margin overpay).
- ✅ C2 — pitch cost prorated by duration (`hourly_rate × duration/60`), server-derived.
- ✅ C3 — CostFooter player share mirrors `price_per_player` (incl. +5 SAR margin, 2dp).
- ✅ I1 — `scheduled_at` built in Asia/Riyadh via `riyadhISO()`.
- ✅ I2 — `booking_mode` DTO optional, defaulted in service.
- ✅ I3 — `hostMatchSchema` enforced in `useCreateMatch`.
- ✅ I4 — `NearbyMatchRow.has_voted` typed.
- ✅ I5 — `MatchDetailApi.booking_mode/booking_slot_id` typed.
- ✅ M1 — SlotPicker "today" uses `todayInRiyadh()`.
- ✅ M2 — title fallback uses `effectiveFormat`.
