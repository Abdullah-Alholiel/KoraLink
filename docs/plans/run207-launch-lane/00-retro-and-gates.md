# Run #207 — Launch lane: F6 rate-limit review + two Life OS worker requests

**Cycle:** run #207 (2026-11-14 15:18Z) · **Mode:** full · **Lane rule base:** D-20261113-26
(build the next unbuilt F1–F10 critical-path item first; polish only when no launch item is
buildable; treat Life OS worker requests as buildable work).

## Gate 0 — Retro (compact)

- Last cycle (#206) shipped F5 receipts + P2-341 a11y, both merged + live-verified by this
  run's Reviewer B (fresh 200/400/404/401 matrix + chunk greps). Claims stand.
- **Promote-health correction (this run's key finding):** run #206 reported "ZERO pending
  migrations for promote" — that read the STAGING DB (63 rows). Prod Neon = 60 rows
  (verified live via Render's service id + prod-db-uri.env this run) → **0059
  (settlement void enum) + 0060 (waitlist_removed verb) are PENDING on prod.** Both are
  additive, idempotent (`ADD VALUE IF NOT EXISTS`), journal-chain verified by Reviewer A
  (contiguous idx, prevId-linked snapshots through 0060). Migrate-first applies them in
  seconds at promote time. Lesson: "pending migrations" must be counted against PROD
  (ep-rapid-mud), never staging.
- No fix:feat drift this cycle (0 fix commits needed on #206's work).
- Strix: not due (Nov 14; window = 1st–3rd).

## F-item selection (D-20261113-26 rule)

| Item | State | Decision |
|---|---|---|
| F1 Turnstile | owner-blocked (no TURNSTILE_* keys) | cannot build |
| F2 webhook | owner-gated (Moyasar dashboard URL) | cannot build |
| F3 posture flip | DONE run #205 | — |
| F4 legal drafts | DONE run #205 (PR #254) | — |
| F5 receipts | DONE run #206 (PR #256) | — |
| **F6 rate-limit review** | **buildable — THIS RUN** | review deliverable: `f6-rate-limit-review.md` (this dir) |
| F7–F10 | need owner A2 session first | cannot build |

With no further F-item buildable, per the same rule the two Life OS worker requests became
the build queue: **D-20261114-01 (lawyer brief)** — done, `docs/legal/lawyer-brief.md` — and
**D-20261114-02 (mailer → email-sender port)** — done, PR #258.

## Gates 1–3 (compact, per item)

### F6 rate-limit review (review-only, no code)
- Problem: §8.6/A6 precondition — "public OTP must not open before the review lands."
- Scope: every unguarded-by-JWT surface + the abuse-cap stack behind them.
- Contract: the review doc lists per-surface caps with file:line; verdict + residuals.

### D-20261114-01 lawyer brief (docs-only)
- Problem: lawyer booking due 2026-11-16; brief cuts first-pass time (owner-approved
  agenda D-20261114-01).
- Contract: entity status, processors+locations, false-today claims with file:line +
  TODO-lawyer markers, open questions, zero legal conclusions. Delivered:
  `docs/legal/lawyer-brief.md`. Key verified facts: VPS = Oracle **me-riyadh-1 (Riyadh)**
  → "hosting inside the Kingdom" true post-cutover, false for prod today (Render/Vercel/
  Neon US); PostHog active but undisclosed in the privacy notice; email-only signups
  contradict the "Saudi phone required" children claim (email-otp.service.ts:203-206);
  hello@koralink.sa unreachable (no mail infra) — ops flag to owner.

### D-20261114-02 mailer port (code, PR #258)
- Problem: MailerService read RESEND_API_KEY + posted to api.resend.com inline → staging
  (EMAIL_PROVIDER=brevo) logged notification email instead of sending; OTP email worked.
- Architecture delta: MailerService consumes the EXISTING `EMAIL_SENDER` port
  (hexagonal — no new port, no new dependency); MailerModule registers
  `EMAIL_SENDER_PROVIDER` directly (AuthModule import would cycle); port gains
  `isConfigured()` + optional plain-text param (both adapters forward it).
- API shape changes: none (SendOutcome contract unchanged; adapter throws degrade to
  `transport-error` exactly like the old inline path).
- i18n: none (server-only).
- Gate-3 checklist: every mutation contract unchanged ✓; no frontend consumer ✓ (email
  is server-side only); no new user-facing strings ✓.

## Gate 4 — verification evidence

- jest: mailer 31/31 (5 new port pins) + email-otp 27/27; api tsc 0.
- turbo build --concurrency=1: 3/3 (twice — after port routing and after the proof line).
- PWA vitest: 172 files / 1275 tests green (untouched by this cycle, full-suite re-run).
- LIVE: `PATCH /email/me` → `verificationSent: true`; journald
  `mailer: welcome_verify → user … delivered via BrevoService` (the worker's requested
  proof). API restarted AFTER dist each time (health 200 post-restart ×3).

## Hex lane

api_exc_total 345→346: PR #256's `NotFoundException('Receipt not found.')`
(wallet.receipt.service.ts:285) landed AFTER run #206's audit snapshot — attributed,
ALLOWED class, baselined (hex-audit.mjs), board row P2-364. All other metrics flat.
