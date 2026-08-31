# Run #21 — Reschedule Cross-Day (Gate 0+3 compact)

**Status:** implemented in autonomous mode (user directive: "continue developing after the last run … ensure up to standard implementation").

## Gate 0 — Retrospective (compact)

- **Baseline:** run #20 (5836847) — P1-13 reschedule shipped end-to-end; post-cycle review fixed a real cancel/reschedule money race.
- **fix:feat ratio:** 4 fix / 1 feat in run #20's last 6 commits — acceptable (review-driven, not reactive churn).
- **Debt carried:** P1-13 verified by live E2E in run #20; no regression signals since (git log clean, Sentry clean per run #20 report).
- **Gap found (this cycle's driver):** `RescheduleSheet` calls `usePitchSlots(pitchId, todayInRiyadh())` — the host can only move a match to a free slot **on the current day**. Abdullah's requirement: "when a user can reschedule he can also choose another available day with available slots."
- **Audit of the API:** `rescheduleMatch` (matches.service.ts:1741) takes any FREE slot on the SAME pitch — it never constrains `slot_date`. **No backend change is strictly required** for cross-day moves.
- **Server-side gap exposed by opening all days:** nothing prevents rescheduling onto a slot whose `slot_date` is already **past** (would create a match whose `scheduled_at` is in the past → auto-complete scheduler would immediately complete it). `createMatch`/scheduler trust slot state, so the guard belongs in `rescheduleMatch` only (this endpoint is what newly reaches past days).
- **Conclusion:** proceed — PWA cross-day picker + API past-slot guard.

## Gate 3 — Program Design (compact, contract-locked)

### Item 1 — PWA: RescheduleSheet day picker

- **Data:** reuse `usePitchSlots(pitchId, date)` unchanged (per-day query — no new endpoint; the API stays slot-date-parametric).
- **Day selection:** reuse `DatePicker` (the Play feed's 7-day strip idiom) inside the sheet. Controlled `selectedDate: string | null` (YYYY-MM-DD, Riyadh). Initialize to `todayInRiyadh()` on mount so behavior is unchanged for the common case. Changing the day clears the selected slot (a slot id belongs to a day).
- **Day label:** the section header shows the selected day (localized long form, `ar-SA`/`en-US`) — replaces the hardcoded "today" label.
- **Contract:** `onConfirm(slot: PitchSlotApi)` unchanged → parent `rescheduleMatch.mutate({ matchId, bookingSlotId: slot.id })` unchanged. **No parent/page changes.**
- **i18n (en/ar, parity):** `reschedule.pickDay` ("Pick a day" / "اختر يوماً"); `reschedule.noSlots` reworded to drop "today" ("No free slots on the selected day. Try another day." / Arabic equivalent). All other existing keys unchanged.

### Item 2 — API: past-slot guard in rescheduleMatch

- **Rule:** the new slot's `scheduled_at` (Riyadh wall clock `slot_date T start_time +03:00`) must be **strictly in the future** at confirm time; else `BadRequestException` ("Cannot reschedule the match to a slot in the past.").
- Placement: after slot lock + same-pitch + free checks, **before** any money movement (guard order = cheapest-first, no side effects before rejects). Existing `is_booked` → 409, same-slot → 400 behavior unchanged.
- **Response contract: unchanged** (populated `findOne` + `reschedule` summary block). **DTO unchanged.** Error text additive only.
- **i18n note:** PWA maps error messages by status code (error fallback toast), so no new PWA error strings are needed.
- **Tests:** `matches.reschedule.spec.ts` — fixtures must be **future-proof**: compute old/new slot dates relative to `now` (Riyadh) instead of the hardcoded `2026-09-01/02` which becomes past-stale. New specs: past newSlot → 400 (and asserts zero ledger/slot writes); day-before-yesterday vs tomorrow same time → guard is date-driven not time-driven.

### Gate 3 checklist (verified against code)

- [✓] Mutation still returns populated `findOne` + additive `reschedule` block (untouched).
- [✓] `MatchDetailApi` needs no new fields — cross-day is pure client interaction.
- [✓] Adapter: none needed (`PitchSlotApi` raw shape display-ready, unchanged).
- [✓] i18n keys exist in BOTH en/ar for every new user-facing string (2 keys × 2 langs).
- [✓] New API guard rejects before any money/ledger writes (spec-asserted).

### Descoped

- Moving a match to a *different pitch* (cross-pitch reschedule) — P1-13 scope stays same-pitch.
- Native calendar overlay in the sheet — `DatePicker` strip (7 days) matches the app's existing idiom.
