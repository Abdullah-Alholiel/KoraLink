# Run #212 — Gate 0 Retrospective: F1 Turnstile on OTP

**Launch lane (D-20261113-26):** production plan lane (a) — next unbuilt critical-path item.
F1 = "Turnstile (or equivalent) on OTP send — 1 run — must land BEFORE public URLs open (A6 gate)."

## Premise check (claims ≠ facts, done first)

- Board/plan F1 status at run start: **NOT BUILT** — `grep -ri turnstile apps/` → 0 hits; no
  Turnstile keys in `apps/api/.env` or PWA `.env`. → F1 is genuinely open, not stale.
- F2 webhook / F9 offsite / F7 cutover / F8 backup-retarget: owner-gated (webhook URL, A2
  session, B2/GitHub pick) — NOT factory-buildable this run. F1 is the ONLY F-lane item a
  factory run can complete end-to-end (official dummy keys are part of CF's public test suite).
- D-20261114-02 (mailer→port): verified **BUILT run #207** (PR #258) — closure row missing in
  DECISIONS.md ledger; recorded this run (Phase 5 docs commit).

## Audit of the exact area (auth OTP send path)

- `POST /auth/send-otp`: 3/min/IP route throttle + per-IP daily 50 (P2-19, runs #22/#27) +
  per-phone caps (60s cooldown, 10/day, 5-fail lockout). Layered caps are solid — but all are
  **reputation/rate guards, not human proofs**. A distributed low-and-slow pump stays under
  every cap and still drains Unifonic balance (SMS pumping).
- `POST /auth/email/send-otp` (`email-auth.controller.ts:44+`): NO route throttle (global
  60/min only). Same class, lower stakes (email send ≈ free).
- Prior guard: P0 SMS_UNAVAILABLE fail-closed (PR #268, merged today) — SMS-config gap closed
  separately; Turnstile closes the *human-ness* gap.
- Hex doctrine: API = layered (Nest exceptions allowed inside services); `Throwing` a Nest
  exception from the verify helper is the ALLOWED class (board P2-340/355/364 precedent).
- DECISIONS.md ledger read FIRST: no owner row governs Turnstile; D-20261113-26 directive
  (build launch-critical items) + D-20261106-15 precedent (owner decision → factory executes
  the mechanical build) applies. Default+48h-veto clock starts when the build ships.

## Scope (Gate 1, compact)

- IN: server-side token verification module (`TURNSTILE_ENABLED=false` default), DTO field on
  both OTP-send DTOs, controller gates on BOTH OTP sends, PWA widget + hook plumbing on the
  login page phone flow, localized error copy EN+AR, specs both sides, E2E probes (flag off/on
  × origin).
- OUT (recorded, not built): email-flow widget (backend-gated anyway; add when keys go real),
  Turnstile on dev-login (staging-only surface, D-20261106-09), admin console (VPS-private),
  real-key provisioning (owner, A6 gate), email-auth TURNSTILE_ENABLED response contract
  parity (documented asymmetry).

## Architecture delta (Gate 2, compact)

- New: `apps/api/src/common/captcha/turnstile.service.ts` (harness-free — zero-dep, mirrors
  brevo.service.ts's `fetch` + ConfigService shape) + `turnstile.spec.ts`.
- DTOs: `SendOtpDto` / `EmailSendOtpDto` gain optional `turnstileToken?: string`.
- Controllers: when `TURNSTILE_ENABLED=true` and no valid token → **400 CAPTCHA_REQUIRED**
  before any counter/OTP write (fail-closed). Service throws
  `BadRequestException({message, code})` — ALLOWED class.
- PWA: `components/auth/Turnstile.tsx` (explicit rendering; `turnstileToken` state on login
  page; widget mounts ONLY when health advertises turnstile; token + reset on failure; submit
  disabled until token present; `aria` labeled; 44px-adjusted container).
- Health contract: `GET /health` gains `turnstile: { enabled: boolean, siteKey: string|null }`.
- i18n: `turnstile.blocked` / `turnstile.missing` EN+AR (+ parity tripwire stays green).

## Contract (Gate 3): exact shapes

- `TurnstileService.verify(token, ip?)` → Promise resolving `{ success: true }` OR THROWS
  `BadRequestException({ message, code: 'CAPTCHA_REQUIRED' | 'CAPTCHA_INVALID' |
  'CAPTCHA_UNAVAILABLE' })`. NEVER falsifies success on network failure (fail-closed;
  reviewer may challenge — rationale: a false accept at the A6 open is attacker-controlled;
  while a false reject is a visible, restartable outage — flip to allow-on-outage ONLY with an
  owner row).
- Health: `{ ..., turnstile: { enabled: bool, siteKey: string|null } }` (200 always; field
  presence is the PWA's only enablement signal).
- PWA hook: `useTurnstileEnabled()` → `{ enabled, siteKey } | null` while loading; login page
  mounts widget only when `enabled === true`.
- DTO field: `turnstileToken?: string` (no size cap; token is opaque and server-verified).
- i18n keys: `turnstile.blocked` = EN "Verification failed — please try again." /
  AR "فشل التحقق — حاول مرة أخرى."; `turnstile.missing` = EN "Verification required — please
  complete the human check." / AR "التحقق مطلوب — أكمل التحقق البشري أولاً." (parity enforced).
- Mutations: none (read-only add); DB migration: none; new user-visible surface: widget +
  error copy on login (the run's user-visible item).

## Observability (AGENTS.md §4)

- Pino warn logs on every reject with `code` + masked context; Sentry via Nest's existing
  interceptor on 4xx? (Nest doesn't report 4xx by default) → service-side `Sentry.addBreadcrumb`
  on verify failures (rate/data points, no PII) + the health field exposes enablement drift
  (enabled flag vs actual keys) — watchdog/owner can see it.

## Risks

- R1: CF verify outage → fail-closed rejects ALL logins (documented owner-call; flag flip is
  the recovery). R2: token never verified when flag off → dead widget risk killed by the
  health-advertised enablement (widget mounts ONLY when server verifies). R3: domain mismatch
  (TS hostname not registered to a dummy key) — REAL KEYS are domain-registered; dummy keys
  always-pass server-side, so staging E2E can flip the flag and probe the 400/200 gate without
  widget-pass constraints.
