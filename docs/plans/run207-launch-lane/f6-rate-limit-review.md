# F6 — Rate-limit review on public auth endpoints (launch precondition A6)

**Run:** #207 (2026-11-14) · **Requirement source:** docs/plans/prod-on-vps.md §8.6 item 6
("existing `@Throttle` coverage was sized for Tailscale-internal; re-check auth endpoints
when URLs go public") + production plan A6 ("public OTP must not open before the review
lands"). **Verdict: READY for public exposure** — with two documented residuals and one
deployment gate (§ Verdict).

## 1. The abuse-cap stack (verified in code, this run)

| Layer | Value | Where |
|---|---|---|
| Global throttle (ALL routes) | 60 req/min per IP | `apps/api/src/app.module.ts:31,62` (ThrottlerModule + APP_GUARD ThrottlerGuard) |
| send-otp (SMS) | 3/min per IP route cap | `modules/auth/auth.controller.ts:54` |
| verify-otp (SMS) | 3/min per IP route cap | `auth.controller.ts:76` |
| dev-login | flag-gated (`DEV_LOGIN_ENABLED`, default OFF; prod Render has it false — verified live) + 3/min | `auth.controller.ts:144-164` |
| per-phone (SMS) | 60s cooldown · 10/day · lockout after 5 verify fails | `OtpStoreService` (via `authService.sendOtp`) |
| per-IP daily (SMS) | 50/day per IP | same store, `auth.controller.ts:48-51` contract |
| email send-otp | 3/min per IP + 60s cooldown + 10/day per address + **50/day per IP** | `email-auth.controller.ts:52` + `email-otp.service.ts:62-100` |
| email verify-otp | 3/min per IP + fail lockout (machine-readable retryAfter) | `email-auth.controller.ts:71` + `email-otp.service.ts:163-174` |
| trust proxy | `TRUST_PROXY=1` live in staging env — req.ip = real client behind the single ingress hop; boot-fails on garbage | `main.ts:67-70`, `common/security/trust-proxy.ts` (P2-155, run #105; 7-case spec) |
| WS | JWT-required handshake + origin allowlist + per-socket rate buckets, released on disconnect | `modules/gateway/app.gateway.ts:141+`, `rate-limit.service` |
| Wallet Moyasar top-up | intent-based: verify endpoint is intent-keyed, replay-safe; legacy self-credit route DELETED (P2-331, PR #232) | `wallet.controller.ts` |
| Email set/resend | 5/min + 3/min, JWT-gated | `mailer.controller.ts:41,62` |

## 2. Public surface census (controllers with no JwtCookieAuthGuard)

- `auth` + `auth/email` OTP pairs — capped as above ✓
- `health` GET — liveness probe, deliberately open, constant-cost ✓
- `settings/public` GET — single whitelisted key (`refund_policy`), read-only ✓
- admin controllers (`modules/admin/*`) — all 12 carry AdminAuthGuard (verified by grep:
  12/12; zero without) ✓
- dev-login — flag OFF in prod ✓
- WebSocket — closed without a valid JWT ✓

No unguarded POST surface exists without a route-level or store-level cap. (Reviewer A
independently confirmed the same census this run — zero findings.)

## 3. Public-URL adequacy assessment (the §8.6 question)

The caps were "sized for Tailscale-internal", but their design already assumes hostile
public traffic:

- **Distributed spoofing is bounded by TRUST_PROXY=1**: only ONE ingress hop is trusted,
  so a public client cannot mint arbitrary `X-Forwarded-For` values to rotate per-IP
  buckets. Behind multi-hop CDNs/proxies the value WOULD need revisit — the Coolify/
  sslip cutover keeps exactly one ingress (Coolify proxy), so `TRUST_PROXY=1` remains
  correct there. **Deployment gate: the prod environment MUST carry TRUST_PROXY=1 (same
  as staging) at cutover — add it to the cutover checklist (F7 runbook input).**
- **SMS economics:** worst case per attacker IP = 50 SMS/day (per-IP daily cap) + 3/min
  bursts. Unifonic prepaid balance is protected; Turnstile (F1) remains the strong
  layer and is separately owner-gated.
- **OTP guessing:** 3/min per IP on verify × 6-digit space + 5-fail/15-min per-phone
  lockout = brute force impractical per IP; a botnet rotating IPs hits the per-phone
  lockout, which is the primary defense (by design).
- **Email OTP:** same 3/min + daily caps; Brevo has its own abuse controls; the send
  response is non-committal (anti-enumeration).

## 4. Residuals (documented, accepted for launch)

1. **R1 (MINOR, pre-existing):** throttler buckets are per-process (in-memory). Multiple
   API replicas would multiply per-IP caps. Single-instance today and at launch scale
   (prod plan = one api container) — acceptable; revisit only if the API ever scales out.
2. **R2 (MINOR, accepted run #148):** WS reconcile pre-reads bypass the rate limiter
   (P2-220 residual). Read-only, authenticated.
3. **R3 (INFO):** `@Throttle` route caps are per-minute; the per-IP daily cap exists ONLY
   on the OTP send paths (by design — it lives in OtpStoreService). Other public GETs
   rely on the 60/min global only, which is adequate for read-only whitelisted endpoints.

## 5. Verdict

**READY.** Public-OTP exposure is bounded at every layer; nothing in the current stack is
sized *incorrectly* for public URLs. Launch conditions:
- (gate) prod env carries `TRUST_PROXY=1` at cutover → folded into the F7 cutover checklist;
- (parallel) F1 Turnstile lands when the owner hands over keys (independent strengthening).
