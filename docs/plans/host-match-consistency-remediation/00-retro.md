# Gate 0 — Retrospective: Host Match Consistency Remediation

**Date:** 2026-08-16
**Baseline:** `76ab9cd` (main HEAD)
**Scope:** Host match flow — create (dual-mode), pricing, cancel/refund, slot booking, host management actions.

---

## 1. What was reviewed

Full-stack trace of the host match chain:

```
schema.ts (matches/pitch_slots/venues columns)
  → matches.service.ts (createMatch, cancelMatch, findNearby, calculatePricePerPlayer)
  → create-match.dto.ts / get-matches.dto.ts / matches.controller.ts
  → useMatches.ts (hostMatchSchema, useCreateMatch) / usePitchSlots.ts
  → api-adapter.ts (adaptNearbyMatch, adaptMatchDetail, NearbyMatchApi, MatchDetailApi)
  → types/index.ts (Match)
  → HostMatchForm.tsx + ModeToggle / MatchDetailsForm / SlotPicker / CostFooter / PublishWarningSheet / VisibilityToggle
  → CostFooter UI
```

Build + tests re-run for baseline (see §4).

---

## 2. Findings

### 🔴 CRITICAL (3)

| # | Issue | Location | Impact | Fix |
|---|-------|----------|--------|-----|
| C1 | **Cancel-refund overpays the host by the platform margin.** Refund = `price_per_player × (max_players − 1)`, but `price_per_player` already embeds `+5 SAR` margin per player, so the host is credited `5 × (max_players−1)` more than they were debited at creation. | `matches.service.ts` `cancelMatch()` ~L998: `parseFloat(match.price_per_player) * (match.max_players - 1)` | Money leak: a 14-player match (13 non-host) refunds +65 SAR over what the host paid. Ledger records an inflated `REFUND` amount. | Persist the host's actual paid cost (`pitch_cost_sar`) on `matches` at create; refund exactly that value. |
| C2 | **Pitch cost never scales with duration.** `pitchCostSar = pitchRate` (hourly rate only), ignoring `duration`. Self mode offers 30/45/90/120 min but always prices 1 hour. Koralink mode is currently 60-min slots (latent) but `computeSlotDuration()` supports other lengths. | `HostMatchForm.tsx` L96–97 | Host underpays wallet / players undercharged for non-60-min bookings. | Derive cost server-side: `pitchCostSar = round2(hourly_rate × duration_mins / 60)`. |
| C3 | **CostFooter "player share" ≠ actual `price_per_player`.** FE shows `ceil(pitchCost/(maxPlayers−1))` (integer, no margin); BE charges `round2(pitchCost/(players−1) + 5)`. Displayed price understates the real charge and drops the platform margin + 2dp. | `HostMatchForm.tsx` L103 + `CostFooter.tsx` L37 | Hosts see a lower per-player price than players will actually be charged. | Mirror `calculatePricePerPlayer` exactly in FE; pin with a unit test. |

> **Root cause note:** pricing logic is duplicated across FE/BE and neither trusts a single source of truth. Fixing C1–C3 together means the backend **derives** `pitchCostSar` from the pitch's `hourly_rate × duration` (server-authoritative, closes the "host sends arbitrary pitchCostSar" trust hole) and the FE mirrors only the *display* formula.

### 🟡 IMPORTANT (5)

| # | Issue | Location | Impact | Fix |
|---|-------|----------|--------|-----|
| I1 | **`scheduled_at` built from device-local time, not Asia/Riyadh.** `new Date(\`${date}T${time}:00\`).toISOString()` parses in the device timezone, but the whole app's canonical timezone is Asia/Riyadh (adapter `dateInRiyadh`, API `AT TIME ZONE 'Asia/Riyadh'`). | `HostMatchForm.tsx` L125 | A host outside Riyadh TZ creates a match whose kick-off is shifted. | Build `scheduled_at` explicitly in Asia/Riyadh (add a `riyadhISO(date, time)` helper) and reuse it. |
| I2 | **`booking_mode` DTO required, but service has dead `?? 'self'` default; Swagger claims a default that doesn't exist.** | `create-match.dto.ts` L57–58 vs `matches.service.ts` L633 | `@IsEnum` (no `@IsOptional`) → omitting `booking_mode` yields 400, contradicting the "default self" contract. | Align: make `booking_mode` `@IsOptional()` (default enforced in service) OR keep required and delete the dead default + doc. |
| I3 | **`hostMatchSchema` (Zod) exported but never used to validate** `useCreateMatch`. | `useMatches.ts` L30–42, `useCreateMatch` L173–194 | Contract artifact is dead code; invalid payloads reach the API and rely on DTO validation only. | Validate with `hostMatchSchema.parse(data)` in `mutationFn`, or remove the schema. |
| I4 | **Backend `NearbyMatchRow` omits `has_voted`, though `findNearby` SELECT returns it.** | `matches.service.ts` L24–49 vs L222 | Type/docs drift; field flows at runtime but a future refactor could drop it silently. | Add `has_voted: boolean` to `NearbyMatchRow`. |
| I5 | **`MatchDetailApi` omits `booking_mode` / `booking_slot_id`, so the PWA can't render "booked via KoraLink" or refund-aware cancel messaging.** | `api-adapter.ts` L46–66 | Host detail/cancel UI can't reflect booking mode. | Add optional `booking_mode`/`booking_slot_id` to `MatchDetailApi` (and `Match` if consumed). |

### 🟢 MINOR (2)

| # | Issue | Location | Impact | Fix |
|---|-------|----------|--------|-----|
| M1 | `SlotPicker` "today" min uses UTC date (`new Date().toISOString().split('T')[0]`) instead of Riyadh. | `SlotPicker.tsx` L26 | Off-by-one day near midnight Riyadh. | Use `todayInRiyadh()` (already exported from `api-adapter.ts`). |
| M2 | Title fallback uses `format` **state** (potentially stale) while `maxPlayers` uses `effectiveFormat` (derived). | `HostMatchForm.tsx` L129 vs L101–102 | Fallback title could name the wrong format for a beat after pitch selection. | Use `effectiveFormat` for the fallback. |

---

## 3. Connectivity audit (clean checks)

Verified clean — these did **not** need fixes:

- ✅ All 6 mutations return `this.findOne(id)` outside the transaction.
- ✅ `spots_filled` counts the host (`COUNT(mp.id)` no filter) in feed + `filledSpots: players.length` in detail.
- ✅ `format` mapped from `pitch.size` (not `match_type`); `max_players` = `parseInt(format.split('v')[0]) * 2`.
- ✅ No `::uuid` casts in raw SQL (all `::text`).
- ✅ `pitch_slots` table + `booking_mode`/`booking_slot_id` columns present; `is_koralink_partner` on venues; `visibility` on matches.
- ✅ `visibility` flow: DTO → service (`?? 'public'`) → schema → `findNearby` private-filter → `adaptNearbyMatch.isPrivate`.
- ✅ `GET /pitches/:id/slots` route exists (`pitches.controller.ts` L31) → `matches.service.getPitchSlots`.
- ✅ Host actions wired on match detail page (`useStartMatch`/`useCompleteMatch`/`useCancelMatch`, `CancelMatchSheet`/`EmergencyCancelSheet`).
- ✅ `createMatch` fans out only for public matches (US3).
- ✅ Format is pitch-locked in the form (`lockedFormat`); koralink date/time/duration are slot-locked.

---

## 4. Baseline verification (this cycle)

| Check | Result |
|-------|--------|
| `gh auth status` | ✅ Abdullah-Alholiel |
| `git status` | ✅ clean (only untracked `docs/plans/pwa-hardening-performance/` — another agent, left alone) |
| `node` / `npm` | ✅ v22.22.3 / 10.9.8 |
| `npm run build` | ✅ 2/2 tasks successful, 1m25s (player-pwa + api) |
| `npx vitest run` | ✅ 15 files, 126/126 passed (15.15s) |

---

## 5. Recommendation

**Proceed to Gate 1** with a focused pricing/contract remediation. The three CRITICAL findings are a single coherent pricing-model fix (server-authoritative cost + single price formula + correct refund). IMPORTANT/MINOR items are contract-drift and timezone hygiene that round out the "up to standard" ask.
