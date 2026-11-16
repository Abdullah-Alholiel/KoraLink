# Run #140 — Program Design (Gates 1–3 compact)

## Problem
Partner-initiated payout requests (P2-3, PR #142) and the admin settlement generator
(P2-4 era) draw from the same money source (Completed koralink bookings) but disagree
on the window: requestPayout hardcoded 365 days for BOTH the revenue lookback and the
NOT-EXISTS dedupe guard; generatePending keys both to the rolling
`payout_cadence_days` PlatformSetting (default 7, admin settings.service.ts:27
min 1 max 90). Consequence: one settlement (partner-requested OR admin-generated)
blocks that venue's payout REQUESTS for up to 365 days — the partner sees only the
generic 400 "nothing unsettled". Boarded as P2-211 (run #139 Reviewer-B caveat).

## User story
As a venue partner, after any settlement cycle I can immediately request a payout for
NEWLY unsettled revenue — the same window the admin generator uses, so the two tools
never disagree about what is unsettled.

## Scope
IN: requestPayout window + guard derive from `payout_cadence_days`; spec pins the
contract; PR #142 branch carries the fix (requestPayout exists only there until merge).
OUT: the generator itself (already correct); PSP/money movement (P0-2 owner-only);
admin UI (no change).

## Architecture delta
- `PartnerService` ctor gains `private readonly settings?: PlatformSettingsService`
  (optional, mirroring the existing `audit?` pattern so legacy spec constructions
  compile; SettingsModule is @Global — zero module wiring; real DI always provides it).
- requestPayout: `cadenceDays = settings ? settings.getNumber('payout_cadence_days', 7) : 7`;
  `windowStartIso = new Date(Date.now() - cadenceDays*86400000).toISOString()` —
  the generator's EXACT idiom (settlements.service.ts:131-133). Both SQL sites
  (`m.scheduled_at >= ${windowStartIso}` and `s.period_start >= ${windowStartIso}::date`)
  share ONE instant, matching the generator's param binding shape.

## Contracts (Gate 3)
- POST /partner/payout-requests response shape UNCHANGED (201 {requested, totalAmount,
  settlements[]}; 400 nothing-unsettled; Admin 403). No DTO changes. No migration.
- getNumber contract (platform-settings.service.ts:25-30): null/undefined/non-finite →
  fallback. Key absent in DB today → default 7 — same as generator.
- Spec additions (partner.payout-request.spec.ts): (1) no '365 days' in SQL + exactly two
  ISO stamps, equal; (2) fallback ≈ now-7d ±10min, override cadence=14 ≈ now-14d,
  override strictly older than fallback by >5d.

## Verification checklist
- [x] No endpoint shape change — spec contract assertions untouched and passing
- [x] Both window sites + guard read the same setting with the same default
- [x] Legacy constructions (no settings) fall back to 7 — spec-pinned
- [x] No i18n keys touched (API-only)
- [x] Money values still quantized numeric-text strings (quantizeMoney2dpString path untouched)
