# Gate 0–3 (compact) — Club Calendar → Host Form Date Prefill

**Date:** 2026-08-16 · **Type:** UX fix cycle · **Baseline:** `cb42d17`

## Problem
On the club detail page, a user picks a date via "View Calendar", then taps "Host a Match Here" — the chosen date is dropped. The host form opens with an empty date and the user re-picks the same day.

## Fix (contract)
- Club CTA link gains `&date=YYYY-MM-DD` **only when a date is selected** (`dateStr` is already Riyadh-normalized via `dateInRiyadh`).
- `parseHostDateParam(raw, today)` (in `api-adapter.ts` next to `todayInRiyadh`) validates the param: `YYYY-MM-DD` format AND `>= todayInRiyadh()` (string compare = chronological for ISO dates). Returns the date or `null` — past/garbage params are ignored, never block the form.
- `HostMatchForm`:
  - `date` state initializes from the validated param.
  - `handleModeChange` + koralink pitch-change re-apply the query date (user intent "I want this day" is mode-independent) instead of clearing to `''`.
  - Koralink mode: `SlotPicker` receives `initialDate` so the slot grid opens on the chosen day.
- No i18n changes (the prefilled date renders through existing display formatting).

## Files
| File | Change |
|---|---|
| `src/lib/api-adapter.ts` | + `parseHostDateParam` |
| `src/app/[locale]/clubs/[id]/page.tsx` | CTA link carries `&date=` when selected |
| `src/components/host/HostMatchForm.tsx` | read/validate param; init + re-apply date; pass `initialDate` |
| `src/components/host/SlotPicker.tsx` | + `initialDate?: string` seeds internal `slotDate` |
| `test/lib/host-date-param.test.ts` | format/past/garbage/today-boundary cases |

## Verification
- build 2/2 + vitest 162/162 (4 new) ✅ 2026-08-16
