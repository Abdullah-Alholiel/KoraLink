# Gate 3 — Program Design (CONTRACT GATE)

This gate locks the exact shapes so infra + code can't drift. Everything here is a contract —
do not change a value without re-opening this gate.

---

## 1. API environment contract (fail-fast via `validationSchema`)

`apps/api/src/config/validation.ts` (new) — `ConfigModule.forRoot({ validationSchema })`.
In `NODE_ENV=production`, all of these MUST be non-empty (no fallback) or boot aborts:

```ts
{
  NODE_ENV: z.enum(['development', 'production', 'test']),
  PORT: z.coerce.number().default(3001),
  DATABASE_URL: z.string().min(1),                 // required in prod
  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z.coerce.number().default(6379),
  REDIS_PASSWORD: z.string().default(''),
  JWT_SECRET: z.string().min(32),                  // required, ≥32 chars, NO default
  JWT_EXPIRY: z.string().default('7d'),            // see open question #2
  COOKIE_SECRET: z.string().min(32),               // required, NO 'change-me'
  PLAYER_URL: z.string().url(),                    // required (CORS + cookie origin)
  ADMIN_URL: z.string().url().default('http://localhost:3002'),
  SENTRY_DSN: z.string().url(),                    // required in prod
  UNIFONIC_APP_ID: z.string().min(1),
  UNIFONIC_SENDER: z.string().min(1),
}
```

Remove `'fallback-dev-secret'` (jwt-cookie.strategy.ts:32) and `'change-me'` (main.ts:29).

## 2. PWA environment additions (`env.mjs`)

```ts
client: {
  NEXT_PUBLIC_API_URL:       z.string().url(),
  NEXT_PUBLIC_APP_URL:       z.string().url(),
  NEXT_PUBLIC_MAPBOX_TOKEN:  z.string().min(1),
  NEXT_PUBLIC_MOYASAR_KEY:   z.string().min(1),
  NEXT_PUBLIC_SENTRY_DSN:    z.string().default(''),
  NEXT_PUBLIC_SENTRY_ORG:    z.string().default(''),
  NEXT_PUBLIC_SENTRY_PROJECT:z.string().default(''),
  NEXT_PUBLIC_POSTHOG_KEY:   z.string().default(''),
  NEXT_PUBLIC_POSTHOG_HOST:  z.string().default('https://app.posthog.com'),
}
```

## 3. CSP `connect-src` (env-driven — exact final value)

```text
default-src 'self';
script-src 'self' 'unsafe-inline' 'unsafe-eval' https://api.mapbox.com https://cdn.moyasar.com;
style-src 'self' 'unsafe-inline' https://api.mapbox.com;
img-src 'self' data: blob: https://*.mapbox.com;
connect-src 'self' https://api.mapbox.com https://events.mapbox.com https://*.ingest.sentry.io https://app.posthog.com https://*.posthog.com <NEXT_PUBLIC_API_URL origin> ws: wss:;
worker-src blob:;
font-src 'self' data:;
frame-src 'none'; object-src 'none'; base-uri 'self'; form-action 'self'
```

- The `connect-src` list is assembled at build time from `NEXT_PUBLIC_*` env — **no hardcoded
  `100.93.99.24` / `*.ts.net`**. Those remain reachable in dev via a separate dev-only header.

## 4. OTP abuse rules (exact — `otp-store.service.ts`)

| Key (Redis) | TTL | Purpose |
|-------------|-----|---------|
| `otp:{phone}` | 5 min | the code |
| `otp:cooldown:{phone}` | 60 s | resend lock — `send-otp` returns **429** if present |
| `otp:fails:{phone}` | 15 min | verify counter — **429** when ≥ 5 |
| `otp:day:{phone}` | 24 h | daily send cap — **429** when ≥ 10 |

Behavior: `sendOtp` → 429 (cooldown or daily cap). `verifyOtp` success → delete `otp`, `fails`.
`verifyOtp` mismatch → `INCR fails`. Error body shape (both cases):

```json
{ "statusCode": 429, "message": "Too many attempts. Try again later.", "error": "Too Many Requests" }
```

## 5. Cookie contract (assert, not change)

`verify-otp` sets: `access_token` = JWT, `httpOnly:true`, `secure: NODE_ENV==='production'`,
`sameSite: NODE_ENV==='production' ? 'strict' : 'lax'`, `maxAge: 7d`, `path:'/'`.
**Deploy ordering:** flip `secure` to `true` only after Slice A (HTTPS) is live.

## 6. Sentry config contracts

**API (`main.ts`):**
```ts
Sentry.init({ dsn, environment: config.NODE_ENV, tracesSampleRate: 0.1,
  beforeSend: (event) => redact(event, ['phone', 'access_token', 'authorization', 'cookie']) });
```
Global filter `@Catch()`: `Sentry.captureException(exception, { extra: { requestId, userId: req.user?.sub, path: req.url } })`, then rethrow.

**PWA (`instrumentation.ts`):**
```ts
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config');
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config');
  }
}
```
`next.config.mjs`: wrap with `withSentryConfig(config, { org, project, authToken, silent: true })`,
`sourcemaps: { deleteSourcemapsAfterUpload: true }`, release = `git rev-parse --short HEAD`.

**Client error capture:** `error.tsx` and `global-error.tsx` call `captureError(error, { route: pathname })`
(replacing `console.error`). `global-error.tsx` renders the same retry UI.

## 7. Health / readiness JSON (exact)

```json
// GET /api/v1/health            (liveness — unchanged)
{ "status": "ok", "timestamp": "2026-08-16T00:00:00.000Z" }

// GET /api/v1/health/ready      (readiness — new)
{ "status": "ok", "checks": { "database": "up", "redis": "up" } }   // 200
{ "status": "error", "checks": { "database": "down", "redis": "up" } } // 503
```

## 8. Web Push payload + worker behavior (exact)

Server sends (already established):
```json
{ "title": "...", "body": "...", "data": { "type": "match-chat|dm|pom-decided", "matchId": "…", "conversationId": "…", "locale": "ar|en" } }
```
`worker/index.js` MUST:
- `const locale = event.data?.locale === 'ar' ? 'ar' : 'en';` (replace hardcoded `'en'` at line 19)
- `dir: locale === 'ar' ? 'rtl' : 'ltr'` (replace `dir: 'auto'`)
- deep link `/${locale}/match/${matchId}` or `/${locale}/messages/${conversationId}`.

## 9. Mutation-return contract test matrix (Slice E — exact assertions)

For each endpoint, the test asserts the response body **equals the shape of `GET /matches/:id`**
(the `findOne(matchId)` MatchDetail), specifically:

| Endpoint | Assert |
|----------|--------|
| `POST /matches/:id/join` | body has `id`, `players[]` (incl. self), `pitch`, `host` |
| `POST /matches/:id/leave` | same populated shape, player removed |
| `POST /matches/:id/start` | `status === 'InProgress'` + populated relations |
| `POST /matches/:id/complete` | `status === 'Completed'` + `votingClosesAt` present |
| `POST /matches/:id/cancel` | `status === 'Cancelled'` + populated relations |
| `POST /wallet/…` (cancel refund) | ledger `amount === matches.pitch_cost_sar` (not re-derived) |

Every test asserts: **no top-level `{ message }` object** and **no bare `.returning()` row**
(missing `pitch`/`players` keys fails).

## 10. New i18n keys (Slice J install prompt — add to BOTH `ar.json` + `en.json`)

```json
{
  "install": {
    "title_ar": "ثبّت التطبيق على جهازك",
    "title_en": "Install KoraLink on your device",
    "ios_instructions_ar": "اضغط زر المشاركة ثم «إضافة إلى الشاشة الرئيسية»",
    "ios_instructions_en": "Tap Share, then “Add to Home Screen”",
    "install_btn_en": "Install",
    "install_btn_ar": "تثبيت",
    "dismiss_en": "Not now",
    "dismiss_ar": "ليس الآن"
  }
}
```

## Contract verification checklist (Gate 3 → 4)

- [ ] Env schema rejects empty `JWT_SECRET`/`COOKIE_SECRET`/`DATABASE_URL` in prod (boot aborts)
- [ ] No fallback secret literals remain in `src/` (`grep -rn "fallback-dev-secret\|change-me" apps/api/src`)
- [ ] CSP assembled from env; `grep 100.93.99.24 apps/player-pwa/next.config.mjs` → 0
- [ ] `error.tsx`/`global-error.tsx` call `captureError`; `grep console.error apps/player-pwa/src/app` → 0
- [ ] `worker/index.js` has no hardcoded `locale`; `dir` is locale-derived
- [ ] API `npm test` has ≥ 1 spec per module (auth/matches/wallet/potm)
- [ ] `GET /health/ready` returns 503 when Postgres is stopped
- [ ] Push delivered to a real device over HTTPS
