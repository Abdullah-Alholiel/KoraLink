# Run #208 — UI Defects Part 1 (owner-reported D-20261113-32) — Gate 0 Retrospective

**Date:** 2026-11-15 · **Branch:** staging @ `dfa969a` · **Lane rotation:** 208%4=0 → PWA screens + DESIGN LENS

## Preflight
- GLM probe 200 → reviewer `glm-5.3-flash` via zai (prestate: weekly 8%, 5h 36% — healthy). Delegation set + verified.
- gh auth OK (Abdullah-Alholiel). Tree clean except foreign `scripts/artifacts/` (untouched, never staged).
- staging synced 0/0 vs origin. Services: api/pwa/admin all active; /health 200; zero journal errors last 5h.
- Strix: not due (15th; window is 1st–3rd).
- PR #255 (topup-intent-expiry, owner's t_b8468d98 task) had 8/8 green checks → triaged PR-Agent's single
  IMPORTANT ("paid payment stranded by expiry"): requires >100 top-up payments in the discovery window AND
  >24h age — unreachable at sandbox volume; structurally eliminated by the F2 webhook (hard gate on the
  P0-2 real-money go-live). **Merged** → squash `dfa969a` (local staging = origin/staging).
- **Promote health: 456 commits ahead of main · last promote 2026-09-25 · pending migrations on prod: 0059, 0060 ·
  P2-51: promote flow now D-20261113-28 (owner go → AI executes migrate + merge); owner go NOT yet given.**

## Prior-run verification (claims ≠ facts) — ALL VERIFIED
1. PR #258 mailer port (274ddb3): EMAIL_SENDER injected in mailer.service.ts, port.isConfigured() present,
   MailerModule registers the provider, zero AuthModule imports under src/mailer — claim holds (Reviewer B).
2. Hex baseline 346/27: audit re-run this run — all 10 metrics ok, "HEX LANE: clean" (this run + Reviewer B agree).
3. EN/AR parity 1308=1308 flat leaf keys, zero unique-to-one-file keys (Reviewer B programmatic check).

## Review round (2 scoped reviewers, parallel, 102s each, zero timeouts)
**Reviewer A (code quality):** 3 IMPORTANT — (1) `common.messages` missing both locales (owner defect #1
confirmed); (2) PaymentSheet imports `fetcher` directly — **REFUTED by hex audit: pwa_adapter_in_components=0,
`@/lib/fetcher` IS the canonical PWA client per koralink-frontend-patterns (claims≠facts applied to reviewer)**;
(3) both match-page action rows lack flex-wrap (owner defect #3 confirmed). MINORs: totals-ambiguity (owner
defect #2), consent-below-fold (defect #2), `Math.max(0,·)` expiry clamp allows 0h in PR #255 (noted as
follow-up — unreachable without an explicit env override; the intent author guarded with 24h default),
expiredNotifyGuard unbounded growth (harmless at scale), creditedIds redundant probe (dead guard, 1 query/sweep).
**Reviewer B (product gaps + design lens):** systemic tap-target deficit — sheet close buttons `w-9`/`w-8`
(36/32px) across ~10 sheets vs the project's own 44px standard (tailwind.config.ts:28 min-h-hit); consent+
CTA below fold pattern shared with TopupSheet; RTL nowrap overflow risks in MatchChat :269/:382, clubs :262/:288,
FilterBar :76; EmailSection.tsx:67 renders raw `err.message` (last non-localized error surface); numerals/money
formatting verified CLEAN (no gap — run-#193/#202/#203 sweeps held).

## Sentry triage (24h)
- API-1N "topup intent aged out of rescuable window" ×165 (staging warning) → **resolved by PR #255 merge**
  (abandoned intents now expire to failed; banner clears).
- API-1Q/1R/1P failed-query ×1 each (new, single-shot) → noted, no action at count 1.
- API-1C Neon quota ×70 = the closed historical storm (last bucket 10-31) → noise.
- WEB-G/F/E Moyasar form errors ×1 each = the owner's 11-13 sandbox session (fixed same day, run #201-era).
- WEB-6 viewport-diagnostic ×56 = the diagnostics beacon itself, MINOR noise.

## Gate 0 verdict
Proceed to build **UI Defects Part 1** (owner chat directive: right after the top-up fix — which landed this run
as PR #255 — before cosmetic rows). No DECISIONS.md conflicts: every fix below re-uses owner-set standards
(error-message standard, 44px hit targets, EN+AR parity). Admin state check: n/a — no admin files in scope.
