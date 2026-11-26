# Run #233 — Program Design (Gates 1-3 compact)

## Problem
Life-OS worker D-20261126-01 found 4 launch-copy truth gaps on the PWA legal/money/rules
surfaces (feeds the lawyer package + the F-lane launch checklist).

## User stories
- As a beta player topping up, I see that top-ups are sandbox/test money, so I never believe
  real money moved (P2-404).
- As a player marked no-show, the in-app rules sheet tells me the same fee truth as the Terms
  (player share + karma, reversed on correction) (P2-406).
- As a privacy-conscious user, the processors list names Sentry (EU) + PostHog (US cloud) and
  the cookies section mentions them (P2-407).
- As a user with a PDPL request, I reach hello@koralink.sa + rights steps from one Contact page
  linked from profile + privacy (P2-405).

## Scope
IN: en.json/ar.json edits (legal.termsPaymentsBody3, wallet.topup.subtitle,
matchRules.noShow.body, legal.privacySharingBody1, legal.privacyCookiesBody1), NEW contact ns
(EN+AR), NEW app/[locale]/contact/page.tsx (terms-page shell), profile menu link swap
(mailto → /contact), privacy page inline link. OUT: backend/DB/admin, real-money copy flips
(owner-gated), any legal-ns key removals.

## Contract (exact strings — parent-authored, lane implements)
1. termsPaymentsBody3 += " Top-ups and card payments in the current beta use the Moyasar
   sandbox — test money only, nothing real is charged until go-live." (AR mirror supplied in
   lane task.)
2. topup.subtitle += beta sandbox sentence (EN+AR as supplied).
3. matchRules.noShow.body REPLACED with the termsConductBody5 truth (EN+AR as supplied).
4. privacySharingBody1: phrase "our push notification service, email delivery, and
   hosting/storage providers" → "our push notification service, email delivery (Brevo),
   crash reporting (Sentry, EU region), and product analytics (PostHog, US cloud)"; hosting
   sentences byte-identical. privacyCookiesBody1 += trailing processor sentence (EN+AR).
5. contact ns: support / pdpl / response sections + contactLink label; same key set EN+AR.
6. Wiring: profile.contactSupport MenuItem href → `/${locale}/contact`; privacy page gains
   contactLink row.

## i18n contract
- Every new key exists in BOTH en.json and ar.json; leaf-key parity preserved (1332=1332 base).
- No whole-file JSON rewrites — targeted string edits only (i18n trap: surgical inserts).
- Truth-pin test p218-legal-truth-pins.test.ts must stay green (hosting/email/cookie phrasings
  preserved; no '(HttpOnly, Secure),' literal; no 'servers inside the Kingdom and').

## Verification (Gate 3 checklist)
- [x] All copy changes are i18n-namespace-local; no component reads raw backend error text.
- [x] Every new key added to en + ar atomically.
- [x] Truth pins enumerated and preserved.
- [x] Contact page: no MobileFrame/BottomNav import (standalone page outside (main) — terms/
      privacy pattern, MobileFrame allowed), back button uses common.back aria, min-h-hit target.
- [x] Zero backend/schema/adapter changes → no API contract surfaces touched.

## Gate 4 plan
Lane (zeroshot 01a217d9) implements in an isolated worktree with real npm ci; parent reviews
the diff hunk-by-hunk, re-applies gates (turbo --concurrency=1 sequential, vitest full, tsc),
commits on the lane branch, opens PR → bot checks → PR-Agent triage → squash-merge.
