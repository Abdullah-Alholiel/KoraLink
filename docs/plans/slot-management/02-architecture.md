# Gate 2 — Architecture: Slot Payment, Cancellation, Recurring, Calendar

Date: 2026-08-11 | Cycle: `slot-management`

## 1. Architecture Overview

```
┌──────────────────────────────────────────────────────────────┐
│                      API (NestJS)                             │
│                                                              │
│  ┌──────────────────┐   ┌──────────────────────────┐         │
│  │ MatchesService    │   │ WalletService             │         │
│  │ createMatch()     │──▶│ recordTransaction()       │         │
│  │  → deduct wallet  │   │  → PITCH_BOOKING debit    │         │
│  │ cancelMatch()     │──▶│  → REFUND credit          │         │
│  │  → release slot   │   └──────────────────────────┘         │
│  │  → issue refund   │                                       │
│  │ generateRecurring │   ┌──────────────────────────┐         │
│  │ Slots()           │   │ SlotsController            │         │
│  └──────────────────┘   │ GET /slots/:id/ics        │         │
│                          │  → ICS file download       │         │
│                          └──────────────────────────┘         │
└──────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────────┐
│                      PWA (Next.js)                            │
│                                                              │
│  HostMatchForm                                               │
│  ├── CostFooter → shows wallet balance before/after          │
│  ├── PublishWarningSheet → balance check warning             │
│  └── createMatch → error: "Insufficient balance" + top-up    │
│                                                              │
│  match/[id]/page.tsx                                         │
│  └── "Add to Calendar" button → ICS download / Google link   │
└──────────────────────────────────────────────────────────────┘
```

## 2. Data Flow — Slot Payment

```
HostMatchForm
  → handlePublishClick()
  → PublishWarningSheet (shows cost + wallet balance)
  → doPublish()
  → POST /matches { pitch_id, booking_mode: 'koralink', booking_slot_id, pitchCostSar }
  → MatchesService.createMatch()
    → Validate balance: wallet >= pitchCostSar
    → TX BEGIN
      → SELECT FOR UPDATE pitch_slots (atomic)
      → INSERT match
      → UPDATE pitch_slots SET is_booked = true
      → WalletService.recordTransaction(userId, {
          type: 'DEBIT',
          amount: pitchCostSar,
          referenceType: 'PITCH_BOOKING',
          referenceId: slot.id,
          idempotencyKey: `slot-booking-${slot.id}`
        })
    → TX COMMIT
    → return findOne(matchId)
```

## 3. Data Flow — Slot Cancellation & Refund

```
Host cancels match
  → POST /matches/:id/cancel
  → MatchesService.cancelMatch()
    → TX BEGIN
      → UPDATE matches SET status = 'Cancelled'
      → IF booking_mode = 'koralink' AND booking_slot_id:
        → UPDATE pitch_slots SET is_booked = false, booked_match_id = null
        → WalletService.recordTransaction(userId, {
            type: 'CREDIT',
            amount: pitchCost (from match price_per_player × (max_players - 1)),
            referenceType: 'REFUND',
            referenceId: match.id,
            idempotencyKey: `refund-${match.id}`
          })
    → TX COMMIT
```

## 4. Data Flow — Recurring Slots

```
POST /pitches/:id/recurring-slots
  Body: { days_of_week: [1,3,5], start_time: '18:00', end_time: '22:00',
          slot_duration_mins: 60, weeks_ahead: 4 }

  → generateRecurringSlots(pitchId, pattern)
    → Loop weeks_ahead × days_of_week
    → For each day, generate slots from start_time to end_time
    → INSERT ... ON CONFLICT (pitch_id, slot_date, start_time) DO NOTHING
    → Return count of slots created
```

## 5. Data Flow — Calendar ICS

```
GET /matches/:id/calendar
  ?format=ics  → downloads .ics file
  ?format=google → redirects to Google Calendar

  → Generate ICS string:
    BEGIN:VCALENDAR
    BEGIN:VEVENT
    SUMMARY:{match.title}
    LOCATION:{venue.name}, {venue.address}
    DTSTART:{scheduled_at}
    DTEND:{scheduled_at + duration_mins}
    DESCRIPTION:{format} {match_type} — Hosted by {host.name}
    END:VEVENT
    END:VCALENDAR
```

## 6. Files Changed

| File | Type | Lines | Purpose |
|------|------|-------|---------|
| `apps/api/src/modules/matches/matches.service.ts` | Modify | +80 | Payment in createMatch, slot release + refund in cancelMatch |
| `apps/api/src/modules/matches/matches.controller.ts` | Modify | +10 | GET /matches/:id/calendar |
| `apps/api/src/modules/matches/dto/create-match.dto.ts` | Modify | +3 | Add pitchCostSar field |
| `apps/api/src/modules/pitches/pitches.service.ts` | **New** | ~40 | generateRecurringSlots |
| `apps/api/src/modules/pitches/pitches.controller.ts` | Modify | +10 | POST /pitches/:id/recurring-slots |
| `apps/api/src/modules/pitches/pitches.module.ts` | Modify | +5 | Add PitchesService |
| `apps/api/src/database/schema.ts` | Modify | +3 | Add PITCH_BOOKING to ReferenceType enum |
| `apps/player-pwa/src/components/host/HostMatchForm.tsx` | Modify | +20 | Pass wallet balance, handle insufficient balance |
| `apps/player-pwa/src/components/host/CostFooter.tsx` | Modify | +15 | Show wallet balance before/after |
| `apps/player-pwa/src/components/host/PublishWarningSheet.tsx` | Modify | +10 | Show balance warning |
| `apps/player-pwa/src/app/[locale]/match/[id]/page.tsx` | Modify | +10 | Add to Calendar button |
| `apps/player-pwa/src/hooks/useWallet.ts` | Existing | 0 | Already has useWalletBalance |
| `apps/player-pwa/src/messages/en.json` | Modify | +10 | New keys |
| `apps/player-pwa/src/messages/ar.json` | Modify | +10 | New keys |

## 7. i18n Keys Needed

| Key | en | ar |
|-----|----|----|
| `wallet.insufficientBalance` | "Insufficient wallet balance" | "رصيد المحفظة غير كافٍ" |
| `wallet.balanceBefore` | "Your balance after booking" | "رصيدك بعد الحجز" |
| `wallet.topUpToContinue` | "Top up your wallet to continue" | "قم بشحن محفظتك للمتابعة" |
| `host.pitchCostWillBeCharged` | "SAR {amount} will be deducted from your wallet" | "سيتم خصم {amount} ريال من محفظتك" |
| `matchDetail.addToCalendar` | "Add to Calendar" | "أضف إلى التقويم" |
| `matchDetail.googleCalendar` | "Google Calendar" | "تقويم جوجل" |
| `matchDetail.downloadIcs` | "Download .ics" | "تحميل .ics" |
| `common.cancel` | "Cancel" | "إلغاء" |

## 8. Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| Payment + slot booking not atomic | Wrap in Drizzle transaction |
| Double-charge on publish retry | Idempotency key = `slot-booking-{slotId}` |
| Slot released but refund fails | Both in same transaction → rollback |
| Recurring slots create thousands of rows | `weeks_ahead` capped at 8; ON CONFLICT DO NOTHING |

## 9. Descoped

- Payment gateway (Moyasar) integration
- Partial refunds / cancellation policies
- Venue owner recurring slot management UI
- Apple Calendar deep link
- Push notifications for calendar events
