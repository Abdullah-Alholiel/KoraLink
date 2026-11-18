# Run #213 — API modules lane (213 % 4 = 1)

## Gate 0 Retro (compact, autonomous mode)

Baseline: dc5a259 (post-F1). Since run #212: only the run report landed. Fix:feat ratio healthy
(last 6 code commits = 3 feat / 3 fix, all PR-reviewed). DECISIONS.md read FIRST per doctrine —
two fresh Life-OS WORKER rows queued for the factory (D-20261117-03 A2 env checklist docs,
D-20261117-04 Turnstile hardening) — both reversible, both in this run's lane.

Service snapshot: all 3 services active; API errors 5h = ZERO (journalctl); Sentry 24h triaged:
- 131× `CORS origin not allowed: https://evil.example` — guard working as designed, probe noise.
- 186× `wallet top-up intent aged out` warnings + 1 expired — P2-369b telemetry, expected.
- 70× Neon quota + 13× push_subscriptions delete — stack params date to the Aug/Render quota era,
  stale unresolved issues, no new occurrences (noted, not boarded).
- Sentry issue KORALINK-API-1T (SMS_UNAVAILABLE) = fail-closed guard from PR #268 doing its job.

Strix monthly pass: NOT DUE (UTC day 17; last scan 2026-11-03; due days 1-3).
Security audit lane: FIX-before-HUNT clear (run-5 findings.json: 0 confirmed un-fixed);
HUNT skipped — 5h bucket already 40% from siblings + 3-item budget.

## Gates 1-3 (compact — program design for all 3 items)

### Item 1 — D-20261117-04 Turnstile hardening (zeroshot lane)
Problem: prod armed with the public always-pass dummy secret would pass EVERY token (silent
captcha bypass); getStatus() bypasses ConfigService; dummy short-circuit mixes set-membership
with a redundant prefix check.
Contract: boot throws (Error, message names TURNSTILE_SECRET_KEY) iff NODE_ENV=production &&
secret ∈ DUMMY_ALWAYS_PASS; non-prod behavior byte-identical (staging keeps dummy keys);
2x/3x dummies still take full siteverify; getStatus reads config only; .env.example gains 3
TURNSTILE_* names (no values).
Gates: turnstile.spec 18/18 (incl. prod+dummy throw, non-prod no-throw, real-shaped no-throw,
2x full-path pin), api tsc 0, PR bots.

### Item 2 — D-20261117-03 A2 env checklist (docs-only, direct commit)
docs/plans/prod-on-vps.md A2 row gains the env-name checklist: TRUST_PROXY=1, TURNSTILE_* trio,
DEV_LOGIN_ENABLED=false, COOKIE_SECURE=true, EMAIL_PROVIDER=brevo + BREVO_*, VAPID trio +
NEXT_PUBLIC_VAPID_PUBLIC_KEY, NEXT_PUBLIC_POSTHOG_KEY empty, retarget db-backup-prod.sh on DB-move
day. Names only, no values, no secrets.

### Item 3 — P2-374 reconcile creditedIds observability (parent-built worktree)
wallet.reconcile.service.ts:282-286: bare `.catch(() => [])` → logger.warn +
Sentry.captureException (mirrors sibling expiry catch) then degrade to empty (money-safety
unchanged: expiry UPDATE's status='pending' predicate still protects credited rows).
Gates: wallet jest 7 suites/115 tests, api tsc 0, PR bots.

## Contract verification checklist (Gate 3)
- [x] No API response shapes changed (all 3 items are guard/docs/observability — zero DTO/endpoint delta)
- [x] No schema/migration changes (drizzle journal untouched)
- [x] i18n: no user-facing strings added (none needed)
- [x] Prod-detection predicate reuses assertEnvFlags' NODE_ENV=production check (no new convention)
- [x] Staging dummy-key behavior preserved (health contract + staging probes unchanged)

## Reviewer findings (Phase 2, both <6k chars, 75s/100s)
- Reviewer A: 0 CRITICAL / 0 IMPORTANT; hex clean (all 11 metrics at baseline on post-lane tree).
  2 MINORs on turnstile.service.ts — BOTH FIXED by item 1 (process.env→ConfigService; redundant
  startsWith('1x') → DUMMY_ALWAYS_PASS-only set).
- Reviewer B: run-#212 claims 4/4 verified live, WITH CORRECTION — flag-OFF send-otp is fully
  INERT (proceeds to SMS_UNAVAILABLE, NOT CAPTCHA_REQUIRED; run #212's CAPTCHA_REQUIRED probe
  was flag-ON dummy-key behavior). Claim ledger updated in RUNS report.
- Reviewer B product gaps → board: P1 verify-page UX states, P1 wallet-callback states,
  P2 SMS dead-end (no email-OTP handoff), P2 host dashboard state matrix, P2 email/phone
  controller gate drift.
