# Run #166 — P1-69 Vertical: Player Dispute Origination (PWA)

## Problem
Players cannot file a dispute in the 4 non-appeal categories. The API accepts them
(matches.service.ts:4145 — only `no_show` is gated on an actual no-show mark); nothing in
the PWA offers the choice. Story: **As a player whose pitch was double-booked, I want to
report the problem from the match page and track its status, so my issue reaches the admin
console without leaving the app.**

## Scope
IN: ReportDisputeSheet (category grid + reason) on match-detail; wired for joined users;
localized success/error/under-review copy; a11y (role=status, hit targets); PostHog
`dispute_opened` event; category labels ×2 locales; status display for non-appeal types on
the existing banner path.
OUT (per 01-default-proposal.md): admin console changes; money side-effects (P1-29);
partner surface; new endpoints/migrations; my-disputes list page (uses existing
my-dispute read on match-detail; a cross-match list = separate row).

## Contract (exact shapes)
- Endpoint: `POST /matches/:id/dispute` (EXISTS) — body `{ type: 'no_show' |
  'double_booking' | 'pitch_condition' | 'unrecognized_charge' | 'other',
  reason?: string(≤1000) }`; 400 when type=no_show && !no_show-marked; 403 non-roster.
  Response: `{ id, type, status, decision, has_appealed, created_at, updated_at }`.
- Read: `GET /matches/:id/my-dispute` (EXISTS) → same shape or null. Note: returns the
  LATEST dispute by created_at regardless of status — the sheet shows it; resolved/rejected
  rows allow re-filing (createDispute dedupes only on open/under_review — consistent).
- Hook: extend useDisputes.ts with `useOpenDispute(matchId)` — `useMutation<MyDispute,
  FetchError, { type: DisputeType; reason?: string }>` posting the body verbatim; on
  success invalidate `['dispute', matchId]` + `trackEvent('dispute_opened',
  { match_id, dispute_type })`. `useAppeal` stays untouched (callers unchanged).
- UI: new `ReportDisputeSheet.tsx` mirroring AppealSheet's structure (BottomSheet,
  drag handle, X-close w/ aria, category grid = 5 buttons with icon + localized label +
  selected state, reason textarea ≤1000 + counter, error box via localized classify, submit
  disabled while pending). Trigger: match-detail joined-view "Dispute a problem" link next
  to the existing "Report match" link (both :456 area and :864 area), only when not host.
- i18n ns `dispute` (NEW): title, subtitle, catNoShow, catDoubleBooking, catPitchCondition,
  catUnrecognizedCharge, catOther, catNoShowHint, reasonLabel, reasonPlaceholder, submit,
  successToast, statusOpened, statusUnderReview, statusResolved, statusRejected + error
  buckets in errors ns (disputeFailed*). EN + AR parity, Arabic-Indic numerals via ICU where
  numbers appear (none in this sheet).
- Observability: captureError on failure (scope 'dispute'), trackEvent on success —
  per AGENTS.md §4 via existing ObservabilityProvider.

## Files changed
1. apps/player-pwa/src/hooks/useDisputes.ts — add DisputeType + useOpenDispute.
2. apps/player-pwa/src/components/matches/ReportDisputeSheet.tsx — NEW.
3. apps/player-pwa/src/components/matches/ReportDisputeSheet.test.tsx — NEW (render +
   category select + submit + error + disabled states).
4. apps/player-pwa/src/app/[locale]/match/[id]/page.tsx — import + state + trigger links
   (2 sites) + sheet mount + under-review display extension.
5. apps/player-pwa/src/messages/en.json + ar.json — dispute ns + errors keys.
6. docs/plans/run166-p1-69-dispute-origination/* — gates.

## Risks
- Sheet is display-only for money categories — P1-29 money side-effect stays out (copied).
- no_show category inside the general sheet: server 400s if not marked → localize the 400
  message path (classifyError bucket) + hint under the category.
- i18n AR gender/parity: PR-Agent rule — labels checked against AR grammar (masc/fem of
  مشكلة/تسوية pairs).

## Success criteria
- Player files from match-detail in any category; success toast + banner shows state.
- Admin console lists it immediately (no migration; same table).
- vitest green (new suite + 1049 existing), tsc 0, sequential turbo build 3/3, live probe.
