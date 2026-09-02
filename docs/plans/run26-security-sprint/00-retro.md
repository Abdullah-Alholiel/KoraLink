# Run #26 — Security Sprint (Retro + Plan)

> Single-document plan covering Gates 0–3 for **three sequential slices**: P0-7 (dev-login admin bypass) → P0-8 (push-endpoint SSRF) → P1-17a (dep upgrade, next 15.5.21 first). Per `koralink-software-factory` autonomous mode, all gates land in a single compact doc.

## Gate 0 — Retrospective

**Audit areas (per run #25 Strix report, `koralink-src_fa31`):**

1. **P0-7** — Dev-login admin bypass + free wallet credit (CVSS 9.1).
   - `auth.controller.ts:120-124` blocks `/auth/dev-login` only when `NODE_ENV === 'production'`.
   - Live box `apps/api/.env:24` has `NODE_ENV=development` → gate is **NOT** exercised.
   - `auth.service.ts:234-238` signs dev-login JWTs with **no `expiresIn` option** (compare to `verifyOtp` at :158-161 which passes `expiresIn: '7d'`).
   - **Live-confirmed (run #26, just now)**: dev-login with `surface:'ops'` and `phone:'+966500000000'` returns Admin JWT; `GET /api/v1/admin/users` returns 200 with full user data. The exploit is reachable today.
   - `wallet.controller.ts:69-75` same pattern for topup.
   - `DevLoginBar` (`apps/player-pwa/src/components/auth/DevLoginBar.tsx:23-30`) gates on hostname allowlist (private CIDR + NODE_ENV != production), not build-time exclusion. Live box NODE_ENV=development → visible.
   - `admin/src/app/login/page.tsx:33` itself calls dev-login as primary ops path.

2. **P0-8** — Push-endpoint SSRF (CVSS 7.7).
   - `notifications.service.ts:54-77` (subscribe) stores user-supplied `endpoint` URL verbatim.
   - `notifications.service.ts:214-217` (send) passes it to `webpush.sendNotification` which makes the server-side HTTP request.
   - No URL scheme/host/IP validation anywhere.
   - Cloud metadata `169.254.169.254`, internal services, link-local addresses all reachable.

3. **P1-17a** — Dep upgrades (Reviewer-A confirmed versions).
   - apps/api: `axios ^1.7.4` → 1.13.6 (3 CVEs), `drizzle-orm ^0.44.1` → 0.44.7 (1 CVE, but no reachable sink per Strix).
   - apps/player-pwa + apps/admin: `next 15.2.9` → CVE-2026-44575 (middleware bypass) — **reachable via PWA `src/middleware.ts`**.
   - ws 8.18.3 / engine.io 6.6.5 — DoS pair via @nestjs/platform-socket.io.

4. **P1-17b** — Secrets/session:
   - `apps/api/.env.bak-expose-20260901101040` on disk (1,977 bytes) with `JWT_SECRET`/`COOKIE_SECRET` values; `git check-ignore` says NOT ignored (only `.env` etc. in .gitignore).
   - `REDIS_PASSWORD` empty in code defaults → unauthenticated Redis.

5. **P1-17c** — WS origin: enforced only in prod; reflects `callback(null,true)` in CORS.

6. **P1-17d** — ICS TEXT injection: `matches.controller.ts:99-108` interpolates `match.title` unescaped (no RFC 5545 escape).

**Verified PASS from run #25 (Reviewer-B re-verified):**
- P2-41 koralink-wallet TOCTOU at `matches.service.ts:1258-1279` — conditional UPDATE `WHERE wallet_balance >= $cost` ✓
- 4 jest specs `matches.koralink-wallet.spec.ts` ✓
- Sentry noise gate at `notifications.service.ts:240-248` ✓ (5xx/timeout only)
- API `/health` 200 ✓

**Standing bug-class sweep (Reviewer-A):**
- `::uuid` casts: 0 ✓
- `eq(col, null)`: 0 ✓
- bare `.returning()`: 10 sites (all return full rows to service code; contract OK)
- `console.log` prod: 0 ✓
- i18n parity en/ar: 0 diffs ✓ (deep key compare)
- z-index: 5×z-[90], 5×z-[80], 4×z-[70], 2×z-[60] — minor consolidation (P2 polish, NOT this run)

**Buildable scope for run #26** (per APPROVED RUN PLAN + Reviewer-B's sequencing):
- Slice 1 — P0-7: feature flags + always-expiresIn + DevLoginBar build-time + admin OTP-path pre-check + remove `.env.bak-expose-*` (fold in P1-17b's most critical file).
- Slice 2 — P0-8: SSRF validation util (HTTPS + allowlist + private/loopback/link-local rejection) at subscribe AND send.
- Slice 3 — P1-17a partial: `next ^15.5.21` for PWA + admin (the reachable CVE); bundle Dep upgrades for `drizzle-orm ^0.45.2`, `axios ^1.16.0`, ws/engine.io via npm overrides.

**P1-17b (full) + P1-17c + P1-17d** — DEFER to next run(s); all buildable but won't fit. Reviewer-B reported 4 new product gaps (P1 no partner self-onboarding, P1 no phone change, P2 push-subscription sweep, P2 DevLoginBar hardening folded into P0-7) — add to board.

## Gate 1 — Product Spec

### Problem statements
- **P0-7**: A live-network-reachable attacker can mint a 7-day, non-expiring Admin JWT and free SAR 10,000 wallet credits via two public endpoints. The single `NODE_ENV` string-gate is the only barrier; the live box runs `NODE_ENV=development` (KoraLink's tailnet deployment), so the gate is not exercised. Admin login itself depends on this dev-only path.
- **P0-8**: A malicious or compromised client can register a push subscription whose `endpoint` URL points at any HTTPS-reachable host. The server subsequently fetches that endpoint with the actual notification payload (title, body, data), enabling internal-network probing (cloud metadata `169.254.169.254`, link-local), and a 404/410 status oracle (differentiates prune from other failures).
- **P1-17a**: 8 supply-chain CVEs, of which 2 are actively reachable (next middleware bypass on PWA's `src/middleware.ts`; axios prototype-pollution gadget via the Unifonic SMS call). The remainder are dependency hygiene.

### User stories

**P0-7 (P0 class, security)**:
- US-S1: As the KoraLink platform, **the deployment must NOT have any code path that grants Admin tokens via dev-only credentials when the operator is reachable on a non-loopback network**. Replace the `NODE_ENV` string-gate with explicit opt-in flags `DEV_LOGIN_ENABLED` and `WALLET_TOPUP_ENABLED` (default OFF) read from env. Even when ON, tokens must carry `expiresIn`. DevLoginBar must be excluded from production bundles at build time (not gated by hostname).
- US-S2: As an admin operator, I want the **admin console's login flow to remain functional after the dev-login is disabled** — verify the OTP path (`POST /auth/send-otp` → `POST /auth/verify-otp`) accepts `surface:'ops'` and produces an Admin JWT (current code only assigns Admin via seed; the OTP path must work for the seeded admin phone too).

**P0-8 (P0 class, security)**:
- US-S3: As the KoraLink platform, **a push subscription `endpoint` must point at a real push-provider host on port 443, with a public IPv4/IPv6, not at private/loopback/link-local addresses**. Validate at subscribe time (so the DB is always clean). Re-validate at send time (defense in depth: the DB may have stale entries that pre-date the rule).
- US-S4: As a developer, I want the **allowlist of push providers to be explicit and documented** — FCM (`fcm.googleapis.com`, `fcm.googleapis.com`), Mozilla (`updates.push.services.mozilla.com`, `push.services.mozilla.com`), Apple (`web.push.apple.com`, `api.push.apple.com`, `api.sandbox.push.apple.com`), Windows (`wns.notify.windows.com`), and any admin-allowlisted hostname.

**P1-17a (P1 class, security hygiene)**:
- US-S5: As the platform, **PWA and admin must run on next `^15.5.21`** to close the middleware-bypass CVE (PWA's `src/middleware.ts` is the route-authorization boundary).
- US-S6: As the platform, **apps/api must use `axios ^1.16.0`** (closes prototype-pollution gadget chain) and **`drizzle-orm ^0.45.2`** (closes the unescaped-identifier advisory; not actively reachable but still a hygiene issue).
- US-S7: As the platform, **transitive `ws ^8.21.0` and `engine.io ^6.6.7`** are forced via npm overrides (closes the DoS pair transitively pulled by `@nestjs/platform-socket.io`).

### Scope & boundaries
- IN SCOPE: API controllers + service code (P0-7, P0-8), PWA + admin Next.js build config + Dep pins (P1-17a), Jest specs for all three, .env hygiene, .gitignore pattern.
- OUT OF SCOPE: Admin session invalidation (full P1-17b is a bigger project), Redis hardening (deferred), WS origin always-enforce (P1-17c, deferred), ICS TEXT escape (P1-17d, deferred), admin → HttpOnly cookies, Sentry token rotation, full secret rotation.

### Success criteria
- Live: `DEV_LOGIN_ENABLED=false` → `/auth/dev-login` returns 403; live-restarted API.
- Live: `DEV_LOGIN_ENABLED=true WALLET_TOPUP_ENABLED=false` → dev-login 200 (with expiresIn claim in JWT), topup 403.
- Live: any subscribe with `endpoint: 'http://169.254.169.254/latest/meta-data'` → 400.
- Live: any subscribe with `endpoint: 'https://example.com/x'` → 400 (not in allowlist).
- Live: any subscribe with `endpoint: 'https://fcm.googleapis.com/...' (port 443, valid key shape)` → 200.
- Build: `next 15.5.21+` in apps/player-pwa and apps/admin; `npm audit --production` on apps/api shows 0 High from the 8 CVEs.
- Tests: jest 220+ (was 213, +7 P0-7 + 5 P0-8 + 1 build); vitest 272 (unchanged); build 3/3; tsc 0.

### Open questions
- None. Reviewer-B confirmed the admin OTP-path is a build-time pre-check (verifiable in jest + live), not a separate product question.

### Risks
- **Admin lockout**: if `DEV_LOGIN_ENABLED=false` and the OTP path is broken, no one can log in to admin. Mitigation: SPEC the OTP path as part of this slice, live-verify before flipping the flag.
- **Push allowlist may need a fallback for browser OSes that aren't on the list** (e.g. Huawei HMS, Samsung push). Mitigation: an `ADMIN_PUSH_HOST_ALLOWLIST` env override (comma-separated) so operators can add hosts without code changes. Default to the documented 8 hosts.

## Gate 2 — Architecture

### Data flow (P0-7)

```
.env (set DEV_LOGIN_ENABLED=false in prod; ADMIN_PUSH_HOST_ALLOWLIST=)
  → main.ts: parses via ConfigService (already does)
  → auth.controller.ts:devLogin: reads DEV_LOGIN_ENABLED
    if false: throw ForbiddenException('dev-login is disabled')  ← before any work
    if true: read JWT_EXPIRY → pass to signAsync as expiresIn
  → auth.service.ts:devLogin: ALWAYS pass { expiresIn: JWT_EXPIRY || '7d' } (defense in depth)
  → wallet.controller.ts:topup: reads WALLET_TOPUP_ENABLED
    if false: throw ForbiddenException('topup disabled')
  → DevLoginBar: gated at build time via dynamic import in next.config.mjs webpack
    ignore-loader pattern: if process.env.NEXT_PUBLIC_DISABLE_DEV_LOGIN_BAR === 'true',
    the import resolves to a no-op module
  → admin/src/app/login/page.tsx: OTP path must work for surface='ops'
    (current code: send-otp + verify-otp with surface in body → already routes to user.role='Admin'
    because the seeded admin phone is +966500000000)
```

### Data flow (P0-8)

```
notifications.controller.ts:subscribe
  → body.endpoint: validated by PushEndpointValidator.assertSafe(endpoint)  ← NEW util
    if invalid: throw BadRequestException with reason
  → notifications.service.ts:subscribe
    → re-validate (defense in depth, in case validator is bypassed in tests/dev)
    → upsert only after validation passes
  → notifications.service.ts:sendNotification
    → for each subscription: re-validate endpoint before webpush.sendNotification
    → uniform failure handling (always return the same Sentry/Prune path; no 404/410 oracle)
```

### Files changed

| File | Slice | Change |
|------|-------|--------|
| `apps/api/.env` | P0-7 | Remove `.env.bak-expose-*`. Add `DEV_LOGIN_ENABLED=false` + `WALLET_TOPUP_ENABLED=false` (explicit defaults — they read from env, so the absence means OFF). |
| `apps/api/.env.example` | P0-7 | Document both flags. |
| `.gitignore` | P0-7 | Add `.env.*` and `!.env.example`. |
| `apps/api/src/modules/auth/auth.service.ts` | P0-7 | devLogin: always pass `{expiresIn: config.get('JWT_EXPIRY','7d')}`. |
| `apps/api/src/modules/auth/auth.controller.ts` | P0-7 | devLogin: replace `NODE_ENV` gate with `DEV_LOGIN_ENABLED`. |
| `apps/api/src/modules/wallet/wallet.controller.ts` | P0-7 | topup: replace `NODE_ENV` gate with `WALLET_TOPUP_ENABLED`. |
| `apps/api/src/common/security/push-endpoint.validator.ts` (NEW) | P0-8 | `assertSafePushEndpoint(url, allowlist)` — HTTPS-only, port 443, host in allowlist, IP not private/loopback/link-local, length cap, no userinfo, no fragment. |
| `apps/api/src/common/security/push-endpoint.validator.spec.ts` (NEW) | P0-8 | 10+ jest specs. |
| `apps/api/src/modules/notifications/notifications.service.ts` | P0-8 | subscribe + send: call validator. |
| `apps/api/src/modules/notifications/notifications.controller.ts` | P0-8 | no change (validation lives in service). |
| `apps/player-pwa/next.config.mjs` | P0-7 | Build-time `DevLoginBar` exclusion via `NEXT_PUBLIC_DISABLE_DEV_LOGIN_BAR`. |
| `apps/player-pwa/src/components/auth/DevLoginBar.tsx` | P0-7 | Honor the flag (returns null). |
| `apps/player-pwa/src/app/[locale]/login/page.tsx` | P0-7 | (no change — already imports DevLoginBar). |
| `apps/admin/src/app/login/page.tsx` | P0-7 | Verify OTP path works for `surface='ops'` (test-only; code is the same path). |
| `apps/api/package.json` | P1-17a | `axios ^1.16.0`, `drizzle-orm ^0.45.2`. |
| `apps/api/package.json` overrides | P1-17a | `ws ^8.21.0`, `engine.io ^6.6.7`. |
| `apps/player-pwa/package.json` | P1-17a | `next ^15.5.21`. |
| `apps/admin/package.json` | P1-17a | `next ^15.5.21`. |
| `apps/player-pwa/.env.local` | P0-7 | `NEXT_PUBLIC_DISABLE_DEV_LOGIN_BAR=true` for prod deployments. |
| `apps/player-pwa/.env.local` (Tailscale live) | P0-7 | Leave OFF for live dev (we need DevLoginBar here). |
| Jest specs | All | `auth.dev-login.spec.ts` (P0-7: 7 cases), `wallet.topup-flag.spec.ts` (P0-7: 2 cases), `push-endpoint.validator.spec.ts` (P0-8: 10 cases). |
| Vitest | All | Possibly update DevLoginBar tests if any. |

### i18n keys needed
- None — all changes are server-side / build-time. No user-facing copy changes.

### Risks & mitigations
- **Admin lockout**: see Gate 1 Risks. Live-verify the OTP path BEFORE the flag flips.
- **Push allowlist too tight**: `ADMIN_PUSH_HOST_ALLOWLIST` env override (comma-separated) for operators to add hosts without code change.
- **next 15.5.21 breaking**: PWA's middleware uses `middleware.ts` (file convention is unchanged in 15.5). The PWA's `src/middleware.ts` is referenced by `next.config.mjs` no — it is auto-discovered. Run a build to confirm. If it breaks, pin to 15.5.16 (a transitively safer but older release) and file a follow-up.
- **Axios upgrade**: 1.13.6 → 1.16.0 — review breaking changes; the API used is just `axios.post(url, body, config)`. Should be drop-in.

### What is descoped (and why)
- P1-17b full (secrets rotation, Redis password, admin → HttpOnly, server-side session invalidation) — needs a real secret rotation procedure; doing it without rotating `JWT_SECRET` (which would invalidate every live session) creates the lockout. Deferred to run #27.
- P1-17c (WS origin) — small (10-line app.gateway.ts diff) but not reachable from outside the same CORS surface; the live Tailscale deployment is origin-restricted at the proxy. Deferred to run #28.
- P1-17d (ICS TEXT escape) — small (10-line helper in matches.controller.ts:99-108) but requires a parser test (ical.js) we don't have wired. Deferred to run #28.

## Gate 3 — Program Design (the contract gate)

### Exact JSON response shapes

**P0-7 dev-login (unchanged shape, but gate flips):**

```http
POST /api/v1/auth/dev-login
Content-Type: application/json
{ "phone": "+966500000000", "surface": "ops" }

# When DEV_LOGIN_ENABLED=true:
HTTP/1.1 200 OK
Set-Cookie: access_token=eyJ...; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800
{
  "message": "Dev login successful.",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."  // has exp claim now
}

# When DEV_LOGIN_ENABLED=false (default in prod):
HTTP/1.1 403 Forbidden
{ "message": "dev-login is disabled in this environment", "error": "Forbidden", "statusCode": 403 }
```

**P0-7 wallet topup:**

```http
POST /api/v1/wallet/topup
Authorization: Bearer ...
{ "amount": 100, "referenceId": "...", "idempotencyKey": "..." }

# When WALLET_TOPUP_ENABLED=true (dev only):
HTTP/1.1 201 Created
{ ... existing shape ... }

# When WALLET_TOPUP_ENABLED=false (default):
HTTP/1.1 403 Forbidden
{ "message": "Wallet top-up is disabled in this environment", "error": "Forbidden", "statusCode": 403 }
```

**P0-8 push subscribe (new validation):**

```http
POST /api/v1/notifications/subscribe
Authorization: Bearer ...
{ "endpoint": "https://fcm.googleapis.com/...", "keys": { "p256dh": "...", "auth": "..." }, "locale": "en" }

# Valid:
HTTP/1.1 200 OK
{ "subscribed": true }

# Rejected (multiple reasons, all 400):
# - non-HTTPS:    { "message": "Invalid push endpoint: must use https", "statusCode": 400 }
# - wrong port:   { "message": "Invalid push endpoint: must use port 443", "statusCode": 400 }
# - bad host:     { "message": "Invalid push endpoint: host not in allowlist", "statusCode": 400 }
# - private IP:   { "message": "Invalid push endpoint: must be a public IP", "statusCode": 400 }
# - too long:     { "message": "Invalid push endpoint: exceeds length cap", "statusCode": 400 }
# - userinfo:     { "message": "Invalid push endpoint: no userinfo allowed", "statusCode": 400 }
# - fragment:     { "message": "Invalid push endpoint: no fragment allowed", "statusCode": 400 }
```

### TypeScript return types

```typescript
// auth.service.ts (P0-7)
async devLogin(phone: string, surface: 'player' | 'ops' | 'admin'): Promise<string> {
  // always signs with expiresIn; the feature flag is checked in the controller
  return this.jwt.signAsync(
    { sub: user.id, phone: user.phone, role: user.role },
    { expiresIn: this.config.get<string>('JWT_EXPIRY', '7d') },
  );
}

// push-endpoint.validator.ts (P0-8) — NEW
export type PushEndpointValidationError =
  | 'must-use-https'
  | 'must-use-port-443'
  | 'host-not-allowed'
  | 'must-be-public-ip'
  | 'exceeds-length-cap'
  | 'userinfo-not-allowed'
  | 'fragment-not-allowed';

export function assertSafePushEndpoint(
  endpoint: string,
  allowlist: ReadonlySet<string>,
): asserts endpoint is string;
// Throws BadRequestException with a localized message on any failure.
```

### Frontend hook signatures (no change)

- `useAuth.ts` — no change.
- `usePushNotifications.ts` — no change; the new validation lives server-side only.

### Adapter function contracts (no change)

- No adapter changes.

### i18n key contracts (no change)

- No new i18n keys (server-side only).

### Contract verification checklist

- [x] Mutation endpoint returns fully populated object: devLogin still returns `{message, token}`; no relations.
- [x] Frontend types accept backend output: PWA reads the dev-login `token` and stores it; the `token` shape is unchanged.
- [x] Adapters exist for every API shape: n/a (no new shapes).
- [x] No field silently undefined: devLogin always returns `token` (no fallback).
- [x] i18n keys exist: n/a.
- [x] NEW: build-time gate on DevLoginBar — verified by `next build` emitting a bundle that does NOT contain the bar code (grep `DevLoginBar` in build output).
- [x] NEW: env-var allowlist extensibility — `ADMIN_PUSH_HOST_ALLOWLIST` reads, appends to allowlist.
- [x] NEW: jest specs cover all 7 P0-7 cases + 10 P0-8 cases + 1 happy-path for validator.

## Gate 4 — Vertical Slices (tracer bullet first)

Per item, each slice ends with `turbo run build` + `npx jest` + `npx vitest run` green and a separate conventional commit.

1. **Slice 1 (P0-7)** — dev-login admin bypass fix (CRITICAL).
2. **Slice 2 (P0-8)** — push-endpoint SSRF fix (CRITICAL).
3. **Slice 3 (P1-17a)** — dep upgrade (next 15.5.21 + drizzle + axios + ws/engine.io overrides).
