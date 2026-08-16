# Gate 1 — Product Spec: Host Match Consistency Remediation

**Date:** 2026-08-16
**Status:** ⏸️ PENDING APPROVAL

---

## 1. Problem Statement

The host match flow (create a match, price it, book a slot, cancel it) has drifted between the frontend and backend. The host sees a per-player price in the publish footer that is **lower** than what players are actually charged, the pitch cost is never prorated for matches longer than an hour, and cancelling a KoraLink-booked match **refunds the host more than they paid**. On top of that, match kick-off time is built from the device's local timezone instead of the app's canonical Riyadh timezone, and several API/type contracts are out of sync.

The feature works end-to-end, but the money math and a few contracts are not "up to standard."

---

## 2. User Stories

| ID | Priority | Story |
|----|----------|-------|
| US1 | P0 | As a host, when I cancel a KoraLink-booked match, I am refunded exactly the pitch cost I was charged — no more, no less. |
| US2 | P0 | As a host, the "player share" shown in the publish footer matches the price each player is actually charged (including the platform margin). |
| US3 | P0 | As a host, my pitch cost is prorated by match duration — a 90-minute booking on a 200 SAR/hr pitch costs 300 SAR, not 200. |
| US4 | P1 | As a host, my match kick-off time is stored in Riyadh time regardless of my device's timezone. |
| US5 | P1 | As a developer, the booking-mode contract is unambiguous: omitting `booking_mode` does not cause a 400 when a sensible default exists. |
| US6 | P2 | As a host, the create form validates its payload before hitting the API (the exported Zod schema is actually enforced). |
| US7 | P2 | As a developer, the API/type contracts (`has_voted`, `booking_mode`/`booking_slot_id`) are documented on both sides so they can't drift silently. |

---

## 3. Scope

### IN SCOPE
- Single, server-authoritative pitch-cost derivation (`hourly_rate × duration / 60`).
- One canonical `price_per_player` formula shared (mirrored + test-pinned) between FE and BE.
- Correct refund on cancel = the exact amount the host was debited at create.
- Riyadh-timezone `scheduled_at` construction on the host form.
- Contract hygiene: `booking_mode` DTO default, Zod enforcement in `useCreateMatch`, `NearbyMatchRow.has_voted`, `MatchDetailApi.booking_mode/booking_slot_id`.
- Minor: `SlotPicker` Riyadh "today" min; title fallback uses derived format.

### OUT OF SCOPE
- New payment collection on join (PaymentSheet already handles join payment; not touched).
- Changing the platform margin amount (5 SAR) — that is a business decision, kept as-is.
- Re-seeding pitch slots with non-60-min slots (formula becomes correct regardless, but no new seed data).
- Refactor of `startMatch` Full-status gate (see Open Questions).
- Any change to the visibility/invite-link feature.

---

## 4. Success Criteria (measurable)

- [ ] `createMatch` derives `pitchCostSar` server-side from the pitch's `hourly_rate × duration_mins / 60`; the client-supplied `pitchCostSar` is ignored.
- [ ] `price_per_player` = `round2(pitchCostSar / (max_players − 1) + 5)` in both FE preview and BE, with a unit test pinning them equal.
- [ ] `cancelMatch` refunds exactly the persisted `pitch_cost_sar` (a new column) — a regression test asserts no margin inflation.
- [ ] Host form builds `scheduled_at` in Asia/Riyadh; a unit test asserts a Riyadh-local "18:00" → correct UTC.
- [ ] `npm run build` passes with zero errors; `npx vitest run` all green.
- [ ] New tests cover: pricing formula, refund amount, Riyadh timezone, slot-duration cost.

---

## 5. Open Questions for Gate 2

1. **`startMatch` requires `Full`.** A host can't start a partially-filled match today. Intentional (minimum roster) or a blocker? — *Recommend: keep as-is for this cycle; flag for a separate product decision.*
2. **Platform margin source of truth.** Confirm `PLATFORM_MARGIN_SAR = 5` is final, since the FE preview must mirror it exactly. — *Recommend: yes, mirror the existing constant.*
3. **Should `pitchCostSar` be removed from the DTO entirely** (server derives it), or kept-but-ignored for backward compat? — *Recommend: keep the field, mark deprecated, ignore server-side.*

---

## 6. Risks

- **Migration on a live table** (`matches` gains `pitch_cost_sar`): must be additive + backfilled safely (existing rows default to `price_per_player − margin × (max_players−1)` or NULL → treated as "no refund" for legacy).
- **Money math regression**: any change to price/refund must be gated by tests asserting exact SAR amounts.
- **Timezone change** could shift existing displayed times if the form and display disagree; must keep `dateInRiyadh` display consistent.
