# Gate 0 — Retrospective: Slot Payment, Cancellation, Recurring, Calendar

Date: 2026-08-11 | Baseline: `615e6ea`

## 1. Commit Pattern Analysis

```
615e6ea feat: match lifecycle auto-complete, cancelled history, POM voting sheet
a1a4143 fix(host): auto-populate date/time from slot in koralink mode
91bad6d fix: gate-0 audit — dead LocationMap button, wallet z-index, stale skill
89a06bd feat(seed): add pitch slots for partner venue + fix now declaration (Slice 4+5)
168a9aa feat(host): add SlotPicker + wire 'Book via Us' flow (Slice 3)
20c35f0 feat(host): add ModeToggle + PublishWarningSheet for dual-mode (Slice 2)
e1152f1 feat(host): add dual-mode backend — booking_mode, pitch_slots, atomic reservation (Slice 1)
494abd7 refactor(host): extract HostMatchForm into sub-components (Slice 0)
3321a54 fix: stale Full status — defensive revert in joinMatch
07ce451 feat: Messages screen redesign
```

- **feat:** 7 | **fix:** 3
- **fix:feat ratio:** 0.43:1 — very healthy
- Last cycle (match lifecycle + POM) was feature-complete with zero follow-up fixes

## 2. Existing Infrastructure Audit

### Wallet System
| Component | Status | Notes |
|-----------|--------|-------|
| `wallet_balance` on users | ✅ | numeric(12,2), default 0 |
| `transactions` table | ✅ | idempotency protected, CREDIT/DEBIT |
| `WalletService.recordTransaction` | ✅ | Atomic tx, balance update, negative guard |
| PWA wallet page | ✅ | Balance, top-up modal, history, 5 UX states |
| Reference types | ⚠️ | MATCH_FEE, TOPUP, REFUND, PRIZE — **need PITCH_BOOKING** |

### Slot Booking
| Component | Status | Notes |
|-----------|--------|-------|
| `pitch_slots` table | ✅ | id, pitch_id, slot_date, start/end_time, is_booked, booked_match_id |
| `createMatch` atomic booking | ✅ | `SELECT FOR UPDATE`, marks slot booked |
| Slot payment | 🔴 **MISSING** | Slot is booked for free — no wallet deduction |
| Slot cancellation | 🔴 **MISSING** | No `cancelBooking` endpoint |
| Slot rebooking | 🔴 **MISSING** | No `rebookSlot` flow |
| Recurring slots | 🔴 **MISSING** | All slots are one-off, no recurrence pattern |
| Calendar export | 🔴 **MISSING** | No ICS generation or calendar links |

## 3. Findings

### 🔴 CRITICAL — Missing Features (4)

| # | Issue | Impact |
|---|-------|--------|
| C1 | **No slot payment** | User books a slot via "Book via Us" — pitch cost is shown but never charged. Host gets free pitch booking. |
| C2 | **No slot cancellation** | Once a match is created with a slot, there's no way to release the slot. The `booked_match_id` persists even after match cancellation. |
| C3 | **No recurring slots** | Partner venues need to define recurring availability (e.g., "Mondays 6–10 PM"). Currently every slot must be manually created. |
| C4 | **No calendar integration** | Users can't add match to their calendar. No ICS export or Google/Apple Calendar link. |

### 🟢 CLEAN (verified)

- Wallet infrastructure is production-ready ✅
- `createMatch` atomic booking is correct ✅
- `SELECT FOR UPDATE` prevents double-booking ✅
- Auto-complete + virtual status working ✅

## 4. Recommendation

**Proceed to Gate 1** — all 4 features are greenfield on top of solid existing infrastructure.
