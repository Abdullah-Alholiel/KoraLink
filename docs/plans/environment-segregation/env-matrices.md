# Env Matrices — source of truth (environment-segregation)

Status after every Gate-4 slice MUST be re-verifiable against this file. Secrets are never
written here — only key names and non-secret values. `…` = existing secret, unchanged.

## 🟡 STAGING (VPS quartet — branch `staging`, dummy data, dev-login ON)

| Var | VPS API (`koralink-api.service`) | VPS PWA (build) | VPS Admin (build) |
|---|---|---|---|
| Branch | `staging` | `staging` | `staging` |
| `NODE_ENV` | `staging` | build-forced `production` by `next build` | build-forced `production` |
| `PORT` | `3001` | `3000` | `3002` |
| `DATABASE_URL` | VPS PG docker (`127.0.0.1:5432/koralink_dev`, value already in `.env`) | — | — |
| `DEV_LOGIN_ENABLED` | `true` | — | — |
| `PLAYER_URL` | `http://localhost:3000, http://100.93.99.24:3000, https://aa.tail2948f9.ts.net:9450, https://aa.tail2948f9.ts.net:10000` — **Vercel origins REMOVED** | — | — |
| `ADMIN_URL` | `http://localhost:3002, http://100.93.99.24:3002, https://aa.tail2948f9.ts.net` — **Vercel origins REMOVED** | — | — |
| CORS effect | allows ONLY staging origins | — | — |
| `NEXT_PUBLIC_API_URL` | — | `https://aa.tail2948f9.ts.net:8443/api/v1` (unchanged) | `https://aa.tail2948f9.ts.net:8443/api/v1` (unchanged) |
| `NEXT_PUBLIC_APP_URL` | — | `https://aa.tail2948f9.ts.net:9450` (unchanged) | own origin (unchanged) |
| `NEXT_PUBLIC_DISABLE_DEV_LOGIN_BAR` | — | **unset** (bar visible) | **unset** |
| `NEXT_PUBLIC_SENTRY_ENV` | — | `staging` | `staging` |
| Sentry `environment` | via `NODE_ENV=staging` (existing init) | `NEXT_PUBLIC_SENTRY_ENV` | `NEXT_PUBLIC_SENTRY_ENV` |
| `UNIFONIC_APP_SID` | empty (graceful: OTP logged to journalctl) | — | — |
| `UNIFONIC_SENDER_ID` | empty until Abdullah provides | — | — |
| `SSL_MODE`, `WS_REDIS_ADAPTER`, `REDIS_*`, `SENTRY_DSN` | unchanged current values | `NEXT_PUBLIC_SENTRY_DSN` unchanged | unchanged |

## 🔴 PRODUCTION (Vercel ×2 + Render + Neon — branch `main`)

| Var | Render API (`srv-dadabif10e5c73e207bg`) | Vercel PWA (`kora-link-player-pwa`) | Vercel Admin (`kora-link-admin`) |
|---|---|---|---|
| Branch | `main` | `main` | `main` |
| `NODE_ENV` | `production` (set explicitly — make the implicit default a contract) | build-forced | build-forced |
| `DATABASE_URL` | Neon (`ep-snowy-river…neon.tech`, unchanged) | — | — |
| `DEV_LOGIN_ENABLED` | `true` today → **`false` at OTP wiring** (01-product Q4, risk F3 documented) | — | — |
| `PLAYER_URL` | `https://kora-link-player-pwa.vercel.app` (**ONLY**) | — | — |
| `ADMIN_URL` | `https://kora-link-admin.vercel.app` (**ONLY**) | — | — |
| CORS effect | allows ONLY Vercel prod origins | — | — |
| `NEXT_PUBLIC_API_URL` | — | `https://koralink-api.onrender.com/api/v1` | `https://koralink-api.onrender.com/api/v1` |
| `NEXT_PUBLIC_APP_URL` | — | `https://kora-link-player-pwa.vercel.app` | `https://kora-link-admin.vercel.app` |
| `NEXT_PUBLIC_DISABLE_DEV_LOGIN_BAR` | — | `true` (REQUIRED — tree-shakes bar, Strix P0-7) | `true` (harmless; admin has no dev-login UI) |
| `NEXT_PUBLIC_SENTRY_ENV` | — | `production` | `production` |
| Sentry `environment` | via `NODE_ENV=production` | `NEXT_PUBLIC_SENTRY_ENV` | `NEXT_PUBLIC_SENTRY_ENV` |
| `UNIFONIC_APP_SID` | empty until Abdullah provides → then via Render env-var API, then flip `DEV_LOGIN_ENABLED=false` | — | — |
| `UNIFONIC_SENDER_ID` | `KoraLink` (exists in `.deploy-tokens` as `KL_API_UNIFONIC_SENDER_ID`, MISSING on Render — add) | — | — |
| `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN` | `…` | `…` | `…` |
| `WALLET_TOPUP_ENABLED`, `SSL_MODE` | current Render values | — | — |

## Copy-paste — staging VPS `apps/api/.env` deltas

```bash
NODE_ENV=staging
PLAYER_URL=http://localhost:3000,http://100.93.99.24:3000,https://aa.tail2948f9.ts.net:9450,https://aa.tail2948f9.ts.net:10000
ADMIN_URL=http://localhost:3002,http://100.93.99.24:3002,https://aa.tail2948f9.ts.net
```

## Copy-paste — production

**Render API** (apply via Render env-var API; secrets unchanged):
```bash
NODE_ENV=production
PLAYER_URL=https://kora-link-player-pwa.vercel.app
ADMIN_URL=https://kora-link-admin.vercel.app
UNIFONIC_SENDER_ID=KoraLink
# DEV_LOGIN_ENABLED stays true (interim, 01-product Q4) → false at OTP wiring
# UNIFONIC_APP_SID=<from Abdullah> → then flip DEV_LOGIN_ENABLED=false
```

**Vercel** (Abdullah's dashboard step; agent verifies baked JS post-deploy):
```bash
# project kora-link-player-pwa:
NEXT_PUBLIC_API_URL=https://koralink-api.onrender.com/api/v1
NEXT_PUBLIC_APP_URL=https://kora-link-player-pwa.vercel.app
NEXT_PUBLIC_DISABLE_DEV_LOGIN_BAR=true
NEXT_PUBLIC_SENTRY_ENV=production
# project kora-link-admin:
NEXT_PUBLIC_API_URL=https://koralink-api.onrender.com/api/v1
NEXT_PUBLIC_DISABLE_DEV_LOGIN_BAR=true
NEXT_PUBLIC_SENTRY_ENV=production
# NEXT_PUBLIC_* bake at build → trigger a redeploy on BOTH projects after saving
```
