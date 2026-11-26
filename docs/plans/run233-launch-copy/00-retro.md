# Run #233 — Gate 0 Retrospective (launch-copy batch P2-404..407)

## Source of scope
Life-OS worker D-20261126-01 (recorded in kanban/DECISIONS.md 2026-11-26; worker request, not an
owner decision — reversible copy/docs only). Boarded this run as P2-404..P2-407, plus
P2-408..P2-410 (Reviewer B run-#233 admin findings, not built this run).

## Ledger check (DECISIONS.md read FIRST — standing rule)
- D-20261114-03: launch = beta with sandbox payments; real money later milestone. → P2-404 notice
  must say test-money, and must NOT imply real charges happen today.
- D-20261113-03: Moyasar live keys need company registration, not on path → real-money claims stay
  OFF. P2-404 wording respects this.
- D-20261106-01: hosting flips inside the Kingdom ONLY at cutover → all privacy copy edits preserve
  the "currently run outside the Kingdom / حالياً خارج المملكة" phrasing byte-for-byte (tripwire
  p218-legal-truth-pins.test.ts enforces).
- D-20261115-04 / D-20261113-10 (P2-398 truth): no-show fee = player share + karma, reversed in
  full on correction → P2-406 sheet copy mirrors termsConductBody5 exactly.

## Premise corrections (claims ≠ facts, run #233)
- Worker asked processors text to name "PostHog (EU host, not app.posthog.com,
  ObservabilityProvider.tsx:35,38)". Code read: `safePostHogHost()` falls back to
  app.posthog.com but the REAL configured host is `https://us.i.posthog.com` (US cloud,
  apps/player-pwa/.env.local). Sentry DSN ingest host = `*.ingest.de.sentry.io` (EU) — that half
  of the premise holds. P2-407 copy therefore names Sentry (EU) + PostHog (US cloud), not the
  requested-but-wrong EU/PostHog pairing.
- Worker cited No-show Policy sheet at en.json:1064-1067 — actual location is the matchRules
  namespace (matchRules.noShow.body); drift confirmed real, location corrected.
- Reviewer B flagged ":9450 DOWN" as CRITICAL — known owner-pending Tailscale funnel state
  (prestate + standing ops note), not a new defect; recorded as ops status, no board row.

## Review lane results this run (Phase 2)
- Reviewer A (code quality, API rotation): ZERO CRITICAL/IMPORTANT; 5 MINOR observations
  (future-refactor fragility notes; all pre-existing baseline; nothing actionable this run).
- Reviewer B (product gaps + design lens): i18n parity 1332=1332 (PWA) / 872=872 (admin);
  admin physical left-0 anchors correct both locales; pre-hydration rtl boot script present;
  no raw backend copy on either surface. 3 admin IMPORTANTs → P2-408/409/410.
- Hex lane: clean — all 10 metrics at baseline (41/355/27/35/68/1/1/0/0/0).
- P2-283 (PR #301 5e6ea9ce) claims VERIFIED LIVE this run: resolve/reopen guards return flat
  {message, code} (DISPUTE_ALREADY_DECIDED / DISPUTE_NOT_DECIDED both exercised with real
  staging rows); PATCH /email/me conflict returns 409 {"message":"EMAIL_TAKEN","code":"EMAIL_TAKEN"}.
  Probe rows restored to pre-probe state (verified by re-read).
- Sentry triage: standing classes only (Neon 1C quota 98/24h = owner-blocked prod issue; CORS
  evil.example probes = scanner noise; wallet-intent aging warnings = expected sweep behavior).
  journalctl: zero errors across all 3 services in 5h.

## Fix:feat ratio
Last 15 commits on staging: 1 fix-class (run #232's inert-arm), rest feat/docs — healthy.
No reactive-fix loop.

## Decision
Proceed to Gate 1-3 compact (01-program-design.md) → Gate 4 via zeroshot lane (Claude; owner
plan now max_5x — same first-party OAuth proven runs #217..#232). Parent reconciles the
uncommitted lane diff and runs the REAL gates.
