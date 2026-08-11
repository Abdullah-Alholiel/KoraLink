# Gate 2 — Architecture: Host Match Dual Mode

**Date:** 2026-08-11
**Status:** ⏸️ PENDING APPROVAL

---

## 1. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        HOST MATCH PAGE                          │
│  /[locale]/host                                                 │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                   HostMatchForm.tsx                        │  │
│  │  ┌─────────────────────────────────────────────────────┐  │  │
│  │  │  ModeToggle (NEW)                                    │  │  │
│  │  │  [ Book via Us ]  [ Book by Yourself ]              │  │  │
│  │  └─────────────────────────────────────────────────────┘  │  │
│  │                                                            │  │
│  │  ┌─── mode=koralink ───┐  ┌─── mode=self ─────────────┐  │  │
│  │  │  BookViaUsForm      │  │  BookYourselfForm          │  │  │
│  │  │  ┌───────────────┐  │  │  ┌──────────────────────┐  │  │
│  │  │  │ VenuePicker   │  │  │  │ VenuePicker          │  │  │
│  │  │  │ (partner only)│  │  │  │ (all venues)         │  │  │
│  │  │  ├───────────────┤  │  │  ├──────────────────────┤  │  │
│  │  │  │ PitchSelector │  │  │  │ PitchSelector        │  │  │
│  │  │  ├───────────────┤  │  │  ├──────────────────────┤  │  │
│  │  │  │ SlotPicker 🆕 │  │  │  │ MatchDetailsForm     │  │  │
│  │  │  │ (date+time)   │  │  │  │ (shared)             │  │  │
│  │  │  └───────────────┘  │  │  └──────────────────────┘  │  │
│  │  │  ┌───────────────┐  │  │  ┌──────────────────────┐  │  │
│  │  │  │ MatchDetails  │  │  │  │ PublishWarning 🆕    │  │  │
│  │  │  │ (shared)      │  │  │  │ (confirmation modal)  │  │  │
│  │  │  └───────────────┘  │  │  └──────────────────────┘  │  │
│  │  └─────────────────────┘  └────────────────────────────┘  │  │
│  │                                                            │  │
│  │  ┌─────────────────────────────────────────────────────┐  │  │
│  │  │  Sticky Footer (shared)                              │  │  │
│  │  │  Cost breakdown + Publish CTA                        │  │  │
│  │  └─────────────────────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘

                         │                         │
                         ▼                         ▼
              ┌──────────────────┐     ┌──────────────────────┐
              │  usePitchSlots() │     │  useCreateMatch()    │
              │  (NEW hook)      │     │  (modified)          │
              └──────┬───────────┘     └──────────┬───────────┘
                     │                            │
                     ▼                            ▼
              ┌──────────────────────────────────────────────┐
              │              fetcher.ts                       │
              │  GET /pitches/:id/slots?date=YYYY-MM-DD      │
              │  GET /venues?is_koralink_partner=true         │
              │  POST /matches  (with booking_mode + slot)    │
              └──────────────────┬───────────────────────────┘
                                 │
                                 ▼
              ┌──────────────────────────────────────────────┐
              │            NestJS API (matches module)        │
              │                                              │
              │  createMatch() — MODIFIED:                    │
              │   1. If booking_mode='koralink':             │
              │      a. SELECT slot FOR UPDATE (atomic lock)  │
              │      b. Check is_booked = false               │
              │      c. Set is_booked=true, booked_match_id   │
              │   2. Create match (existing logic)            │
              │   3. Add host to match_players                │
              │   4. Return findOne(id)                       │
              └──────────────────┬───────────────────────────┘
                                 │
                                 ▼
              ┌──────────────────────────────────────────────┐
              │              PostgreSQL                       │
              │                                              │
              │  pitch_slots (NEW TABLE)                     │
              │  ┌──────────────────────────────────────┐    │
              │  │ UNIQUE(pitch_id, slot_date, start)   │    │
              │  │ FK: pitch_id → pitches               │    │
              │  │ FK: booked_match_id → matches        │    │
              │  └──────────────────────────────────────┘    │
              │                                              │
              │  venues.is_koralink_partner (NEW COLUMN)     │
              │  matches.booking_mode (NEW COLUMN)            │
              │  matches.booking_slot_id (NEW COLUMN, FK)     │
              └──────────────────────────────────────────────┘
```

---

## 2. Database Schema Changes

### 2.1 New Table: `pitch_slots`

```sql
CREATE TABLE pitch_slots (
  id              VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  pitch_id        VARCHAR(36) NOT NULL REFERENCES pitches(id) ON DELETE CASCADE,
  slot_date       DATE NOT NULL,
  start_time      TIME NOT NULL,
  end_time        TIME NOT NULL,
  is_booked       BOOLEAN NOT NULL DEFAULT FALSE,
  booked_match_id VARCHAR(36) REFERENCES matches(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(pitch_id, slot_date, start_time)
);

CREATE INDEX idx_pitch_slots_pitch_date ON pitch_slots(pitch_id, slot_date);
CREATE INDEX idx_pitch_slots_booked ON pitch_slots(is_booked) WHERE is_booked = FALSE;
```

### 2.2 New Columns on Existing Tables

```sql
-- venues
ALTER TABLE venues ADD COLUMN is_koralink_partner BOOLEAN NOT NULL DEFAULT FALSE;
CREATE INDEX idx_venues_partner ON venues(is_koralink_partner) WHERE is_koralink_partner = TRUE;

-- matches
ALTER TABLE matches ADD COLUMN booking_mode VARCHAR(20) NOT NULL DEFAULT 'self'
  CHECK (booking_mode IN ('koralink', 'self'));
ALTER TABLE matches ADD COLUMN booking_slot_id VARCHAR(36)
  REFERENCES pitch_slots(id) ON DELETE SET NULL;
```

### 2.3 Drizzle Schema Updates (in `schema.ts`)

```typescript
// New enum
export const bookingModeEnum = pgEnum('BookingMode', ['koralink', 'self']);

// New table
export const pitch_slots = pgTable('pitch_slots', {
  id: varchar('id', { length: 36 }).primaryKey().$defaultFn(() => randomUUID()),
  pitch_id: varchar('pitch_id', { length: 36 }).notNull().references(() => pitches.id, { onDelete: 'cascade' }),
  slot_date: date('slot_date').notNull(),
  start_time: time('start_time').notNull(),
  end_time: time('end_time').notNull(),
  is_booked: boolean('is_booked').notNull().default(false),
  booked_match_id: varchar('booked_match_id', { length: 36 }).references(() => matches.id, { onDelete: 'set null' }),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  unique_slot: uniqueIndex('uq_pitch_slot').on(table.pitch_id, table.slot_date, table.start_time),
  pitchDateIdx: index('idx_pitch_slots_pitch_date').on(table.pitch_id, table.slot_date),
}));

// Venues table: add column
// matches table: add columns
```

---

## 3. API Route Changes

### 3.1 Modified: `POST /matches` (Create Match)

**Current DTO fields retained:**
`pitch_id`, `title`, `match_type`, `gender_rule`, `scheduled_at`, `duration_mins`, `max_players`, `pitchCostSar`

**New DTO fields:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `booking_mode` | `'koralink' \| 'self'` | Yes (default: `'self'`) | Who handles pitch booking |
| `booking_slot_id` | `string` (UUID) | Conditional — required when `booking_mode = 'koralink'` | The reserved slot |

### 3.2 New: `GET /pitches/:id/slots`

Returns available time slots for a specific pitch on a specific date.

**Query params:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `date` | `string` (YYYY-MM-DD) | Yes | Calendar date to check |

**Response shape:**

```json
[
  {
    "id": "abc-123",
    "pitch_id": "pitch-uuid",
    "slot_date": "2026-08-15",
    "start_time": "18:00:00",
    "end_time": "19:00:00",
    "is_booked": false
  },
  {
    "id": "abc-124",
    "pitch_id": "pitch-uuid",
    "slot_date": "2026-08-15",
    "start_time": "19:00:00",
    "end_time": "20:00:00",
    "is_booked": true
  }
]
```

### 3.3 Modified: `GET /venues`

**New query param:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `is_koralink_partner` | `boolean` | No | Filter to partner venues only |

### 3.4 Modified: `GET /venues/:id`

Response now includes the `is_koralink_partner` field (already part of venue select, just needs Drizzle column select update).

### 3.5 New (optional): `GET /pitches/:id/slots/available-dates`

Returns which dates in a range have at least one available slot.

**Query params:** `from` (YYYY-MM-DD), `to` (YYYY-MM-DD)

**Response:** `["2026-08-15", "2026-08-17", "2026-08-20"]`

> **Decision:** Defer to Slice 2-3. Calendar date picker can show all dates initially; we disable dates with no slots on the client after slot data loads. This avoids an extra round-trip.

---

## 4. Atomic Slot Booking (Scalable Approach)

### The `createMatch` Service Flow (Modified)

```typescript
async createMatch(hostId: string, dto: CreateMatchDto) {
  // Validate pitch exists + get venue location (existing)
  // ...

  const created = await this.db.transaction(async (tx) => {
    // ── NEW: Atomic slot booking ────────────────────────
    if (dto.booking_mode === 'koralink') {
      if (!dto.booking_slot_id) {
        throw new BadRequestException('booking_slot_id is required for koralink mode');
      }

      // SELECT ... FOR UPDATE locks the row atomically
      const [slot] = await tx.execute(sql`
        SELECT id, is_booked
        FROM pitch_slots
        WHERE id = ${dto.booking_slot_id}::text
        FOR UPDATE
      `);

      if (!slot) {
        throw new NotFoundException('Slot not found');
      }

      if (slot.is_booked) {
        throw new ConflictException('This slot has already been booked.');
      }
    }

    // 1. Create match (existing)
    const [match] = await tx.insert(matches).values({...}).returning();

    // ── NEW: Mark slot as booked ────────────────────────
    if (dto.booking_mode === 'koralink') {
      await tx
        .update(pitch_slots)
        .set(withTimestamp({ is_booked: true, booked_match_id: match.id }))
        .where(eq(pitch_slots.id, dto.booking_slot_id));
    }

    // 2. Add host to match_players (existing)
    // ...
    return match;
  });

  return this.findOne(created.id);
}
```

**Why `SELECT ... FOR UPDATE` is scalable:**
- Row-level lock — only blocks concurrent transactions trying to book the SAME slot
- Other slots on the same pitch are unaffected
- Lock is released when the transaction commits/rolls back
- No application-level distributed lock needed
- PostgreSQL handles it natively with zero additional infrastructure

---

## 5. Frontend Component Architecture

### 5.1 File Structure

```
apps/player-pwa/src/
├── components/host/
│   ├── HostMatchForm.tsx          ← Outer shell (mode toggle + layout)
│   ├── ModeToggle.tsx             ← NEW: Top bar pill toggle
│   ├── BookViaUsForm.tsx          ← NEW: "Book via Us" mode
│   ├── BookYourselfForm.tsx       ← Extracted from current HostMatchForm
│   ├── VenuePickerSheet.tsx       ← Extracted reusable bottom sheet
│   ├── PitchSelector.tsx          ← Extracted pitch list
│   ├── SlotPicker.tsx             ← NEW: Date + time slot grid
│   ├── PublishWarningSheet.tsx    ← NEW: Confirmation/warning modal
│   ├── MatchDetailsForm.tsx       ← Extracted shared fields
│   └── CostFooter.tsx             ← Extracted sticky footer
├── hooks/
│   ├── usePitchSlots.ts           ← NEW: fetch slots for pitch+date
│   └── useMatches.ts              ← MODIFIED: hostMatchSchema + useCreateMatch
├── lib/
│   └── api-adapter.ts             ← Optional: PitchSlotApi type
└── messages/
    ├── en.json                    ← MODIFIED: ~20 new host.* keys
    └── ar.json                    ← MODIFIED: ~20 new host.* keys
```

### 5.2 Component Responsibilities

| Component | Lines (est.) | Responsibility |
|-----------|-------------|----------------|
| `HostMatchForm.tsx` | ~80 | Mode state (`useState<'koralink'\|'self'>`), renders ModeToggle + active form + CostFooter. Shared form state lifted here (title, format, type, gender, date, time, duration). |
| `ModeToggle.tsx` | ~40 | Two-pill toggle. Emits `onModeChange`. Calls PostHog on toggle. |
| `BookViaUsForm.tsx` | ~120 | Orchestrates partner-venue picker → pitch selector → slot picker → match details. Validates slot selection before enabling publish. |
| `BookYourselfForm.tsx` | ~80 | Current venue picker → pitch selector → match details flow. Triggers PublishWarningSheet. |
| `VenuePickerSheet.tsx` | ~150 | Reusable bottom sheet. Accepts `filterPartner?: boolean` prop. Search, loading, empty, populated states. |
| `PitchSelector.tsx` | ~60 | List of pitches for selected venue. Accepts `pitches: PitchApi[]`. Shows name, size, surface, rate. |
| `SlotPicker.tsx` | ~120 | Date picker (shows dates with available slots highlighted) + time slot chips (available=green, booked=gray). |
| `PublishWarningSheet.tsx` | ~60 | Bottom sheet. Two variants: "koralink" (brand-colored, reassuring) and "self" (amber warning). Confirm/Cancel buttons. |
| `MatchDetailsForm.tsx` | ~80 | Shared: title input, format pills, match type pills, gender pills, date+time pickers, duration pills. |
| `CostFooter.tsx` | ~50 | Sticky footer: player share + pitch cost + publish CTA. Accepts computed cost values as props. |

### 5.3 State Lifting Strategy

```
HostMatchForm (parent)
├── mode: 'koralink' | 'self'           ← useState
├── selectedVenue: VenueApi | null      ← useState
├── selectedPitch: PitchApi | null      ← useState
├── selectedSlot: PitchSlotApi | null   ← useState (NEW)
├── title, format, matchType, etc.      ← useState (existing, lifted up)
├── showWarning: boolean                ← useState (NEW)
│
├── → ModeToggle: receives mode + setMode
├── → BookViaUsForm: receives shared state, venue/slot-specific state
├── → BookYourselfForm: receives shared state, venue state
├── → CostFooter: receives mode, pitch, slot, computed costs
└── → PublishWarningSheet: receives mode, onConfirm, onCancel
```

**Key rule:** Venue + pitch + slot reset when mode toggles. Shared fields (title, format, type, gender, date, time, duration) are preserved.

---

## 6. Data Flow Diagrams

### 6.1 "Book via Us" — Full Flow

```
User selects "Book via Us" mode
        │
        ▼
Tap "Select Venue" → VenuePickerSheet opens
        │  GET /venues?is_koralink_partner=true
        ▼
User picks venue → PitchSelector shows pitches
        │  venues returned with pitches array
        ▼
User picks pitch → SlotPicker activates
        │  GET /pitches/:id/slots?date=2026-08-15
        ▼
Date picker → user selects date → slots load
        │  [available=green, booked=gray]
        ▼
User picks available slot → slot state set
        │
        ▼
MatchDetailsForm (shared fields)
        │
        ▼
CostFooter updates (slot cost reflected)
        │
        ▼
User taps "Publish Match" → PublishWarningSheet (koralink variant)
        │  "KoraLink secures this pitch for you. You control the match."
        ▼
User confirms → POST /matches
        │  { ...matchData, booking_mode: 'koralink', booking_slot_id: 'xyz' }
        ▼
Backend: SELECT FOR UPDATE slot → check !booked → mark booked → create match
        │
        ▼
Redirect to /play
```

### 6.2 "Book by Yourself" — Full Flow

```
User selects "Book by Yourself" mode
        │
        ▼
Tap "Select Venue" → VenuePickerSheet (all venues)
        │  GET /venues?city=Riyadh
        ▼
User picks venue → PitchSelector
        ▼
User picks pitch → MatchDetailsForm
        │
        ▼
User taps "Publish Match" → PublishWarningSheet (self variant) ⚠️ NEW
        │  "⚠️ You are responsible for: booking the pitch,
        │   preparing it, controlling match tempo.
        │   If the venue is unavailable at kick-off,
        │   your account will be held liable to refund all players."
        │  [ Cancel ]  [ I Understand — Publish ]
        ▼
User confirms → POST /matches
        │  { ...matchData, booking_mode: 'self' }
        ▼
Backend: create match (existing flow, no slot booking)
        │
        ▼
Redirect to /play
```

---

## 7. Files Changed — Complete Inventory

### Backend (`apps/api/`)

| File | Action | Description |
|------|--------|-------------|
| `src/database/schema.ts` | MODIFY | Add `pitch_slots` table, `booking_mode` + `booking_slot_id` columns on matches, `is_koralink_partner` on venues |
| `src/modules/matches/dto/create-match.dto.ts` | MODIFY | Add `booking_mode` (required, enum) + `booking_slot_id` (optional, conditional) |
| `src/modules/matches/matches.service.ts` | MODIFY | Add atomic slot booking in `createMatch()`. Update `findNearby()` to include `booking_mode` in SELECT. |
| `src/modules/matches/matches.controller.ts` | MINOR | No route changes needed — `createMatch` DTO handles new fields |
| `src/modules/venues/venues.service.ts` | MODIFY | Add `is_koralink_partner` filter param to `findAll()`. Include `is_koralink_partner` in venue select. |
| `src/modules/venues/venues.controller.ts` | MODIFY | Add `is_koralink_partner` query param to `GET /venues` |
| `src/modules/venues/dto/get-venues.dto.ts` | MODIFY | Add `is_koralink_partner?` query field |
| `src/modules/pitches/pitches.controller.ts` | NEW or MODIFY | Add `GET /pitches/:id/slots` endpoint |
| `src/modules/pitches/pitches.service.ts` | NEW or MODIFY | Add `getSlots(pitchId, date)` method |
| `src/modules/pitches/dto/get-slots.dto.ts` | NEW | Query DTO: `date` (ISO date string) |
| `drizzle/` | MIGRATION | Generated migration for new table + columns |

### Frontend (`apps/player-pwa/`)

| File | Action | Description |
|------|--------|-------------|
| `src/components/host/HostMatchForm.tsx` | REFACTOR | **Break down from 507 lines to ~80 lines** — becomes outer shell with mode state + shared layout |
| `src/components/host/ModeToggle.tsx` | NEW | Top bar pill toggle component |
| `src/components/host/BookViaUsForm.tsx` | NEW | "Book via Us" flow |
| `src/components/host/BookYourselfForm.tsx` | NEW (extracted) | "Book by Yourself" flow — current logic extracted |
| `src/components/host/VenuePickerSheet.tsx` | NEW (extracted) | Reusable bottom sheet from current inline code |
| `src/components/host/PitchSelector.tsx` | NEW (extracted) | Pitch list from current inline code |
| `src/components/host/SlotPicker.tsx` | NEW | Date + time slot grid |
| `src/components/host/PublishWarningSheet.tsx` | NEW | Confirmation bottom sheet (two variants) |
| `src/components/host/MatchDetailsForm.tsx` | NEW (extracted) | Shared form fields |
| `src/components/host/CostFooter.tsx` | NEW (extracted) | Sticky footer with cost calc |
| `src/hooks/usePitchSlots.ts` | NEW | `usePitchSlots(pitchId, date)` hook |
| `src/hooks/useMatches.ts` | MODIFY | Update `hostMatchSchema` Zod schema + `useCreateMatch` mutation |
| `src/hooks/useVenues.ts` | MODIFY | Update `useVenues()` to accept `isKoralinkPartner` param. Add `PitchSlotApi` type. |
| `src/lib/api-adapter.ts` | MODIFY | Add `PitchSlotApi` interface if needed |
| `src/messages/en.json` | MODIFY | ~20 new host.* keys |
| `src/messages/ar.json` | MODIFY | ~20 new host.* keys |
| `src/types/index.ts` | MODIFY | Add `PitchSlot` type if consumed beyond hooks |

---

## 8. i18n Keys Needed

### New keys (under `host.*` namespace)

| Key | en | ar |
|-----|----|----|
| `host.bookViaUs` | "Book via Us" | "احجز عن طريقنا" |
| `host.bookYourself` | "Book by Yourself" | "احجز بنفسك" |
| `host.viaUsDescription` | "We secure the pitch — you control the match." | "نحن نؤمن الملعب — أنت تدير المباراة." |
| `host.yourselfDescription` | "You handle everything — we connect the players." | "أنت تتولى كل شيء — ونحن نوصل اللاعبين." |
| `host.selectSlot` | "Select a Time Slot" | "اختر وقت الحجز" |
| `host.noSlotsAvailable` | "No slots available for this date" | "لا توجد أوقات متاحة لهذا التاريخ" |
| `host.slotAvailable` | "Available" | "متاح" |
| `host.slotBooked` | "Booked" | "محجوز" |
| `host.slotDate` | "Date" | "التاريخ" |
| `host.slotTime` | "Time" | "الوقت" |
| `host.warningTitle` | "Before You Publish" | "قبل النشر" |
| `host.warningSelfBody` | "You are responsible for booking the pitch, preparing it, and controlling match tempo. If the venue is unavailable at kick-off, your account will be held liable to refund all paying players." | "أنت مسؤول عن حجز الملعب وتجهيزه والتحكم في إيقاع المباراة. إذا لم يكن الملعب متاحًا عند انطلاق المباراة، فسيتم تحميل حسابك مسؤولية استرداد المبلغ لجميع اللاعبين." |
| `host.warningViaUsBody` | "KoraLink secures this pitch for you at the selected time. You are responsible for showing up and managing the match." | "تقوم كورالينك بتأمين الملعب لك في الوقت المحدد. أنت مسؤول عن الحضور وإدارة المباراة." |
| `host.warningConfirmSelf` | "I Understand — Publish" | "أفهم — نشر المباراة" |
| `host.warningConfirmViaUs` | "Confirm & Publish" | "تأكيد ونشر" |
| `host.warningCancel` | "Cancel" | "إلغاء" |
| `host.slotCost` | "Slot cost:" | "تكلفة الحجز:" |
| `host.partnerVenuesOnly` | "Partner Venues" | "الملاعب الشريكة" |
| `host.searchPartnerVenues` | "Search partner venues..." | "ابحث في الملاعب الشريكة..." |

---

## 9. What is Explicitly Descoped

| Item | Reason |
|------|--------|
| Slot CRUD admin API | Manual SQL seeding for now; admin panel later |
| Slot recurrence (weekly patterns) | MVP uses specific dates only |
| Calendar integration (Google/iCal) | Out of scope for this feature |
| Slot cancellation flow | Match cancellation already handles this (slot freed via `ON DELETE SET NULL`) |
| Venue owner slot management dashboard | Future feature |
| Availability window beyond 2 weeks | No limit enforced — pitch slots seeded as far out as needed |
| Payment for "via Us" booking | Existing wallet handles payment; slot price is the pitch hourly rate |
| Push notification for slot reminders | Future feature |

---

## 10. Risks & Mitigations

| Risk | Severity | Mitigation |
|------|----------|------------|
| **Refactor breaks existing flow** | HIGH | "Book by Yourself" is the existing flow plus ONE new component (PublishWarningSheet). Extract then enhance — never refactor AND add features simultaneously. Slice 0 is pure extraction with build verification. |
| **Slot race condition not truly atomic** | MEDIUM | `SELECT ... FOR UPDATE` is PostgreSQL's standard row-locking mechanism. Test with concurrent requests to verify. |
| **Date picker shows dates with no slots** | LOW | Client-side: after fetching slots for a date, if empty, gray out that date. Show a "no slots" message in the slot area. |
| **Partner venue has no pitches** | LOW | Validate on the client: if venue has 0 pitches, show empty state. |
| **i18n drift** | LOW | All keys enumerated in Gate 3. Both files committed together. |

---

**Status:** ⏸️ PENDING APPROVAL — awaiting user review before Gate 3 (Program Design)
