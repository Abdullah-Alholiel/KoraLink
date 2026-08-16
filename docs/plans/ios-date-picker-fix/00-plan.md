# Gate 0–3 (compact) — iOS Date Picker Fix

**Date:** 2026-08-16 · **Type:** bug fix cycle · **Baseline:** `ce4638b`

## Problem
On iPhone (Safari browser + installed PWA), tapping the date fields does nothing in:
1. Host form, self mode — Date & Time (`MatchDetailsForm.tsx`)
2. Host form, koralink mode — slot date (`SlotPicker.tsx`)
3. Venue "pick date to see available slots" — same `SlotPicker` (reached via club → Host here)

## Root cause
- `HTMLInputElement.showPicker()` is **not supported on iOS WebKit** for date/time inputs (Chromium-only behavior; that's why Android/desktop Chrome work).
- The input is `sr-only` **inside a `<button>`** — invalid HTML nesting; the button consumes the tap, so the input can never be focused directly either.
- Result: both activation paths are dead on iOS.

## Fix (Gate 2/3 — contract)
Replace button+`showPicker()` with the **invisible input overlay** pattern:

```tsx
<label className="relative flex-1 bg-gray-50 rounded-xl border border-gray-100 p-3.5 text-start cursor-pointer">
  {/* styled display content */}
  <input type="date" value={date} min={today} onChange={...} aria-label={...}
    className="absolute inset-0 h-full w-full opacity-0 cursor-pointer" />
</label>
```

- The native input IS the tap target (topmost, full-size, invisible) → tap = focus → iOS native wheel picker opens. Works identically on Android/desktop.
- No JS activation code; valid HTML (input inside label); RTL-safe (symmetric overlay); accessible (real input + aria-label).
- Removes `showPicker()` + `sr-only` + unused refs from both files.
- Adds `min={todayInRiyadh()}` to the host form date input (matches SlotPicker; prevents creating invisible past matches).

## Files
| File | Change |
|---|---|
| `src/components/host/MatchDetailsForm.tsx` | date + time inputs → overlay pattern; remove refs/showPicker |
| `src/components/host/SlotPicker.tsx` | slot date input → overlay pattern; remove ref/showPicker |
| `test/components/MatchDetailsForm.test.tsx` | NEW — input present, real hit-target, min attr, onChange→display wiring |

## Verification plan
- `npm run build` zero errors; `npx vitest run` all green.
- Headless browser: host page renders, input hit-test via `elementFromPoint` returns the input, value change updates display.
