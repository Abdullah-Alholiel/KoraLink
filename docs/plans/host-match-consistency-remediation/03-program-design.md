# Gate 3 — Program Design: Host Match Consistency Remediation

**Date:** 2026-08-16
**Status:** ⏸️ PENDING APPROVAL

> ⚠️ **Contract gate.** Every shape below is locked. No code until approved.

---

## 1. Canonical Pricing (single source of truth — backend)

```ts
// MatchesService (authoritative)
const PLATFORM_MARGIN_SAR = 5;                       // unchanged
const round2 = (n: number) => Math.ceil(n * 100) / 100;

pitchCostSar   = round2(hourlyRate * durationMins / 60);   // hourlyRate from pitch row
pricePerPlayer = round2(pitchCostSar / (maxPlayers - 1) + PLATFORM_MARGIN_SAR);
```

**Frontend mirror (display-only, must equal the above):**

```ts
// api-adapter.ts
export const PLATFORM_MARGIN_SAR = 5;
export const round2 = (n: number) => Math.ceil(n * 100) / 100;
export function pricePerPlayer(pitchCostSar: number, maxPlayers: number): number {
  if (maxPlayers < 2) return pitchCostSar;
  return round2(pitchCostSar / (maxPlayers - 1) + PLATFORM_MARGIN_SAR);
}
export function pitchCostForDuration(hourlyRate: number, durationMins: number): number {
  return round2(hourlyRate * durationMins / 60);
}
```

> **Pinned by test**: `pricePerPlayer(200, 14) === 20.39` and `MatchesService.calculatePricePerPlayer(200, 14) === 20.39` (both `round2(200/13 + 5) = round2(15.3846+5) = round2(20.3846) = 20.39`).

---

## 2. Backend Contracts

### 2.1 `CreateMatchDto` (modified)

```ts
export class CreateMatchDto {
  pitch_id: string;                                   // unchanged
  title: string;                                      // unchanged @MinLength(3)
  match_type: 'Casual' | 'Competitive';               // unchanged
  gender_rule: 'Men Only' | 'Women Only' | 'Mixed';   // unchanged
  scheduled_at: string;                               // unchanged @IsISO8601
  duration_mins: number;                              // unchanged @Min(30) @Max(180)
  max_players: number;                                // unchanged @Min(2) @Max(22)

  @ApiProperty({ deprecated: true, description: 'Ignored — server derives from pitch hourly_rate × duration.' })
  @IsOptional() @IsNumber() @Min(0)
  pitchCostSar?: number;                              // now OPTIONAL + ignored

  @ApiPropertyOptional({ enum: ['koralink','self'], default: 'self' })
  @IsOptional() @IsEnum(['koralink', 'self'])
  booking_mode?: 'koralink' | 'self';                 // now OPTIONAL (service defaults 'self')

  @ApiPropertyOptional({ description: 'Required when booking_mode=koralink' })
  @IsOptional() @IsString()
  booking_slot_id?: string;

  @ApiPropertyOptional({ enum: ['public','private'], default: 'public' })
  @IsOptional() @IsEnum(['public','private'])
  visibility?: 'public' | 'private';
}
```

### 2.2 `createMatch()` — service signature + behavior

```ts
async createMatch(hostId: string, dto: {
  pitch_id: string;
  title: string;
  match_type: MatchType;
  gender_rule: GenderRule;
  scheduled_at: string;
  duration_mins: number;
  max_players: number;
  pitchCostSar?: number;              // IGNORED (server-derived)
  booking_mode?: 'koralink' | 'self';
  booking_slot_id?: string;
  visibility?: 'public' | 'private';
}): Promise<MatchDetailReturn> {

  // fetch pitch + hourly_rate (EXTEND the existing select)
  const [pitch] = await this.db.select({
    id: pitches.id,
    venueLocation: venues.location,
    hourly_rate: pitches.hourly_rate,           // NEW
  }).from(pitches).innerJoin(venues, ...).where(eq(pitches.id, dto.pitch_id)).limit(1);
  // 404 if !pitch

  const bookingMode = dto.booking_mode ?? 'self';
  const visibility  = dto.visibility  ?? 'public';
  const pitchCostSar = round2(parseFloat(pitch.hourly_rate) * dto.duration_mins / 60);  // NEW authoritative
  const pricePerPlayer = this.calculatePricePerPlayer(pitchCostSar, dto.max_players);

  // ... transaction: (koralink) slot FOR UPDATE, insert match with
  //   pitch_cost_sar: pitchCostSar, price_per_player: pricePerPlayer.toString(),
  //   booking_mode: bookingMode, visibility, ...
  //   (koralink) mark slot booked, deduct pitchCostSar from wallet, ledger PITCH_BOOKING
  //   add host to match_players
  // return findOne(created.id)
}
```

**`matches` insert gains one field:** `pitch_cost_sar: pitchCostSar.toString()`.

### 2.3 `cancelMatch()` — corrected refund

```ts
// SELECT adds: pitch_cost_sar: matches.pitch_cost_sar
// refund path (koralink && slot released):
const refundSar = match.pitch_cost_sar
  ? parseFloat(match.pitch_cost_sar)          // exact amount debited at create
  : 0;
if (refundSar > 0) {
  await tx.update(users).set({ wallet_balance: sql`${users.wallet_balance} + ${refundSar.toString()}`, ... }).where(eq(users.id, userId));
  await tx.insert(transactions).values({ user_id: userId, type: 'CREDIT', amount: refundSar.toString(), reference_type: 'REFUND', reference_id: matchId, idempotency_key: `refund-${matchId}`, status: 'Completed' });
}
```

> **Removed:** `const pitchCostSar = parseFloat(match.price_per_player) * (match.max_players - 1);` (margin-inflated).

### 2.4 `NearbyMatchRow` — add field

```ts
export interface NearbyMatchRow {
  // ...existing...
  is_joined: boolean;
  has_voted: boolean;              // NEW — already returned by findNearby SELECT
  visibility: 'public' | 'private';
  voting_closes_at?: Date | null;
}
```

---

## 3. Frontend Contracts

### 3.1 `hostMatchSchema` — now enforced

```ts
// useMatches.ts — useCreateMatch.mutationFn:
mutationFn: async (data) => {
  const parsed = hostMatchSchema.parse(data);          // Zod enforced
  const raw = await fetcher<MatchDetailApi>('/matches', { method: 'POST', body: JSON.stringify(parsed) });
  return adaptMatchDetail(raw);
}
```

### 3.2 `riyadhISO(date, time)` — timezone-correct scheduled_at

```ts
// api-adapter.ts
export function riyadhISO(date: string, time: string): string {
  // date: "YYYY-MM-DD", time: "HH:MM" (Riyadh local, no DST)
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  const asUTC = Date.UTC(y, m - 1, d, hh - 3, mm);  // Riyadh = UTC+3, no DST
  return new Date(asUTC).toISOString();
}
```

Used in `HostMatchForm.doPublish`: `scheduled_at: riyadhISO(date, time)`.

### 3.3 `HostMatchForm` — derived cost + mirror price

```ts
const pitchRate = selectedPitch ? parseFloat(String(selectedPitch.hourly_rate)) : 0;
const pitchCostSar = pitchCostForDuration(pitchRate, duration);        // round2(rate × duration/60)
const playerShare  = pricePerPlayer(pitchCostSar, maxPlayers);         // mirror (+margin, 2dp)
```

Title fallback uses `effectiveFormat` (derived), not `format` state.

### 3.4 `SlotPicker` — Riyadh today

```ts
import { todayInRiyadh } from '@/lib/api-adapter';
const today = todayInRiyadh();   // replaces new Date().toISOString().split('T')[0]
```

### 3.5 `MatchDetailApi` — add booking fields

```ts
export interface MatchDetailApi {
  // ...existing...
  booking_mode?: 'koralink' | 'self';
  booking_slot_id?: string | null;
}
```

---

## 4. Test Contracts (new)

| Test | Asserts |
|------|---------|
| `test/lib/pricing.test.ts` | `pricePerPlayer(200, 14) === 20.39`; `pitchCostForDuration(200, 90) === 300`; `pitchCostForDuration(200, 60) === 200`; `round2` behavior. |
| `test/lib/riyadhISO.test.ts` | `riyadhISO('2026-08-16','18:00') === '2026-08-16T15:00:00.000Z'`. |
| `apps/api` (if test runner present) or contract note | `calculatePricePerPlayer(200, 14) === 20.39`. |
| Regression: refund | cancelMatch refunds `pitch_cost_sar`, not margin-inflated value (unit/integration where available). |

---

## 5. Contract Verification Checklist

- [ ] Every mutation returns `findOne(id)` outside the tx (unchanged — verify no regression).
- [ ] `pitchCostSar` derived server-side; client value ignored.
- [ ] FE `pricePerPlayer` mirror equals BE `calculatePricePerPlayer` (test-pinned).
- [ ] `cancelMatch` refunds `matches.pitch_cost_sar` (exact debit), ledger amount matches.
- [ ] `scheduled_at` built in Riyadh; `dateInRiyadh` display stays consistent.
- [ ] `booking_mode` optional in DTO, defaulted in service — no 400 on omission.
- [ ] Zod `hostMatchSchema` enforced in `useCreateMatch`.
- [ ] `NearbyMatchRow.has_voted` + `MatchDetailApi.booking_mode/booking_slot_id` typed.
- [ ] No i18n key changes needed (existing `host.*` keys cover display).

---

## 6. i18n

No new keys required. Existing `host.playerShare`, `host.pitchCost`, `host.hostPlaysFree`, `host.disclaimer*`, `host.warning*` are reused. (If the refund messaging on the cancel sheet needs to say "refund includes the platform margin", add one key — flagged in Gate 4 Slice 2.)
