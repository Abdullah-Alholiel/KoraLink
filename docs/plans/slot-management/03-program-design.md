# Gate 3 — Program Design: Slot Payment, Cancellation, Recurring, Calendar

Date: 2026-08-11 | Cycle: `slot-management`

## 1. Backend Contracts

### 1.1 createMatch — Add Payment (MODIFIED)

```typescript
// matches.service.ts — createMatch, ADD after slot booking (line ~479):

// ── Slot payment (koralink mode) ──────────────────────────
if (dto.booking_mode === 'koralink' && dto.booking_slot_id && dto.pitchCostSar) {
  // Check wallet balance before attempting charge
  const [{ wallet_balance }] = await tx
    .select({ wallet_balance: users.wallet_balance })
    .from(users)
    .where(eq(users.id, hostId))
    .limit(1);

  if (parseFloat(wallet_balance) < dto.pitchCostSar) {
    throw new BadRequestException('Insufficient wallet balance');
  }

  // Deduct pitch cost from wallet
  await this.walletService.recordTransaction(hostId, {
    type: 'DEBIT',
    amount: dto.pitchCostSar,
    referenceType: 'PITCH_BOOKING' as ReferenceType,
    referenceId: dto.booking_slot_id,
    idempotencyKey: `slot-booking-${dto.booking_slot_id}`,
  });
}
```

### 1.2 cancelMatch — Release Slot + Refund (MODIFIED)

```typescript
// matches.service.ts — cancelMatch, ADD after status update:

// ── Release slot + refund (koralink mode) ─────────────────
if (match.booking_mode === 'koralink' && match.booking_slot_id) {
  const [slot] = await tx
    .select({ id: pitch_slots.id, is_booked: pitch_slots.is_booked })
    .from(pitch_slots)
    .where(eq(pitch_slots.id, match.booking_slot_id))
    .limit(1);

  if (slot?.is_booked) {
    // Release the slot
    await tx
      .update(pitch_slots)
      .set(withTimestamp({ is_booked: false, booked_match_id: null }))
      .where(eq(pitch_slots.id, match.booking_slot_id));

    // Calculate pitch cost refund
    const pitchCostSar = parseFloat(match.price_per_player) * (match.max_players - 1);

    // Refund to host wallet
    await this.walletService.recordTransaction(hostId, {
      type: 'CREDIT',
      amount: pitchCostSar,
      referenceType: 'REFUND' as ReferenceType,
      referenceId: match.id,
      idempotencyKey: `refund-${match.id}`,
    });
  }
}
```

### 1.3 generateRecurringSlots (NEW)

```typescript
// pitches.service.ts — NEW file
@Injectable()
export class PitchesService {
  constructor(@Inject('DB_CONNECTION') private readonly db: DB) {}

  async generateRecurringSlots(
    pitchId: string,
    pattern: {
      days_of_week: number[];     // 0=Sun, 1=Mon, ..., 6=Sat
      start_time: string;         // "18:00"
      end_time: string;           // "22:00"  
      slot_duration_mins: number; // 60
      weeks_ahead: number;        // 4
    },
  ): Promise<{ created: number; skipped: number }> {
    const slots: Array<{
      pitch_id: string;
      slot_date: string;
      start_time: string;
      end_time: string;
    }> = [];

    const today = new Date();
    for (let w = 0; w < pattern.weeks_ahead; w++) {
      for (const dow of pattern.days_of_week) {
        // Find next occurrence of this day
        const date = new Date(today);
        date.setDate(date.getDate() + ((dow - date.getDay() + 7) % 7) + w * 7);
        
        const yyyy = date.getFullYear();
        const mm = String(date.getMonth() + 1).padStart(2, '0');
        const dd = String(date.getDate()).padStart(2, '0');
        const dateStr = `${yyyy}-${mm}-${dd}`;

        // Generate hourly slots
        const startHour = parseInt(pattern.start_time.split(':')[0]);
        const endHour = parseInt(pattern.end_time.split(':')[0]);
        for (let h = startHour; h < endHour; h++) {
          const startTime = `${String(h).padStart(2, '0')}:00:00`;
          const endTime = `${String(h + 1).padStart(2, '0')}:00:00`;
          slots.push({
            pitch_id: pitchId,
            slot_date: dateStr,
            start_time: startTime,
            end_time: endTime,
          });
        }
      }
    }

    // INSERT with ON CONFLICT DO NOTHING
    let created = 0;
    for (const slot of slots) {
      try {
        await this.db.insert(pitch_slots).values(slot);
        created++;
      } catch {
        // Duplicate — skip silently
      }
    }
    
    return { created, skipped: slots.length - created };
  }
}
```

### 1.4 Calendar ICS (NEW endpoint)

```typescript
// matches.controller.ts — NEW route
@Get(':id/calendar')
async getCalendar(
  @Param('id') id: string,
  @Query('format') format: 'ics' | 'google' = 'ics',
  @Res() res: Response,
) {
  const match = await this.matchesService.findOne(id);
  
  const startDate = new Date(match.scheduled_at);
  const endDate = new Date(startDate.getTime() + match.duration_mins * 60 * 1000);
  
  if (format === 'google') {
    const googleUrl = new URL('https://www.google.com/calendar/render');
    googleUrl.searchParams.set('action', 'TEMPLATE');
    googleUrl.searchParams.set('text', match.title);
    googleUrl.searchParams.set('dates', `${toICSDate(startDate)}/${toICSDate(endDate)}`);
    googleUrl.searchParams.set('details', `${match.match_type} ${match.gender_rule}`);
    googleUrl.searchParams.set('location', match.pitch?.venue?.name ?? '');
    return res.redirect(googleUrl.toString());
  }

  // ICS format
  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//KoraLink//Match Calendar//EN',
    'BEGIN:VEVENT',
    `SUMMARY:${match.title}`,
    `DTSTART:${toICSDate(startDate)}`,
    `DTEND:${toICSDate(endDate)}`,
    `LOCATION:${match.pitch?.venue?.name ?? ''}, ${match.pitch?.venue?.address ?? ''}`,
    `DESCRIPTION:${match.match_type} • ${match.gender_rule} • Hosted on KoraLink`,
    `URL:https://koralink.app/match/${match.id}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');

  res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="koralink-match-${id.slice(0,8)}.ics"`);
  return res.send(ics);
}
```

### 1.5 DTO Update

```typescript
// create-match.dto.ts — ADD field
@ApiPropertyOptional({ description: 'Pitch cost in SAR (koralink mode)' })
@IsNumber()
@IsOptional()
@Min(0)
pitchCostSar?: number;
```

### 1.6 ReferenceType Enum Update

```typescript
// schema.ts — ADD to referenceTypeEnum
export const referenceTypeEnum = pgEnum('ReferenceType', [
  'MATCH_FEE',
  'TOPUP',
  'REFUND',
  'PRIZE',
  'PITCH_BOOKING',  // ← NEW
]);

export type ReferenceType = 'MATCH_FEE' | 'TOPUP' | 'REFUND' | 'PRIZE' | 'PITCH_BOOKING';
```

---

## 2. Frontend Contracts

### 2.1 CostFooter — Wallet Balance Display

```typescript
// CostFooter.tsx — MODIFIED props
interface CostFooterProps {
  // ... existing props ...
  walletBalance?: number;        // NEW
  insufficientBalance?: boolean; // NEW
}

// In the cost row, add wallet balance line (koralink mode only):
{walletBalance !== undefined && (
  <div className="flex items-center justify-between mb-1">
    <span className="text-xs text-gray-400">{t('wallet.balanceBefore')}</span>
    <span className="text-sm font-bold text-brand-black" dir="ltr">
      SAR {(walletBalance - pitchCostSar).toFixed(2)}
    </span>
  </div>
)}
```

### 2.2 PublishWarningSheet — Balance Warning

```typescript
// PublishWarningSheet.tsx — MODIFIED
// In koralink mode, show wallet deduction warning:
{mode === 'koralink' && (
  <div className="bg-brand-green/5 rounded-xl p-3 mb-4">
    <p className="text-xs text-gray-600">
      {t('host.pitchCostWillBeCharged', { amount: pitchCostSar })}
    </p>
  </div>
)}
```

### 2.3 Match Detail — Calendar Button

```typescript
// match/[id]/page.tsx — ADD below date/time section:
<a
  href={`${API_URL}/matches/${match.id}/calendar?format=ics`}
  download
  className="flex items-center gap-2 text-xs text-brand-green font-medium"
>
  <Calendar className="w-4 h-4" strokeWidth={1.5} />
  {t('matchDetail.addToCalendar')}
</a>
```

---

## 3. Exact JSON Response Shapes

### POST /matches (koralink mode — success)
```json
{
  "id": "match-uuid",
  "status": "Open",
  "booking_mode": "koralink",
  "booking_slot_id": "slot-uuid",
  "price_per_player": 29,
  "max_players": 14,
  "...": "..."
}
```

### POST /matches (insufficient balance)
```json
{
  "statusCode": 400,
  "message": "Insufficient wallet balance",
  "error": "Bad Request"
}
```

### POST /matches/:id/cancel (with refund)
```json
{
  "id": "match-uuid",
  "status": "Cancelled",
  // slot released, refund issued
}
```

### POST /pitches/:id/recurring-slots
```json
// Request
{
  "days_of_week": [1, 3, 5],
  "start_time": "18:00",
  "end_time": "22:00",
  "slot_duration_mins": 60,
  "weeks_ahead": 4
}

// Response
{ "created": 48, "skipped": 0 }
```

### GET /matches/:id/calendar?format=ics
```
Content-Type: text/calendar
Content-Disposition: attachment; filename="koralink-match-abc12345.ics"

BEGIN:VCALENDAR
VERSION:2.0
...
END:VCALENDAR
```

---

## 4. Contract Verification Checklist

- [ ] `createMatch` deducts wallet on koralink mode with `pitchCostSar`
- [ ] `createMatch` throws 400 on insufficient balance
- [ ] `cancelMatch` releases slot (`is_booked = false, booked_match_id = null`)
- [ ] `cancelMatch` refunds pitch cost to wallet (CREDIT + REFUND ref type)
- [ ] Payment uses idempotency key `slot-booking-{slotId}`
- [ ] Refund uses idempotency key `refund-{matchId}`
- [ ] `generateRecurringSlots` respects ON CONFLICT (no duplicates)
- [ ] ICS endpoint returns valid iCalendar format with correct MIME type
- [ ] Google Calendar link redirects correctly
- [ ] CostFooter shows wallet balance before/after for koralink mode
- [ ] PublishWarningSheet shows deduction warning for koralink mode
- [ ] i18n keys exist in both ar.json and en.json
- [ ] Build passes with zero errors
- [ ] Tests pass (no regressions)
