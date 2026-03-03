# KoraLink API — Technical Considerations

Architecture decisions, security model, infrastructure requirements, database design, migration workflow, observability, and known gaps for engineers deploying or extending the KoraLink backend.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Security Model](#2-security-model)
   - [JWT in HttpOnly Cookies](#jwt-in-httponly-cookies)
   - [CORS Whitelist](#cors-whitelist)
   - [HTTP Security Headers (Helmet)](#http-security-headers-helmet)
   - [Rate Limiting](#rate-limiting)
   - [Input Validation](#input-validation)
   - [WebSocket Origin & Auth](#websocket-origin--auth)
   - [Database Credentials](#database-credentials)
3. [Environment Variables](#3-environment-variables)
4. [Database Design](#4-database-design)
   - [Schema Overview](#schema-overview)
   - [PostGIS Geography Columns](#postgis-geography-columns)
   - [GiST Indexes (Critical)](#gist-indexes-critical)
   - [Enums](#enums)
5. [Migration Strategy](#5-migration-strategy)
6. [ORM — Drizzle](#6-orm--drizzle)
   - [The updated_at Rule](#the-updated_at-rule)
7. [Caching (Redis)](#7-caching-redis)
8. [Structured Logging (Pino)](#8-structured-logging-pino)
9. [WebSocket Gateway](#9-websocket-gateway)
10. [OTP & SMS (Unifonic)](#10-otp--sms-unifonic)
11. [Wallet Ledger](#11-wallet-ledger)
12. [Docker & Container Deployment](#12-docker--container-deployment)
13. [Performance Considerations](#13-performance-considerations)
14. [Known Gaps & Future Work](#14-known-gaps--future-work)

---

## 1. Architecture Overview

```
┌────────────────────────────────────────────────────────┐
│                   KoraLink Backend (NestJS)             │
│                                                        │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌───────┐  │
│  │  Auth    │  │ Matches  │  │  Wallet  │  │Health │  │
│  │ Module   │  │  Module  │  │  Module  │  │Module │  │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └───────┘  │
│       │              │              │                    │
│  ┌────▼──────────────▼──────────────▼────────────────┐  │
│  │         DatabaseModule (Drizzle / postgres.js)     │  │
│  └───────────────────────────────────────────────────┘  │
│                                                        │
│  ┌──────────────────────────────────┐                   │
│  │  GatewayModule (Socket.IO /lobby)│                   │
│  └──────────────────────────────────┘                   │
└────────────────────────────────────────────────────────┘
       │ HTTP/REST                 │ WebSocket
       ▼                           ▼
 React / Next.js              React / Next.js
 Player App (:3000)           Player App (:3000)
 Admin App  (:3002)           Admin App  (:3002)
```

**Technology stack**

| Layer           | Technology                        |
|-----------------|-----------------------------------|
| Runtime         | Node.js 20 (LTS)                  |
| Framework       | NestJS 10                         |
| ORM             | Drizzle ORM + postgres.js driver  |
| Database        | PostgreSQL 15 + PostGIS 3         |
| Cache           | Redis 7                           |
| Auth            | Passport JWT (HttpOnly cookie)    |
| WebSocket       | Socket.IO (NestJS adapter)        |
| SMS / OTP       | Unifonic REST API                 |
| HTTP security   | Helmet + NestJS ThrottlerModule   |
| Logging         | nestjs-pino (JSON, OCI-ready)     |
| Container       | Docker (multi-stage, Alpine)      |
| API docs        | Swagger / OpenAPI 3               |

---

## 2. Security Model

### JWT in HttpOnly Cookies

The JWT is set **exclusively** as an `HttpOnly; Secure; SameSite=Strict` cookie. It is never returned in the response body. This eliminates the most common XSS token-theft vector — a script injected into the page cannot read `HttpOnly` cookies via `document.cookie`.

```
Set-Cookie: access_token=<jwt>; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=604800
```

- **`Secure`**: only transmitted over HTTPS, enforced when `NODE_ENV=production`.
- **`SameSite=Strict`**: the browser will not include this cookie in any cross-site request, mitigating CSRF without a separate CSRF token.
- Token lifetime: **7 days** (configured via `JWT_EXPIRY`).

> **Security trade-off**: A 7-day token lifetime means a stolen cookie remains valid for up to 7 days. For higher-security deployments, consider a shorter-lived access token (e.g. `15m`) paired with a long-lived `refresh_token` HttpOnly cookie. Refresh token rotation would also allow instant revocation. This is tracked in [Known Gaps](#14-known-gaps--future-work).

> **Action required before go-live**: Replace the `JWT_SECRET` and `COOKIE_SECRET` placeholder values with cryptographically strong random strings (minimum 32 characters). Use `openssl rand -hex 32` to generate them.

---

### CORS Whitelist

Only two registered frontend origins can call the API:

```typescript
origin: [playerUrl, adminUrl],
credentials: true,
methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
allowedHeaders: ['Content-Type', 'Accept'],
```

Any request from an unlisted origin is rejected at the CORS preflight stage. Wildcard `*` origins are not permitted because `credentials: true` requires explicit origin values.

The same whitelist is re-checked inside the WebSocket gateway `handleConnection` hook.

---

### HTTP Security Headers (Helmet)

`helmet()` is applied as the first middleware in `main.ts`. It sets:

| Header                     | Effect                                     |
|----------------------------|--------------------------------------------|
| `X-Content-Type-Options`   | Prevents MIME type sniffing                |
| `X-Frame-Options`          | Blocks clickjacking via iframes            |
| `X-XSS-Protection`         | Legacy browser XSS filter — deprecated in modern browsers and can introduce XSS vulnerabilities in IE; included by Helmet for broad compatibility only |
| `Strict-Transport-Security`| Enforces HTTPS (production only)           |
| `Content-Security-Policy`  | Restricts resource loading origins         |
| `Referrer-Policy`          | Limits referrer header leakage             |

---

### Rate Limiting

`ThrottlerModule` enforces a default limit of **60 requests per 60 seconds** per IP address globally. Exceeding this returns `429 Too Many Requests`.

```typescript
throttlers: [{ ttl: 60_000, limit: 60 }]
```

This prevents OTP brute-force and data scraping. The OTP endpoint is the highest-risk surface — consider applying a tighter per-route limit:

```typescript
// auth.controller.ts
@Throttle({ default: { ttl: 300_000, limit: 5 } })
@Post('send-otp')
```

---

### Input Validation

`ValidationPipe` is applied globally with three critical options:

```typescript
{
  whitelist: true,            // strips properties not declared in the DTO
  forbidNonWhitelisted: true, // rejects requests that contain extra properties
  transform: true,            // coerces query-string params to declared types
}
```

`whitelist: true` ensures that even if a client sends `role: 'Admin'` on a profile update, that field is stripped before it reaches the service layer — it can never be accidentally persisted.

---

### WebSocket Origin & Auth

The Socket.IO gateway performs two checks on every new connection:

1. **Origin check** — compares `handshake.headers.origin` against `PLAYER_URL` and `ADMIN_URL`. Unknown origins trigger `client.disconnect(true)`.
2. **JWT verification** — reads the token from `handshake.auth.token` (mobile / React Native) or parses it from the `access_token` cookie string (browser). Invalid or missing tokens trigger `client.disconnect(true)`.

---

### Database Credentials

- `DATABASE_URL` must not be committed to source control. Inject it at runtime from a secrets manager (OCI Vault, AWS Secrets Manager, Doppler, etc.).
- For OCI Autonomous Database or any managed Postgres that requires TLS, set `SSL_MODE=require`. The `DatabaseModule` passes `ssl: 'require'` to the postgres.js client in that case.

---

## 3. Environment Variables

All variables are read from `.env` or injected at container start. See `apps/api/.env.example` for the complete list.

| Variable                 | Required      | Default                  | Description                                              |
|--------------------------|---------------|--------------------------|----------------------------------------------------------|
| `NODE_ENV`               | yes           | `development`            | Controls TLS, log level, cookie `Secure` flag            |
| `PORT`                   | no            | `3001`                   | HTTP listen port                                         |
| `DATABASE_URL`           | yes           | —                        | PostgreSQL connection string                             |
| `SSL_MODE`               | no            | `false`                  | Set `require` for OCI / cloud Postgres over TLS          |
| `JWT_SECRET`             | yes           | `fallback-dev-secret`    | **Change in production** — HMAC key for JWT signing      |
| `JWT_EXPIRY`             | no            | `7d`                     | Token lifetime (`7d`, `24h`, etc.)                       |
| `COOKIE_SECRET`          | yes           | `change-me`              | **Change in production** — signs signed cookies          |
| `PLAYER_URL`             | yes           | `http://localhost:3000`  | Allowed CORS origin for the player app                   |
| `ADMIN_URL`              | yes           | `http://localhost:3002`  | Allowed CORS origin for the admin app                    |
| `REDIS_HOST`             | yes           | `localhost`              | Redis hostname                                           |
| `REDIS_PORT`             | no            | `6379`                   | Redis port                                               |
| `REDIS_PASSWORD`         | no            | —                        | Redis AUTH password                                      |
| `UNIFONIC_APP_SID`       | yes (prod)    | —                        | Unifonic account SID — SMS skipped if absent             |
| `UNIFONIC_SENDER_ID`     | no            | `KoraLink`               | SMS sender ID shown on the recipient's handset           |
| `MOYASAR_SECRET_KEY`     | yes (prod)    | —                        | Moyasar payment secret (wallet top-up)                   |
| `MOYASAR_PUBLISHABLE_KEY`| yes (prod)    | —                        | Moyasar publishable key (frontend checkout widget)       |

---

## 4. Database Design

### Schema Overview

```
users
  ├── venues          (owner_id → users.id  CASCADE DELETE)
  │     └── pitches   (venue_id → venues.id CASCADE DELETE)
  │           └── matches  (pitch_id → pitches.id, host_id → users.id)
  │                 ├── match_players  (match_id, user_id  CASCADE DELETE)
  │                 └── match_messages (match_id, user_id  CASCADE DELETE)
  └── transactions    (user_id → users.id   CASCADE DELETE)
```

**Key design decisions**

- **UUIDs** (`varchar(36)`) are used as primary keys everywhere, generated in application code via `crypto.randomUUID()`. This is distribution-safe and removes the need for a PostgreSQL sequence.
- **`wallet_balance`** is `numeric(12, 2)` — exact decimal arithmetic — to avoid floating-point rounding errors on currency amounts.
- **Location columns** (`match.location`, `venue.location`) are `geography(Point, 4326)` (the PostGIS native type) rather than two separate `lat`/`lng` float columns. This enables `ST_DWithin` to exploit a GiST index and compute great-circle distances correctly.
- **`transactions`** is an append-only ledger. Rows are never updated or deleted. The `idempotency_key` unique constraint prevents duplicate charges from retried payment webhooks.

---

### PostGIS Geography Columns

The `geography(Point, 4326)` column type is declared via a Drizzle `customType` in `schema.ts`. Drizzle treats the value as an opaque string.

When inserting or updating a location from application code, produce a WKT value using a SQL fragment:

```sql
ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography
```

The discovery feed query in `MatchesService.findNearby` builds this via the Drizzle `sql` template tag. Every parameter is a bound placeholder — there is no SQL injection risk.

---

### GiST Indexes (Critical)

Drizzle Kit cannot auto-generate GiST indexes from the TypeScript schema. The TypeScript `index()` helper only produces B-Tree indexes.

The file `apps/api/drizzle/gist_indexes.sql` contains the two required GiST indexes:

```sql
CREATE INDEX IF NOT EXISTS matches_location_gist_idx ON matches USING GIST (location);
CREATE INDEX IF NOT EXISTS venues_location_gist_idx  ON venues  USING GIST (location);
```

**Apply this file on every new database before production traffic starts:**

```bash
psql "$DATABASE_URL" -f apps/api/drizzle/gist_indexes.sql
```

Without GiST indexes, `ST_DWithin` performs a sequential scan of the entire `matches` table on every discovery-feed request. At 10 000 rows this is unnoticeable; at 1 000 000 rows it becomes a multi-second query that blocks the event loop.

---

### Enums

All PostgreSQL enum type names match the original Prisma schema so existing database enums are reused without a migration:

| Enum type name      | Values                                                          |
|---------------------|-----------------------------------------------------------------|
| `SkillLevel`        | `Beginner`, `Intermediate`, `Advanced`                          |
| `UserRole`          | `Player`, `VenueOwner`, `Admin`                                 |
| `PitchSize`         | `5v5`, `7v7`, `8v8`, `11v11`                                    |
| `SurfaceType`       | `Grass`, `Artificial`                                           |
| `Environment`       | `Indoor`, `Outdoor`                                             |
| `MatchType`         | `Casual`, `Competitive`                                         |
| `GenderRule`        | `Men Only`, `Women Only`, `Mixed`                               |
| `MatchStatus`       | `Open`, `Full`, `InProgress`, `Completed`, `Cancelled`          |
| `TransactionType`   | `CREDIT`, `DEBIT`                                               |
| `ReferenceType`     | `MATCH_FEE`, `TOPUP`, `REFUND`, `PRIZE`                         |
| `TransactionStatus` | `Pending`, `Completed`, `Failed`, `Reversed`                    |
| `Team`              | `Home`, `Away`                                                  |

Adding a new enum value requires an `ALTER TYPE … ADD VALUE` migration; renaming or removing values requires more complex multi-step migrations.

---

## 5. Migration Strategy

**Never use `db:push` in production.** It compares the TypeScript schema to the live database and applies changes non-transactionally. If the schema drifts, it can silently drop and recreate columns, destroying production data.

The correct workflow is:

```bash
# 1. Edit src/database/schema.ts

# 2. Generate a SQL migration file from the diff
npm run db:generate
# Creates a timestamped .sql file in ./drizzle/

# 3. Review the generated file carefully.
#    If new geography columns were added, append the relevant GiST index
#    statements from drizzle/gist_indexes.sql to the generated migration.

# 4. Apply the migration
npm run db:migrate
```

The `./drizzle` directory is committed to version control so every migration has an auditable, reproducible history.

---

## 6. ORM — Drizzle

Drizzle ORM with the postgres.js driver is used instead of Prisma to:

- Reduce the container memory footprint (no query engine binary).
- Allow raw PostGIS function calls inline with the query builder via the `sql` template tag.
- Enable parameterised raw SQL without sacrificing type safety.

The database connection is provided by the global `DatabaseModule` as the NestJS injection token `'DB_CONNECTION'`. Every service injects it as:

```typescript
constructor(@Inject('DB_CONNECTION') private readonly db: DB) {}
// where DB = PostgresJsDatabase<typeof schema>
```

---

### The `updated_at` Rule

Drizzle does **not** automatically set `updated_at` on every `UPDATE` statement (unlike Prisma's `@updatedAt` attribute). The schema declares `.$onUpdateFn(() => new Date())` but this fires only when the column is explicitly included in the `.set()` payload — it does not inject itself silently.

**Always use `withTimestamp()` for every row update:**

```typescript
import { withTimestamp } from '../../common/utils/timestamp';

await db.update(users)
  .set(withTimestamp({ full_name: dto.full_name }))
  .where(eq(users.id, userId));
```

The helper is defined in `src/common/utils/timestamp.ts` and merges `updated_at: new Date()` into any payload object, including those containing Drizzle `sql` template tag expressions.

---

## 7. Caching (Redis)

`CacheModule` is registered globally with a 60-second TTL backed by Redis:

```typescript
CacheModule.registerAsync({
  isGlobal: true,
  useFactory: (config) => ({
    store: 'redis',
    host: config.get('REDIS_HOST', 'localhost'),
    port: config.get<number>('REDIS_PORT', 6379),
    password: config.get('REDIS_PASSWORD', ''),
    ttl: 60,
  }),
})
```

`GET /api/v1/matches` uses `@CacheInterceptor` with `@CacheTTL(60)`. The cache key is automatically derived from the full request URL including query parameters. Discovery feed results for the same coordinates and filters are served from Redis without a database round-trip for 60 seconds.

**Redis is a hard runtime dependency.** If the Redis connection fails at startup, the NestJS application will not boot. In local development:

```bash
docker run -d -p 6379:6379 redis:7-alpine
```

---

## 8. Structured Logging (Pino)

`nestjs-pino` is the application logger. In **development** it emits colourised human-readable output via `pino-pretty`. In **production** it emits newline-delimited JSON:

```json
{"level":"info","time":1723740000000,"pid":1,"req":{"method":"GET","url":"/api/v1/matches?lat=24.71&lng=46.67"},"res":{"statusCode":200},"responseTime":18}
```

This format is natively ingested by OCI Logging, Datadog, Grafana Loki, and AWS CloudWatch without a custom parser.

Avoid using `console.log` in application code. Any direct `console.log` calls in the gateway or elsewhere should be replaced with the NestJS `Logger` service so log output is structured and routed through Pino.

---

## 9. WebSocket Gateway

The Socket.IO server shares the same HTTP port as the REST API. NestJS bridges the two servers automatically via the platform adapter.

**Namespace**: `/lobby`

**Authentication flow on connect:**
1. Read `handshake.auth.token` (mobile clients) or parse `access_token` from the cookie string.
2. Call `JwtService.verify()` with `JWT_SECRET`.
3. Store `payload.sub` as `client.userId`.
4. On any failure: `client.disconnect(true)`.

**Room convention**: each match room is named `match:<matchId>`. Players join by emitting `join-lobby`. All broadcasts (`new-message`, `roster-update`) are sent to `server.to('match:<matchId>')`.

**Horizontal scaling**: Socket.IO rooms are in-memory per Node.js process. When running multiple API replicas, a Redis pub/sub adapter must be added so that a message sent on replica A is broadcast by all replicas:

```bash
npm install @socket.io/redis-adapter
```

This is not yet configured — see [Known Gaps](#14-known-gaps--future-work).

---

## 10. OTP & SMS (Unifonic)

`UnifonicService` wraps the Unifonic REST SMS API and is used exclusively by `AuthService.sendOtp()`.

- If `UNIFONIC_APP_SID` is empty (local / CI), the SMS send is skipped and a warning with the OTP code is logged to `stdout`. This avoids spending SMS credits during development.
- In production, the `KoraLink` sender ID must be pre-approved by the Saudi CITC before it appears on recipients' handsets.
- OTP codes are 6 digits and expire after **5 minutes**.

> **Security note**: The current implementation generates codes with `Math.floor(100000 + Math.random() * 900000)`. `Math.random()` is not cryptographically secure. Before go-live, replace it with `crypto.randomInt(100000, 1000000)` (Node.js built-in) which uses the OS CSPRNG.

**Current implementation**: codes are stored in an in-memory `Map` (`otpStore`). This means:
- OTPs do not survive a server restart.
- Running two API replicas produces two independent stores — a code sent by replica A cannot be verified by replica B.

> **Critical before go-live**: Replace `otpStore` with a Redis `SETEX` call (300-second TTL). This makes OTP storage durable and shared across all replicas.

---

## 11. Wallet Ledger

`WalletService` implements an append-only ledger:

1. Every credit or debit inserts a new `transactions` row — rows are never updated or deleted.
2. `wallet_balance` on `users` is updated atomically inside `db.transaction()`.
3. The `idempotency_key` unique constraint ensures a retried payment webhook cannot double-charge the user — the second identical request throws `409 Conflict`.
4. A DEBIT that would push the balance below zero is detected after the UPDATE and the transaction is rolled back, returning `400 Bad Request`.

REST endpoints for the wallet are not yet wired up — the service layer is complete and ready for controller exposure.

---

## 12. Docker & Container Deployment

The multi-stage `Dockerfile` produces a minimal production image:

| Stage     | Base image       | Purpose                                  |
|-----------|------------------|------------------------------------------|
| `builder` | `node:20-alpine` | Install all deps, compile TypeScript     |
| `runner`  | `node:20-alpine` | Copy `dist/`, install prod deps only     |

Security hardening applied in the image:
- Runs as a **non-root user** (`nestjs`, UID 1001).
- `npm ci --ignore-scripts` prevents supply-chain attacks via postinstall scripts.
- Only production `node_modules` are present in the final image.

**Docker HEALTHCHECK** calls `GET /api/v1/health` every 30 seconds. The container is marked unhealthy after 3 consecutive failures.

**Build and run:**

```bash
# Build
docker build -t koralink-api:latest apps/api/

# Run
docker run -d \
  --env-file apps/api/.env \
  -p 3001:3001 \
  koralink-api:latest
```

---

## 13. Performance Considerations

| Concern                    | Current mitigation                                    | Recommended action                                         |
|----------------------------|-------------------------------------------------------|------------------------------------------------------------|
| Discovery feed query speed | Redis 60 s cache; GiST index SQL provided             | Apply `gist_indexes.sql` before first production write     |
| OTP store                  | In-memory Map (single replica only)                   | Replace with Redis `SETEX` (5 min TTL)                     |
| WebSocket fan-out          | In-process Socket.IO rooms (single replica)           | Add `@socket.io/redis-adapter` for multi-instance deploys  |
| DB connection pooling      | postgres.js default pool (10 connections)             | Set `max` to match server capacity; monitor with pg_stat   |
| Discovery feed page size   | Hard-coded `LIMIT 50`                                 | Add `page`/`perPage` query params as traffic grows         |
| Cache invalidation         | Time-based TTL only (60 s)                            | Add event-driven invalidation when match status changes    |
| OTP brute-force            | Global 60 req/min throttle                            | Add per-route `@Throttle` on `send-otp` (5 req / 5 min)   |

---

## 14. Known Gaps & Future Work

| Gap                                    | Location                                      | Priority |
|----------------------------------------|-----------------------------------------------|----------|
| In-memory OTP store (not multi-replica)| `auth.service.ts` — `otpStore` Map            | High     |
| No logout endpoint                     | `auth.controller.ts`                          | Medium   |
| Wallet REST endpoints not exposed      | `wallet.service.ts` exists; no controller yet | Medium   |
| No match join / leave endpoints        | `matches.service.ts`                          | Medium   |
| Socket.IO Redis adapter missing        | `gateway.module.ts`                           | Medium (only blocks horizontal scaling) |
| `console.log` in `handleDisconnect`    | `app.gateway.ts:84`                           | Low      |
| Moyasar payment integration            | Env vars defined; service not implemented     | Medium   |
| GiST indexes not in auto-migration     | `drizzle/gist_indexes.sql` — manual step      | High (apply before first deploy) |
| OTP-specific rate limit                | Global throttle exists; OTP needs tighter cap | Medium   |
| Admin role guard                       | `UserRole.Admin` enum exists; no guard yet    | Medium   |
