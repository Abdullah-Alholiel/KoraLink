# Gate 3 — Program Design: Host Match Dual Mode

**Date:** 2026-08-11
**Status:** ⏸️ PENDING APPROVAL

> ⚠️ **This is the contract gate.** No code is written until every shape below is approved.
> Every API response, TypeScript signature, Zod schema, and i18n key is locked here.

---

## 1. Backend Contracts

### 1.1 Modified: `CreateMatchDto` (with new fields)

**File:** `apps/api/src/modules/matches/dto/create-match.dto.ts`

```typescript
import {
  IsString, IsNumber, IsInt, IsEnum, IsISO8601,
  IsOptional, Min, Max, MinLength, MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateMatchDto {
  @ApiProperty({ description: 'Pitch UUID' })
  @IsString()
  pitch_id: string;

  @ApiProperty({ description: 'Match title', minLength: 3, maxLength: 255 })
  @IsString()
  @MinLength(3)
  @MaxLength(255)
  title: string;

  @ApiProperty({ enum: ['Casual', 'Competitive'] })
  @IsEnum(['Casual', 'Competitive'])
  match_type: 'Casual' | 'Competitive';

  @ApiProperty({ enum: ['Men Only', 'Women Only', 'Mixed'] })
  @IsEnum(['Men Only', 'Women Only', 'Mixed'])
  gender_rule: 'Men Only' | 'Women Only' | 'Mixed';

  @ApiProperty({ description: 'Scheduled kick-off time (ISO 8601)' })
  @IsISO8601()
  scheduled_at: string;

  @ApiProperty({ description: 'Match duration in minutes', minimum: 30, maximum: 180 })
  @IsInt()
  @Min(30)
  @Max(180)
  duration_mins: number;

  @ApiProperty({ description: 'Maximum number of players', minimum: 2, maximum: 22 })
  @IsInt()
  @Min(2)
  @Max(22)
  max_players: number;

  @ApiProperty({ description: 'Total pitch rental cost in SAR', minimum: 0 })
  @IsNumber()
  @Min(0)
  pitchCostSar: number;

  // ── NEW FIELDS ──────────────────────────────────────────────
  @ApiProperty({ enum: ['koralink', 'self'], default: 'self',
    description: 'Who handles pitch booking' })
  @IsEnum(['koralink', 'self'])
  booking_mode: 'koralink' | 'self';

  @ApiPropertyOptional({ description: 'Slot ID — required when booking_mode = koralink' })
  @IsOptional()
  @IsString()
  booking_slot_id?: string;
}
```

### 1.2 New: `GET /pitches/:id/slots` Response

**File:** `apps/api/src/modules/pitches/pitches.controller.ts` (new endpoint)

```typescript
// GET /pitches/:id/slots?date=2026-08-15
// Response (200):
[
  {
    "id": "0193a456-7b89-4cde-f012-3456789abcde",
    "pitch_id": "0193a456-7b01-4cde-f012-3456789abc01",
    "slot_date": "2026-08-15",
    "start_time": "18:00:00",
    "end_time": "19:00:00",
    "is_booked": false,
    "booked_match_id": null,
    "created_at": "2026-08-10T12:00:00.000Z",
    "updated_at": "2026-08-10T12:00:00.000Z"
  },
  {
    "id": "0193a456-7b89-4cde-f012-3456789abcdf",
    "pitch_id": "0193a456-7b01-4cde-f012-3456789abc01",
    "slot_date": "2026-08-15",
    "start_time": "19:00:00",
    "end_time": "20:00:00",
    "is_booked": true,
    "booked_match_id": "0193a456-7b89-4cde-f012-3456789abcff",
    "created_at": "2026-08-10T12:00:00.000Z",
    "updated_at": "2026-08-11T14:30:00.000Z"
  }
]
```

**DTO:** `apps/api/src/modules/pitches/dto/get-slots.dto.ts`

```typescript
import { IsISO8601 } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class GetSlotsDto {
  @ApiProperty({ description: 'Date to query slots for (YYYY-MM-DD)' })
  @IsISO8601({ strict: true })
  date: string;
}
```

### 1.3 Modified: `createMatch()` Service Method Signature

**File:** `apps/api/src/modules/matches/matches.service.ts`

```typescript
// ── TypeScript return type ──────────────────────────
// Returns: Drizzle relational query result (MatchDetailApi equivalent shape)
// Same as findOne(id) — fully populated with host, pitch, venue, players
async createMatch(
  hostId: string,
  dto: {
    pitch_id: string;
    title: string;
    match_type: 'Casual' | 'Competitive';
    gender_rule: 'Men Only' | 'Women Only' | 'Mixed';
    scheduled_at: string;
    duration_mins: number;
    max_players: number;
    pitchCostSar: number;
    booking_mode: 'koralink' | 'self';     // NEW
    booking_slot_id?: string;               // NEW
  },
): Promise<MatchDetailReturn> {
  // 1. Validate pitch (existing)
  // 2. Atomic slot booking (NEW — see below)
  // 3. Create match in transaction (existing)
  // 4. Add host to players (existing)
  // 5. Return this.findOne(created.id) — OUTSIDE transaction
}
```

**Atomic slot booking pseudocode (inside `this.db.transaction`):**

```typescript
if (dto.booking_mode === 'koralink') {
  if (!dto.booking_slot_id) {
    throw new BadRequestException('booking_slot_id is required for koralink mode');
  }

  // SELECT ... FOR UPDATE locks the row until tx commit/rollback
  const [slot] = await tx.execute(sql`
    SELECT id, is_booked FROM pitch_slots
    WHERE id = ${dto.booking_slot_id}::text
    FOR UPDATE
  `) as unknown as [{ id: string; is_booked: boolean }];

  if (!slot) {
    throw new NotFoundException('Slot not found');
  }
  if (slot.is_booked) {
    throw new ConflictException('This slot has already been booked');
  }
}

// ... create match ...

if (dto.booking_mode === 'koralink') {
  await tx
    .update(pitch_slots)
    .set(withTimestamp({ is_booked: true, booked_match_id: match.id }))
    .where(eq(pitch_slots.id, dto.booking_slot_id!));
}
```

### 1.4 Modified: `GET /venues` Query Params

**File:** `apps/api/src/modules/venues/dto/get-venues.dto.ts`

```typescript
import { IsOptional, IsBoolean } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class GetVenuesDto {
  @ApiPropertyOptional({ description: 'City name to filter by' })
  @IsOptional()
  city?: string;

  // ── NEW ────────────────────────────────────────────
  @ApiPropertyOptional({ description: 'Filter to KoraLink partner venues only' })
  @IsOptional()
  @IsBoolean()
  is_koralink_partner?: boolean;
}
```

### 1.5 Modified: `GET /venues/:id` Response — added field

**Current response + new field:**

```json
{
  "id": "venue-uuid",
  "name": "Al Hilal Club",
  "city": "Riyadh",
  "address": "King Fahd Road",
  "amenities": ["parking", "changing_rooms"],
  "rating": 4.5,
  "is_approved": true,
  "is_koralink_partner": true,        // ← NEW
  "distance_m": 3200.5,
  "owner_id": "owner-uuid",
  "owner_name": "Ahmed",
  "pitch_count": 3,
  "pitches": [
    {
      "id": "pitch-uuid",
      "name": "Field A",
      "size": "11v11",
      "surface_type": "Natural Grass",
      "hourly_rate": 200,
      "environment": "Outdoor"
    }
  ]
}
```

> **Note:** `is_koralink_partner` is added to the Drizzle select in `venues.service.ts` — fetch it by adding `is_koralink_partner: true` to the column selection.

---

## 2. Frontend Contracts

### 2.1 Zod Schema — `hostMatchSchema` (MODIFIED)

**File:** `apps/player-pwa/src/hooks/useMatches.ts`

```typescript
import { z } from 'zod';

export const hostMatchSchema = z.object({
  pitch_id: z.string().min(1, 'Venue / pitch is required'),
  title: z.string().min(3, 'Title must be at least 3 characters').max(255),
  match_type: z.enum(['Casual', 'Competitive']),
  gender_rule: z.enum(['Men Only', 'Women Only', 'Mixed']),
  scheduled_at: z.string().min(1, 'Date and time are required'),
  duration_mins: z.number().int().min(30).max(180).default(60),
  max_players: z.number().int().min(2).max(22).default(14),
  pitchCostSar: z.number().min(0).default(0),
  // ── NEW ─────────────────────────────────────────
  booking_mode: z.enum(['koralink', 'self']).default('self'),
  booking_slot_id: z.string().min(1).optional(),
});

export type HostMatchInput = z.infer<typeof hostMatchSchema>;
```

### 2.2 New API Type: `PitchSlotApi`

**File:** `apps/player-pwa/src/hooks/usePitchSlots.ts` (NEW)

```typescript
export interface PitchSlotApi {
  id: string;
  pitch_id: string;
  slot_date: string;      // "2026-08-15"
  start_time: string;     // "18:00:00"
  end_time: string;       // "19:00:00"
  is_booked: boolean;
  booked_match_id: string | null;
}

export type PitchSlot = PitchSlotApi; // domain type (no adaptation needed — time is display-ready)
```

### 2.3 New Hook: `usePitchSlots`

**File:** `apps/player-pwa/src/hooks/usePitchSlots.ts`

```typescript
'use client';

import { useQuery } from '@tanstack/react-query';
import { fetcher, FetchError } from '@/lib/fetcher';
import type { PitchSlotApi } from './usePitchSlots';

export function usePitchSlots(pitchId: string | null, date: string | null) {
  return useQuery<PitchSlotApi[], FetchError>({
    queryKey: ['pitch-slots', pitchId, date],
    queryFn: () => fetcher<PitchSlotApi[]>(
      `/pitches/${pitchId}/slots?date=${date}`
    ),
    enabled: !!pitchId && !!date,
    staleTime: 30_000, // 30s — slots can change quickly
  });
}
```

### 2.4 Modified Hook: `useVenues` — new param

**File:** `apps/player-pwa/src/hooks/useVenues.ts`

```typescript
// ── MODIFIED signature ──────────────────────────────
export function useVenues(params?: {
  lat?: number;
  lng?: number;
  city?: string;
  is_koralink_partner?: boolean;  // NEW
}) {
  return useQuery<VenueApi[], FetchError>({
    queryKey: ['venues', params],
    queryFn: () => {
      const searchParams: Record<string, string> = {};
      if (params?.lat != null) searchParams.lat = String(params.lat);
      if (params?.lng != null) searchParams.lng = String(params.lng);
      if (params?.city) searchParams.city = params.city;
      if (params?.is_koralink_partner != null)
        searchParams.is_koralink_partner = String(params.is_koralink_partner);
      return fetcher<VenueApi[]>(`/venues`, {
        params: Object.keys(searchParams).length > 0 ? searchParams : undefined,
      });
    },
    staleTime: 300_000,
  });
}
```

### 2.5 Modified: `useCreateMatch` — mutation with new contract

**File:** `apps/player-pwa/src/hooks/useMatches.ts`

```typescript
export function useCreateMatch() {
  const queryClient = useQueryClient();

  return useMutation<Match, Error, HostMatchInput>({
    mutationFn: async (data) => {
      const raw = await fetcher<MatchDetailApi>('/matches', {
        method: 'POST',
        body: JSON.stringify(data),
      });
      return adaptMatchDetail(raw);
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['matches'] });
      // If koralink mode, also invalidate slots for that pitch
      if (variables.booking_mode === 'koralink' && variables.booking_slot_id) {
        queryClient.invalidateQueries({ queryKey: ['pitch-slots'] });
      }
      // PostHog event (Slice 3)
    },
  });
}
```

### 2.6 Component Prop Contracts

#### `HostMatchForm.tsx` (outer shell)
```
No props — self-contained page component.
State:
  mode: 'koralink' | 'self'          (default: 'self' or localStorage)
  selectedVenue: VenueApi | null     (reset on mode toggle)
  selectedPitch: PitchApi | null     (reset on mode toggle)
  selectedSlot: PitchSlotApi | null  (reset on mode toggle, koralink only)
  // Shared form state (preserved on mode toggle):
  title, format, matchType, genderRule, date, time, duration
  showWarning: boolean
```

#### `ModeToggle.tsx`
```typescript
interface ModeToggleProps {
  mode: 'koralink' | 'self';
  onModeChange: (mode: 'koralink' | 'self') => void;
}
```

#### `BookViaUsForm.tsx`
```typescript
interface BookViaUsFormProps {
  // Shared state (controlled by parent)
  title: string; setTitle: (v: string) => void;
  format: Format; setFormat: (v: Format) => void;
  matchType: MatchTypeValue; setMatchType: (v: MatchTypeValue) => void;
  genderRule: GenderRule; setGenderRule: (v: GenderRule) => void;
  date: string; setDate: (v: string) => void;
  time: string; setTime: (v: string) => void;
  duration: number; setDuration: (v: number) => void;
  // Mode-specific state
  selectedVenue: VenueApi | null; setSelectedVenue: (v: VenueApi | null) => void;
  selectedPitch: PitchApi | null; setSelectedPitch: (v: PitchApi | null) => void;
  selectedSlot: PitchSlotApi | null; setSelectedSlot: (v: PitchSlotApi | null) => void;
}
```

#### `BookYourselfForm.tsx`
```typescript
interface BookYourselfFormProps {
  // Shared state (same as above)
  title: string; setTitle: (v: string) => void;
  format: Format; setFormat: (v: Format) => void;
  matchType: MatchTypeValue; setMatchType: (v: MatchTypeValue) => void;
  genderRule: GenderRule; setGenderRule: (v: GenderRule) => void;
  date: string; setDate: (v: string) => void;
  time: string; setTime: (v: string) => void;
  duration: number; setDuration: (v: number) => void;
  // Mode-specific
  selectedVenue: VenueApi | null; setSelectedVenue: (v: VenueApi | null) => void;
  selectedPitch: PitchApi | null; setSelectedPitch: (v: PitchApi | null) => void;
  // No slot state needed
}
```

#### `VenuePickerSheet.tsx`
```typescript
interface VenuePickerSheetProps {
  open: boolean;
  onClose: () => void;
  onSelect: (venue: VenueApi) => void;
  filterPartnerOnly?: boolean;  // NEW — filters to koralink partners
}
```

#### `PitchSelector.tsx`
```typescript
interface PitchSelectorProps {
  pitches: PitchApi[];
  selectedPitch: PitchApi | null;
  onSelect: (pitch: PitchApi) => void;
}
```

#### `SlotPicker.tsx`
```typescript
interface SlotPickerProps {
  pitchId: string | null;
  selectedSlot: PitchSlotApi | null;
  onSelectSlot: (slot: PitchSlotApi) => void;
}
```

#### `PublishWarningSheet.tsx`
```typescript
interface PublishWarningSheetProps {
  open: boolean;
  mode: 'koralink' | 'self';
  onConfirm: () => void;
  onCancel: () => void;
  isPending: boolean;
}
```

#### `MatchDetailsForm.tsx`
```typescript
interface MatchDetailsFormProps {
  title: string; setTitle: (v: string) => void;
  format: Format; setFormat: (v: Format) => void;
  matchType: MatchTypeValue; setMatchType: (v: MatchTypeValue) => void;
  genderRule: GenderRule; setGenderRule: (v: GenderRule) => void;
  date: string; setDate: (v: string) => void;
  time: string; setTime: (v: string) => void;
  duration: number; setDuration: (v: number) => void;
}
```

#### `CostFooter.tsx`
```typescript
interface CostFooterProps {
  mode: 'koralink' | 'self';
  selectedPitch: PitchApi | null;
  selectedSlot: PitchSlotApi | null;
  maxPlayers: number;
  onPublish: () => void;
  canPublish: boolean;
  isPending: boolean;
  isError: boolean;
}
```

---

## 3. Form Data → DTO Mapping Contract

### `handlePublish()` in `HostMatchForm.tsx`

```typescript
const handlePublish = () => {
  if (!selectedPitch || !date || !time) return;

  const scheduledAt = new Date(`${date}T${time}:00`).toISOString();
  const playersPerSide = format ? parseInt(format.split('v')[0]) : 7;
  const maxPlayers = playersPerSide * 2;

  const payload: HostMatchInput = {
    pitch_id: selectedPitch.id,
    title: title.trim() || t('host.matchTitleFallback', { format, venue: selectedVenue?.name ?? t('host.unknownVenue') }),
    match_type: matchType,
    gender_rule: genderRule,
    scheduled_at: scheduledAt,
    duration_mins: duration,
    max_players: maxPlayers,
    pitchCostSar,
    // ── NEW ─────────────────────────────────────
    booking_mode: mode,
    booking_slot_id: mode === 'koralink' ? selectedSlot?.id : undefined,
  };

  createMatch.mutate(payload, {
    onSuccess: () => router.push(`/${locale}/play`),
  });
};

const canPublish = selectedPitch && date && time
  && (title.length === 0 || title.length >= 3)
  && (mode === 'self' || (mode === 'koralink' && selectedSlot !== null));
  // ↑ NEW: koralink mode requires a selected slot
```

---

## 4. i18n Key Contracts

### 4.1 `en.json` — Host namespace additions

```json
{
  "host": {
    "bookViaUs": "Book via Us",
    "bookYourself": "Book by Yourself",
    "viaUsDescription": "We secure the pitch — you control the match.",
    "yourselfDescription": "You handle everything — we connect the players.",
    "selectSlot": "Select a Time Slot",
    "noSlotsAvailable": "No slots available for this date",
    "slotAvailable": "Available",
    "slotBooked": "Booked",
    "slotDate": "Date",
    "slotTime": "Time",
    "pickDateFirst": "Pick a date to see available slots",
    "warningTitle": "Before You Publish",
    "warningSelfBody": "You are responsible for booking the pitch, preparing it, and controlling match tempo. If the venue is unavailable at kick-off, your account will be held liable to refund all paying players.",
    "warningViaUsBody": "KoraLink guarantees this pitch at the time you selected. You are responsible for showing up and managing the match.",
    "warningConfirmSelf": "I Understand — Publish",
    "warningConfirmViaUs": "Confirm & Publish",
    "warningCancel": "Cancel",
    "slotCost": "Slot cost:",
    "partnerVenuesOnly": "Partner Venues",
    "searchPartnerVenues": "Search partner venues...",
    "slotConflictError": "This slot was just booked by another host. Please pick another."
  }
}
```

### 4.2 `ar.json` — Host namespace additions

```json
{
  "host": {
    "bookViaUs": "احجز عن طريقنا",
    "bookYourself": "احجز بنفسك",
    "viaUsDescription": "نحن نؤمن الملعب — أنت تدير المباراة.",
    "yourselfDescription": "أنت تتولى كل شيء — ونحن نوصل اللاعبين.",
    "selectSlot": "اختر وقت الحجز",
    "noSlotsAvailable": "لا توجد أوقات متاحة لهذا التاريخ",
    "slotAvailable": "متاح",
    "slotBooked": "محجوز",
    "slotDate": "التاريخ",
    "slotTime": "الوقت",
    "pickDateFirst": "اختر تاريخًا لعرض الأوقات المتاحة",
    "warningTitle": "قبل النشر",
    "warningSelfBody": "أنت مسؤول عن حجز الملعب وتجهيزه والتحكم في إيقاع المباراة. إذا لم يكن الملعب متاحًا عند انطلاق المباراة، فسيتم تحميل حسابك مسؤولية استرداد المبلغ لجميع اللاعبين.",
    "warningViaUsBody": "تضمن كورالينك حجز هذا الملعب في الوقت الذي اخترته. أنت مسؤول عن الحضور وإدارة المباراة.",
    "warningConfirmSelf": "أفهم — نشر المباراة",
    "warningConfirmViaUs": "تأكيد ونشر",
    "warningCancel": "إلغاء",
    "slotCost": "تكلفة الحجز:",
    "partnerVenuesOnly": "الملاعب الشريكة",
    "searchPartnerVenues": "ابحث في الملاعب الشريكة...",
    "slotConflictError": "تم حجز هذا الوقت للتو من قبل مضيف آخر. الرجاء اختيار وقت آخر."
  }
}
```

### 4.3 Existing keys — KEPT UNCHANGED

All existing `host.*` keys remain exactly as-is:
`title`, `subtitle`, `venue`, `format`, `surface`, `date`, `time`, `endTime`, `price`, `currency`, `gender`, `intensity`, `maxSpots`, `rules`, `preview`, `publishMatch`, `selectVenue`, `matchTitleFallback`, `unknownVenue`, `publish`, `publishing`, `success`, `error`, `change`, `selectPitch`, `pitchRate`, `searchVenuesPlaceholder`, `disclaimer`, `disclaimerText`, `matchTitle`, `matchTitlePlaceholder`, `matchTitleValidation`, `matchType`, `matchTypeCasual`, `matchTypeCompetitive`, `genderMen`, `genderWomen`, `genderMixed`, `dateTime`, `selectDate`, `selectTime`, `duration`, `playerShare`, `hostPlaysFree`, `pitchCost`, `selectVenueTitle`, `searchByCity`, `noVenuesFound`, `noVenuesFoundIn`, `createError`

---

## 5. Database Migration Contracts

### 5.1 `pitch_slots` table — schema.ts addition

```typescript
export const pitch_slots = pgTable('pitch_slots', {
  id: varchar('id', { length: 36 }).primaryKey().$defaultFn(() => randomUUID()),
  pitch_id: varchar('pitch_id', { length: 36 })
    .notNull()
    .references(() => pitches.id, { onDelete: 'cascade' }),
  slot_date: date('slot_date').notNull(),
  start_time: time('start_time').notNull(),
  end_time: time('end_time').notNull(),
  is_booked: boolean('is_booked').notNull().default(false),
  booked_match_id: varchar('booked_match_id', { length: 36 })
    .references(() => matches.id, { onDelete: 'set null' }),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  uniqueSlot: uniqueIndex('uq_pitch_slot').on(
    table.pitch_id, table.slot_date, table.start_time
  ),
  pitchDateIdx: index('idx_slots_pitch_date').on(
    table.pitch_id, table.slot_date
  ),
  availableIdx: index('idx_slots_available').on(table.is_booked)
    .where(sql`${table.is_booked} = false`),
}));
```

### 5.2 Venues table columns

```typescript
// In venues pgTable definition, ADD:
is_koralink_partner: boolean('is_koralink_partner').notNull().default(false),
```

### 5.3 Matches table columns

```typescript
// In matches pgTable definition, ADD:
booking_mode: varchar('booking_mode', { length: 20 })
  .notNull()
  .default('self'),
booking_slot_id: varchar('booking_slot_id', { length: 36 })
  .references(() => pitch_slots.id, { onDelete: 'set null' }),
```

---

## 6. Test Impact Contract

### Existing tests MUST pass unchanged:

| Test File | Impact | Notes |
|-----------|--------|-------|
| `hooks/useMatches.test.ts` | `hostMatchSchema` now has 2 extra fields | Add `booking_mode` to test payloads or rely on `.default('self')` |
| `components/host/HostMatchForm.test.tsx` | Massive refactor — component split | Tests need to target new sub-components or be rewritten |
| All other test files | No impact expected | |

### New tests to write (Slice 3):

- `components/host/ModeToggle.test.tsx`
- `components/host/SlotPicker.test.tsx`
- `components/host/PublishWarningSheet.test.tsx`
- `hooks/usePitchSlots.test.ts`

---

## 7. PostHog Events Contract (Slice 3)

| Event Name | Properties | Fire Point |
|-----------|-----------|------------|
| `host_mode_toggled` | `{ mode: 'koralink' \| 'self' }` | On ModeToggle click |
| `host_slot_selected` | `{ pitch_id, slot_id, slot_date }` | On slot chip click in SlotPicker |
| `host_warning_shown` | `{ mode }` | On PublishWarningSheet open |
| `host_match_created` | `{ booking_mode, has_slot: boolean }` | On mutation success |
| `host_slot_conflict_error` | `{ slot_id }` | On 409 Conflict from slot booking |

---

## 8. Contract Verification Checklist

> Run this before Gate 4 approval.

### 1. Mutation Return Types → `MatchDetailApi`

- [ ] `MatchDetailApi` type accepts the full response shape from `findOne`
- [ ] `adaptMatchDetail()` maps all `MatchDetailApi` fields (no new fields in response)
- [ ] `findOne` Drizzle `with:` clauses match all sub-types — NO changes needed to findOne itself
- [ ] Transaction-committed read pattern correct — `findOne` called OUTSIDE `tx`

### 2. New Endpoint (`GET /pitches/:id/slots`)

- [ ] `PitchSlotApi` fields match the SQL SELECT list
- [ ] No field silently `undefined` that the frontend type declares
- [ ] Adapter: raw DB row → `PitchSlotApi` is direct (no transformation needed)
- [ ] `booking_slot_id` → `booked_match_id` nullable, handled gracefully

### 3. Modified Endpoint (`POST /matches`)

- [ ] `CreateMatchDto` has exactly the fields above — no extras, no omissions
- [ ] `hostMatchSchema` Zod schema matches `CreateMatchDto` field-for-field
- [ ] `booking_mode` enum values match: `'koralink' | 'self'` on both sides
- [ ] `booking_slot_id` optional on both sides, conditional in service
- [ ] Slot race condition handled with `SELECT ... FOR UPDATE`
- [ ] Slot freed on match delete via `ON DELETE SET NULL`
- [ ] `createMatch` returns `this.findOne(id)` (confirmed pattern, no change needed)

### 4. Modified Endpoint (`GET /venues`)

- [ ] `is_koralink_partner` query param accepted
- [ ] `VenueApi` includes `is_koralink_partner` field
- [ ] `useVenues()` hook accepts and passes the param
- [ ] Query key unique per param combination

### 5. Frontend Routing & Layout

- [ ] No new routes — `/[locale]/host` stays same
- [ ] No route conflicts
- [ ] Bottom nav not affected

### 6. i18n

- [ ] All 18 new keys present in BOTH `ar.json` and `en.json`
- [ ] Keys under `host.*` namespace (existing convention)
- [ ] No hardcoded strings remain in new components
- [ ] Existing ~35 keys unchanged

### 7. Component Contracts

- [ ] 10 components with explicit prop interfaces defined above
- [ ] State lifting strategy clear: parent holds state, passes down
- [ ] Mode toggle resets venue/pitch/slot; preserves shared fields
- [ ] All interactive elements have onClick/onChange handlers

### 8. Edge Cases

- [ ] Koralink mode: slot required before publish (canPublish check)
- [ ] Koralink mode: slot conflict (409) → user-facing error message
- [ ] Self mode: warning modal shown with explicit responsibility text
- [ ] Self mode: user can cancel warning modal
- [ ] No partner venues: empty state in venue picker
- [ ] No slots on date: "no slots available" message
- [ ] Pitch has 0 pitches: empty state
- [ ] Mode toggle preserves shared fields
- [ ] Loading states for slots, venues, pitches
- [ ] Error states with retry

---

**Status:** ⏸️ PENDING APPROVAL — awaiting user review before Gate 4 (Vertical Slices)
