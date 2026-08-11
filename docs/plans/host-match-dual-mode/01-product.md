# Gate 1 — Product Spec: Host Match Dual Mode

**Date:** 2026-08-11
**Status:** ⏸️ PENDING APPROVAL

---

## 1. Problem Statement

The current Host a Match form has a single mode: the user picks any venue, any pitch, enters match details, and publishes. While a disclaimer warns about pitch responsibility, there is no formal distinction between:

1. **Self-organized matches** — where the host handles everything independently (booking the pitch, preparing it, controlling match tempo), and
2. **KoraLink-managed matches** — where KoraLink handles the pitch booking through partner venues with guaranteed slot availability.

Without this distinction:
- Hosts may assume KoraLink secures the pitch (it doesn't — leading to disputes)
- KoraLink partner venues cannot offer bookable slots through the app
- There's no revenue path for managed bookings
- Hosts have no streamlined "we handle it for you" option

---

## 2. User Stories

### P0 — Core Dual-Mode

| ID | Story | Acceptance Criteria |
|----|-------|---------------------|
| **US-1** | As a host, I can toggle between "Book via Us" and "Book by Yourself" modes at the top of the Host Match form so I understand who handles the pitch | Top bar with two tabs/pills: "Book via Us" and "Book by Yourself". Tapping switches mode. Previously entered shared fields (title, format, date, etc.) are preserved when toggling. Venue/pitch selection resets when switching modes (different venue pools). |
| **US-2** | As a host in "Book by Yourself" mode, I can select any venue, any pitch, enter match details, and see a clear warning modal before publishing | The current flow works unchanged. NEW: tapping "Publish Match" opens a confirmation modal that explicitly states the host takes full responsibility for pitch booking, preparation, and match tempo. Host must explicitly confirm before the match is created. |
| **US-3** | As a host in "Book via Us" mode, I can only select from KoraLink partner venues, pick an available time slot for a specific pitch, and publish | Only `is_koralink_partner = true` venues appear. After selecting a venue + pitch, a slot picker shows available time slots. Selecting a slot reserves it. Form publishes with `booking_mode = 'koralink'` and `booking_slot_id` attached. |

### P1 — Slot Experience

| ID | Story | Acceptance Criteria |
|----|-------|---------------------|
| **US-4** | As a host, I can see which time slots are available vs booked for a pitch | Slots are displayed as time chips/cards (e.g., "6:00 PM – 7:00 PM"). Available slots have a distinct visual (green accent). Booked slots are grayed out and disabled. |
| **US-5** | As a host, I see the slot cost integrated into the match cost breakdown | The footer cost row reflects the selected slot's price (same as pitch hourly_rate). "Host plays free" badge still applies. |

### P2 — Polish & Edge Cases

| ID | Story | Acceptance Criteria |
|----|-------|---------------------|
| **US-6** | As a host, I cannot publish a "Book via Us" match without selecting a slot | Publish button is disabled until a slot is selected. Clear visual indicator. |
| **US-7** | As a host, I see a different disclaimer based on the selected mode | "Book via Us": "KoraLink secures this pitch. You control the match." (brand-colored, reassuring). "Book by Yourself": "You are responsible for booking and preparing the pitch." (amber warning style, already exists). |
| **US-8** | As a returning host, the mode I used last time is pre-selected | Default to "Book by Yourself" for first-time hosts (safer default). Remember last-used mode in localStorage. |

---

## 3. Scope & Boundaries

### IN SCOPE

- Top bar toggle between two modes
- "Book by Yourself" mode = current flow + pre-publish warning modal
- "Book via Us" mode = Koralink-partner venues only + pitch slot picker
- New DB tables/columns: `pitch_slots`, `venues.is_koralink_partner`, `matches.booking_mode`, `matches.booking_slot_id`
- Venue filtering by `is_koralink_partner` flag
- Slot availability display and selection
- Mode-specific disclaimers
- Pre-publish confirmation modal for "Book by Yourself"
- Cost breakdown updates with slot selection
- i18n keys for ALL new strings (ar + en)
- PostHog analytics events for mode toggle, slot selection, and publish

### OUT OF SCOPE

- Slot booking payment (payment is already handled by existing wallet flow)
- Slot cancellation/rescheduling after publication
- Recurring slots / weekly schedules
- Admin dashboard for managing partner venues and slots
- Push notifications for slot reminders
- Venue owner side of slot management (manual DB seeding for now)
- "Book via Us" confirmation from venue side (auto-confirmed for now)
- Google Calendar / iCal integration for slots

---

## 4. Success Criteria

| # | Criterion | How Verified |
|---|-----------|-------------|
| SC-1 | Host can create a match in EITHER mode end-to-end | Manual test: toggle → fill form → publish → match appears in feed |
| SC-2 | "Book by Yourself" shows warning modal before publish | Manual test: tap publish → modal appears → confirm → match created |
| SC-3 | "Book via Us" only shows partner venues | Manual test: toggle to "via Us" → venue picker only lists partner venues |
| SC-4 | "Book via Us" slot is reserved on publish | Verify `booking_slot_id` is set in DB, slot `is_booked = true` |
| SC-5 | Toggling modes preserves shared field values | Manual test: fill title/format/date in "yourself" → toggle to "via Us" → fields still populated |
| SC-6 | Switching modes resets venue/pitch/slot selection | Manual test: pick venue in "via Us" → toggle to "yourself" → venue cleared |
| SC-7 | `turbo run build` passes with zero errors | CI gate |
| SC-8 | All existing tests pass (`npx vitest run`) | CI gate |
| SC-9 | Both Arabic and English locales render correctly | Manual RTL/LTR test |
| SC-10 | Match cards display booking mode appropriately (future — no visual change in this cycle) | Data flows correctly to feed |

---

## 5. Open Questions for Gate 2

1. **Slot date mapping:** The `pitch_slots` table stores `day_of_week` (0-6) + `start_time`/`end_time`. How do we map a specific calendar date the user selects to the right day_of_week slots? Should slots also have a `specific_date` variant?
2. **Slot double-booking prevention:** Two hosts could select the same slot simultaneously. Do we need an atomic reservation or is first-to-publish sufficient?
3. **Venue partner flag migration:** Do existing venues get `is_koralink_partner = false` by default? Should we seed at least one partner venue for testing?
4. **Slot data seeding:** Who populates `pitch_slots`? Manual SQL seeding now, admin panel later?

---

## 6. Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Slot race condition (two hosts book same slot) | Medium | High | Gate 2 decision: either accept first-wins, or add DB-level unique constraint + atomic check |
| Monolithic component becomes unmaintainable | High | Medium | Extract sub-components BEFORE adding dual-mode logic (slice 0 — refactor) |
| Breaking existing match creation flow | Medium | Critical | "Book by Yourself" mode is the current flow with ONE addition (warning modal). Keep changes minimal. |
| Partner venues have no slots seeded | High | Medium | Seed at least 1 partner venue + 3 pitches × 5 slots each before testing |
| i18n drift between modes | Low | Medium | Gate 3 locks all i18n keys. Both languages updated together. |

---

**Status:** ⏸️ PENDING APPROVAL — awaiting user review before Gate 2
