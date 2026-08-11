# Gate 1 — Product Spec: Slot Payment, Cancellation, Recurring, Calendar

Date: 2026-08-11 | Cycle: `slot-management`

## 1. Problem Statement

The "Book via Us" (koralink) mode lets hosts book partner venue slots, but four critical pieces are missing:
- **Payment**: Slots are booked for free — no wallet deduction
- **Cancellation**: No way to release a booked slot (even when the match is cancelled)
- **Recurring**: Partner venues must manually define every slot; no "every Monday 6 PM" pattern
- **Calendar**: No calendar export for hosts or players

## 2. User Stories

### Story A: Slot Payment (P0)
> As a host using "Book via Us", when I publish a match, the pitch cost is deducted from my wallet. If my balance is insufficient, I'm prompted to top up.

**Acceptance Criteria:**
- On match publish in koralink mode, `WalletService.recordTransaction()` deducts `pitchCostSar` from host's wallet
- Transaction reference: `PITCH_BOOKING` type with slot ID as reference
- If balance < pitchCostSar, show "Insufficient balance" error with top-up CTA
- CostFooter shows "Wallet: SAR X.XX → SAR Y.YY after booking" before publish

### Story B: Slot Cancellation & Rebooking (P0)
> As a host who booked a slot, I can cancel my match and the slot is automatically released. If I rebook, the old slot is released and new one is booked.

**Acceptance Criteria:**
- `cancelMatch()` releases the associated slot: `is_booked = false, booked_match_id = null`
- Refund issued automatically on cancellation (wallet credit for pitch cost)
- Host can rebook: cancel existing slot booking → book new slot (atomic via transaction)
- Booking history in wallet shows PITCH_BOOKING debit + REFUND credit

### Story C: Recurring Slots (P1)
> As a venue partner, I can define recurring slot patterns (e.g., "Mondays 6–10 PM, every hour"). Future slots are auto-generated.

**Acceptance Criteria:**
- Backend: `generateRecurringSlots(pitchId, pattern)` generates slots for N weeks
- Pattern supports: day_of_week, start_time, end_time, slot_duration_mins
- Generated slots respect existing bookings (don't overwrite `is_booked = true`)
- Seed data uses recurring pattern instead of manual 7-day loop

### Story D: Calendar Integration (P2)
> As a player or host, I can add a match to my device calendar from the match detail page.

**Acceptance Criteria:**
- "Add to Calendar" button on match detail page (below date/time)
- Generates an `.ics` file download with match title, venue, start/end time
- Google Calendar link alternative
- Both host (after publishing) and joined players can access

## 3. Scope & Boundaries

| IN SCOPE | OUT OF SCOPE |
|----------|-------------|
| Wallet deduction on koralink publish | Payment gateway integration (Moyasar/Stripe) |
| Slot release on match cancel | Partial refunds based on cancellation timing |
| Refund on cancellation | Dispute resolution |
| Recurring slot generation (API + seed) | Venue owner UI for managing recurring slots |
| ICS file download + Google Calendar link | Apple Calendar deep link |
| PITCH_BOOKING reference type | Invoice generation |

## 4. Success Criteria

- [ ] Host wallet deducted on koralink match publish
- [ ] Insufficient balance blocked with clear error
- [ ] Slot released + refunded on match cancel
- [ ] Recurring slot generation working (API testable)
- [ ] ICS download functional from match detail
- [ ] Build: `turbo run build` — zero errors
- [ ] Tests: `npx vitest run` — all passing

## 5. Risks

| Risk | Mitigation |
|------|-----------|
| Payment on publish doubles with retry | Idempotency key from `booking_slot_id` |
| Slot not released if cancelMatch fails mid-tx | Use Drizzle transaction with rollback |
| Recurring generation creates duplicate slots | `uq_pitch_slot` unique index prevents duplicates |
| Host cancels after match starts | Check match status before refunding |
