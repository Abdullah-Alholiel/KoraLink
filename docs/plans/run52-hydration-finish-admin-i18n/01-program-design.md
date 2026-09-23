# Run #52 — Cycle Docs (PWA hydration/locale finish + admin i18n/a11y batch)

Autonomous mode (factory cron). Layer rotation: run 52 % 4 = 0 → PWA screens focus,
design lens mandatory. Compact 4-gate docs per `koralink-software-factory`.

## Gate 0 — Retrospective (`00-retro.md` summary)

- **Baseline:** 87b5268 (run #51 report commit). fix:feat ratio healthy — runs #50–#51
  shipped 7 fix/feat commits + 2 docs, all review-driven.
- **Service health:** api/pwa/admin active; API /health 200; 0 journal errors (all three
  services, 5h window).
- **Sentry triage:** staging API = ZERO new issues in 24h (newest 2026-09-11). Prod web:
  KORALINK-WEB-D "Hydration Error" (2 evts, firstSeen 2026-09-13T20:32Z) investigated —
  `type: generic`, no exception entries, URL `:10000/en/play` (funnel port CLOSED in the
  2026-09-13 cleanup; nothing listens), release tag `6bb22d3c…` = PR #25 merge (prod cutover
  day — Abdullah testing on prod). Verdict: **stale-tab capture from the cutover window,
  not a PWA regression.** Watch rule: only re-open if it recurs from `:9450` URLs after
  4726498 promotes.
- **Admin state check (pre-P2-61):** `git status` clean on apps/admin + partner/admin API
  modules; service active; dashboard routes verified live (audit…venues, 14 entries).
  NO ADMIN HOLD — batch green-lit.
- **Reviewers (glm-5.3-flash, zai, 165s/180s — zai delegation path CLEAN this run,
  breaks the runs #45/#24-30/#32 401 streak):** A: 1 CRITICAL (DiscussionCard render-path
  `new Date()` — P2-59 survivor, messages feed) + 1 IMPORTANT (en-US hardcode, AR parity).
  B: 4/4 verification claims CONFIRMED + 1 new P2 (MatchDetailsForm bare `ar-SA` — Hijri
  drift class lib/format.ts exists to prevent) + ChatSheet-offline-send note (folded onto
  P2-7).

## Gate 1 — Product spec

- **P2-59 (extended):** the messages feed must not hydration-mismatch and must show AR
  users Arabic weekday/month names. Success: no render-path `new Date()` in
  DiscussionCard; relative buckets use the shared `useNow()` clock; localized weekday.
- **P2-64 (new):** Arabic hosts must never see Hijri dates in the host form summary.
  Success: all 4 `toLocale*('ar-SA')` sites route through a Gregorian-pinned resolver.
- **P2-61 (re-scoped):** venues/[id] is FULLY hardcoded English (~19 literals — not just
  the boarded Approve/Reject pair). Scope: localize the whole page + label the select +
  shared EmptyState on the 5 ad-hoc sites. Success: zero raw English literals on the
  venue-approval surface in AR locale.

## Gate 2 — Architecture

- `DiscussionCard.tsx`: move the now-clock to `useNow()` (null pre-mount → "justNow"
  optimistic bucket); `formatTime(dateStr, locale, now)` with an `Intl.DateTimeFormat`
  fallback instead of `'en-US'`.
- `lib/format.ts`: add `resolveDateLocale(locale)` exporting the existing `dateLocale`
  logic; add `formatShortDate(date, locale)` / `formatShortTime(date, locale)` helpers
  (Asia/Riyadh-anchored, Gregorian-pinned, 12h clock) reused by MatchDetailsForm ×4.
- `venues/[id]/page.tsx`: `useTranslations(['common','hq'])` (next-intl 3.x prefix-array
  pattern already used in the codebase); new `adminPitches.venueDetail.*` keys EN+AR.
- 5 empty-state sites → `EmptyState` (shared component, run #42) — markup-only swap,
  copy keys unchanged.

## Gate 3 — Program design (contract)

- No API surface changes; no schema changes; no new endpoints. All four contract
  checklist items trivially satisfied (component-local changes; i18n keys added to BOTH
  en.json and ar.json with identical leaf sets; existing types reused; adapters
  untouched).
- New i18n keys (admin): `adminPitches.venueDetail` = backToVenues, venue, loading,
  pitches, noPitches, verification, noVerification, legalEntity, commercialReg, taxId,
  iban, manager, owner, rating, partner, yes, no, approved, decision, approve, reject,
  decided (22 keys ×2 locales, parity asserted).
- PWA: zero new keys (messages.justNow/minutesAgo/hoursAgo/yesterday already exist —
  verified 947/947 parity holds after edit).

## Gate 4 — Vertical slices (each: gates + separate commit)

1. **Slice 1:** DiscussionCard hydration+locale fix + `discussion-card.test.tsx` (spec
   DISC-1..4: pre-mount null posture, localized fallback weekday, badge/status render).
2. **Slice 2:** format.ts resolvers + MatchDetailsForm swap + format.test.ts additions.
3. **Slice 3:** admin venues/[id] localization + select aria-label + 5× EmptyState +
   en/ar parity check.
