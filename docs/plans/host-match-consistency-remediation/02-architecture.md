# Gate 2 — Architecture: Host Match Consistency Remediation

**Date:** 2026-08-16
**Status:** ⏸️ PENDING APPROVAL

---

## 1. Architecture Overview

```
┌──────────────────────────────  PWA (Next.js)  ──────────────────────────────┐
│  HostMatchForm                                                              │
│   ├─ pitchCostSar  = round2(hourly_rate × duration/60)   ← mirror only      │
│   ├─ playerShare   = round2(pitchCostSar/(maxPlayers−1) + 5)  ← mirror      │
│   ├─ scheduled_at  = riyadhISO(date, time)               ← NEW helper       │
│   └─ POST /matches (no pitchCostSar trust — server derives)                 │
│                                                                             │
│  useCreateMatch → hostMatchSchema.parse(data)  (Zod enforced)               │
│  CostFooter → renders mirrored playerShare (matches charged price)          │
└──────────────────────────────────┬──────────────────────────────────────────┘
                                   │
                                   ▼
┌──────────────────────────────  NestJS API  ────────────────────────────────┐
│  createMatch():                                                             │
│   1. fetch pitch (id, venueLocation, hourly_rate)                           │
│   2. pitchCostSar = round2(hourly_rate × duration_mins / 60)  ← AUTHORITATIVE│
│   3. pricePerPlayer = calculatePricePerPlayer(pitchCostSar, max_players)     │
│   4. persist matches.pitch_cost_sar = pitchCostSar                           │
│   5. (koralink) deduct pitchCostSar from host wallet + ledger               │
│   6. return findOne(id)                                                     │
│                                                                             │
│  cancelMatch():                                                             │
│   1. read matches.pitch_cost_sar (NOT price_per_player × n)                 │
│   2. (koralink) credit exactly pitch_cost_sar + ledger REFUND               │
└──────────────────────────────────┬──────────────────────────────────────────┘
                                   │
                                   ▼
                          PostgreSQL (matches.pitch_cost_sar)
```

**Key principle:** the backend is the single source of truth for money. The frontend only *mirrors* the display formula and never transmits an authoritative cost.

---

## 2. Database Changes

### 2.1 `matches` — new column

```sql
ALTER TABLE matches
  ADD COLUMN pitch_cost_sar NUMERIC(10,2);
```

- Backfill: `pitch_cost_sar = (price_per_player::numeric − 5) * (max_players − 1)` for existing koralink rows; `NULL` for self-mode rows (no wallet flow).
- Drizzle: `pitch_cost_sar: numeric('pitch_cost_sar', { precision: 10, scale: 2 })`.

> No new table, no index required. Additive only.

---

## 3. Backend Changes

| File | Action |
|------|--------|
| `src/database/schema.ts` | Add `matches.pitch_cost_sar` column + relation no-op. |
| `src/modules/matches/matches.service.ts` | `createMatch`: fetch `hourly_rate`, derive `pitchCostSar`, persist `pitch_cost_sar`; `cancelMatch`: refund `pitch_cost_sar`. Add `has_voted` to `NearbyMatchRow`. |
| `src/modules/matches/dto/create-match.dto.ts` | Make `booking_mode` `@IsOptional()` (service defaults to `'self'`); mark `pitchCostSar` deprecated (server-derived). |
| `drizzle/` | Generated migration for the new column. |

**Pricing formulas (single source in `MatchesService`):**

```ts
const round2 = (n: number) => Math.ceil(n * 100) / 100;
const PLATFORM_MARGIN_SAR = 5;

pitchCostSar     = round2(hourlyRate * durationMins / 60);   // server-derived
pricePerPlayer   = round2(pitchCostSar / (maxPlayers - 1) + PLATFORM_MARGIN_SAR);
```

---

## 4. Frontend Changes

| File | Action |
|------|--------|
| `src/lib/api-adapter.ts` | Add `booking_mode`/`booking_slot_id` to `MatchDetailApi`; export `PLATFORM_MARGIN_SAR` + `round2` + `pricePerPlayer()` mirror helper; add `riyadhISO(date, time)`. |
| `src/hooks/useMatches.ts` | Enforce `hostMatchSchema.parse(data)` in `useCreateMatch`. |
| `src/components/host/HostMatchForm.tsx` | Derive `pitchCostSar` = `round2(rate × duration/60)`; `playerShare` = mirror formula; `scheduled_at` = `riyadhISO(date, time)`; title fallback uses `effectiveFormat`. |
| `src/components/host/SlotPicker.tsx` | "today" min = `todayInRiyadh()`. |
| `src/components/host/CostFooter.tsx` | No logic change (receives mirrored `playerShare`/`pitchCostSar`). |

---

## 5. Data Flow — Refund (corrected)

```
Host taps Cancel (koralink match)
  → POST /matches/:id/cancel
  → cancelMatch(): SELECT id, status, booking_mode, booking_slot_id, pitch_cost_sar
  → status → Cancelled
  → slot released (is_booked=false, booked_match_id=null)
  → host wallet += pitch_cost_sar      (exact amount debited at create)
  → ledger: CREDIT REFUND = pitch_cost_sar
  → return findOne(id)
```

---

## 6. Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| Legacy koralink rows have `pitch_cost_sar = NULL` after backfill | Backfill from `price_per_player`; treat NULL as "no refund" defensively. |
| FE/BE price formula drift again | Pin with a unit test asserting the FE mirror equals `calculatePricePerPlayer` for representative inputs. |
| Timezone change shifts existing matches | Only affects *new* matches created through the form; display stays `dateInRiyadh`. |
| Removing trust in `pitchCostSar` changes wallet amounts | Backward-compatible: existing rows already deducted; new rows use server-derived value going forward. |

---

## 7. Descoped (explicit)

- Payment collection on join (unchanged).
- Platform margin value change.
- `startMatch` Full-gate redesign.
- New non-60-min slot seed data.
