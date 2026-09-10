# 05 — No-Domain Email Unblock (Brevo sender, 2026-09-10)

## Problem
Prod (Render) OTP/email could only reach **albertcatsby** (the Resend account
owner's address). Resend's `onboarding@resend.dev` sender is hard-locked to the
account owner until a sending domain is verified (live-probed: account had 0
domains; any other recipient is rejected). Render itself needed **no** fix —
deploy was live/CORS-correct; only the email *sender* was blocked.

## Proven before any change (staging, log-mode E2E — run 2026-09-10)
- `POST /auth/email/send-otp` (any address) → 202 non-committal ✓
- verify → 200, user row created email-only (`phone NULL`,
  `email_verified_at` set), 60s cooldown → 429 ✓; probe row cleaned up.
- Route: `/auth/email/*` (`email-auth.controller.ts`); code rides the API
  **user** journal when no key is set (`journalctl --user -u koralink-api`).

## Decision (Abdullah, 2026-09-10)
Option A: **Brevo verified sender now ($0, no domain)**; Resend+domain stays
the production path. Per analyst-before-architect: Resend provably cannot
deliver to a non-owner without a domain; a single-sender provider can.

## Implementation (commit `b194397` on staging)
- `email-sender.port.ts` — `EMAIL_SENDER` symbol + `EmailSender` interface.
- `brevo.service.ts` — BrevoService (mirrors ResendService: fetch-only,
  log-only dev mode with debugCode, 503 on rejection; `BREVO_FROM` REQUIRED
  when key set — Brevo has no shared fallback sender). `parseFromAddress`
  parses `Name <addr>`.
- `email-sender.provider.ts` — `EMAIL_SENDER_PROVIDER` factory:
  `EMAIL_PROVIDER=brevo` → BrevoService; **default/resend → ResendService**
  (domain path later = env-only flip, zero code).
- `email-otp.service.ts` — injects the port. `auth.module.ts` — provides both
  adapters + factory; exports the PORT (future email-change flow consumes it).
- Tests: 23/23 auth suite green (BrevoService, parseFromAddress, factory
  selection, existing OTP matrix). `turbo run build --filter=api` GREEN.

### Pre-existing matches test failures (NOT ours — A/B proven ×3)
The shared worktree carries a sibling agent's uncommitted
`matches.service.ts` WIP (+448 lines); with-tree runs fail 6 tests in
`matches.access-control` (mock lacks `players` rows for new code path),
identically with and without this cycle's changes; clean-tree passes.
Owner: the agent doing the matches cycle. Do not blame the email port.

## Ops ledger
```
2026-09-10 | T1 | staging commit b194397 (auth email port + Brevo) | tests 23/23 + build green + push | revert: git revert b194397
2026-09-10 | T1 | deploy preflight collided once with ACTIVE factory lock; retried clean after lock release (no tree interference) | n/a | n/a
2026-09-10 | T1 | staging deploy on b194397 (build 3/3, migrations current, API→PWA→Admin restarted) | health H1–H6 ALL GREEN | rollback: checkout prev staging SHA + rebuild + restart
2026-09-10 | T0 | A/B ×3: matches.access-control 6F/5P identical with/without this cycle | pre-existing (sibling matches WIP in shared tree) | n/a
```

## Brevo handoff (Abdullah — console only, ~5 min)
1. brevo.com → Sign up (free 300/day; can use a NON-albertcatsby email —
   recommend the address you want OTP tests to reach FIRST, e.g. your real
   Gmail) → account validated.
2. Senders, Devs & API → **Senders** → Add sender: e.g.
   `no-reply@koralink.sa` (any address you can receive at for the one-time
   verification click) → click the verification email.
3. SMTP & API → API keys → Generate v3 key → add to
   `/home/ubuntu/.hermes/profiles/koralink/.deploy-tokens` as `BREVO_API_KEY`.
4. Tell me the sender address + which inbox you use for tests. I then set
   staging (`EMAIL_PROVIDER=brevo`, `BREVO_FROM="KoraLink <that sender>"`, key
   from tokens) → real-inbox OTP test → then the SAME env on Render (T2 diff
   shown) → real-inbox OTP test on prod.

## Verification matrix for the Brevo cutover (each step BEFORE next)
- [ ] staging: send-otp → journal shows NO `BREVO_API_KEY empty` line, NO error
- [ ] real inbox: OTP email received (check spam; mark not-spam to train)
- [ ] verify-otp 200 → PWA session works
- [ ] Render: same env trio → non-owner real inbox receives OTP on prod
- [ ] cooldown 429 + wrong-code 401 still enforced (spot check)

## Rollback (armed before cutover)
Staging: `EMAIL_PROVIDER` unset (→ Resend/log-mode) + restart. Prod: Render
env-vars revert to prior values in the ops log row + redeploy (≤60s undo).

## Deferred (documented, owner: Abdullah)
- Domain purchase + Cloudflare zone → Resend verified domain → set
  `RESEND_FROM` (+ `EMAIL_PROVIDER=resend`) → production-grade sender
  (SPF/DKIM/DMARC aligned, branded). Brevo stays as documented fallback.
- Render `DEV_LOGIN_ENABLED=false` flip remains gated on Phase-1 checklist.
