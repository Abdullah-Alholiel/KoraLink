# Run #27 — Program Design (compact, autonomous)

Picks: **P1-17c** (WS origin), **P1-17d** (ICS escape), **P2-19** (per-IP daily OTP cap), **P2-32** (foreign pitchId 404).
Deferred: P0-5 per-category push prefs → run #28 (with install-triggered push); email infra → separate cycle.

---

## A — Product Spec

### A.1 P1-17c WS origin allowlist
- **Problem**: `app.gateway.ts:83-96` allows WS connections from any origin in dev (`isProd` gate). Strix finding (run #25) — a tailnet peer can establish a WebSocket against the API cookie'd, even if the origin is unlisted. Auth still applies (JWT) but the attack surface widens.
- **User story**: As a platform operator, I want WS connections restricted to the configured PLAYER_URL + ADMIN_URL origins in every environment.
- **Success criteria**: `curl -H "Origin: https://attacker.example" -H "Cookie: ..."` against the WS endpoint → connection refused. Existing PLAYER_URL/ADMIN_URL connections still work.
- **Scope IN**: drop the `isProd` gate, always disconnect on unlisted origin.
- **Scope OUT**: no new env-var shape, no WS protocol change.

### A.2 P1-17d ICS TEXT escape
- **Problem**: `matches.controller.ts:98,101,102` interpolates `match.title` (host input) and venue fields raw into the .ics VEVENT. A CRLF-laden title creates a second VEVENT with attacker-controlled SUMMARY + alarm. Strix LOW (CVSS 3.5).
- **User story**: As a host, I want my .ics export to always contain exactly one event with my title — even if the title contains punctuation.
- **Success criteria**: title `Test\r\nX-EVIL:1` produces exactly one VEVENT with `SUMMARY:Test X-EVIL:1` (CRLF removed, no second event).
- **Scope IN**: `escapeIcsText()` helper; apply to title/location/description; regression spec using ical.js to assert exactly one event.
- **Scope OUT**: no new endpoint, no DTSTAMP changes.

### A.3 P2-19 per-IP daily OTP cap
- **Problem**: `auth.controller.ts:send-otp` has `@Throttle({ default: { ttl: 60_000, limit: 3 } })` (per-IP, per-minute). No per-IP DAILY cap — a script can hammer 3/min indefinitely. Run #22 deferred this until the counter store decision (Redis vs DB).
- **User story**: As a platform operator, I want a per-IP daily cap (e.g. 50 SMS/day/IP) so that a single compromised source cannot drain the SMS budget.
- **Success criteria**: 50 successful send-otps from one IP in 24h returns 429 on the 51st. Per-phone daily cap (10) still applies (existing).
- **Scope IN**: extend `OtpStoreService` with `incrementIpDaily()` + `getIpDailyCount()`; gate in `auth.service.ts:sendOtp` BEFORE the per-phone check; `429 "Daily IP SMS limit reached"`.
- **Scope OUT**: no global cap, no admin bypass.

### A.4 P2-32 foreign pitchId → 404
- **Problem**: `partner.service.ts:getPartnerMatches` accepts `?pitchId=<valid-but-out-of-scope>` and silently falls through to venue/no filter, indistinguishable from "no such pitch".
- **User story**: As an admin/partner, I want a clear 404 for a pitchId that exists but isn't mine, instead of a silent scope-widening.
- **Success criteria**: `?pitchId=<foreign-but-valid>` → 404 `Pitch not in your scope.`. `?pitchId=<own>` → 200. `?pitchId=<nonexistent>` → 404 `Pitch not found.`.
- **Scope IN**: existence check via `pitches.venueId IN scopedVenueIds`; throw 404 if not in scope; new 404 message.
- **Scope OUT**: no DB column change, no UI change (admin UI already filters client-side).

---

## B — Architecture

### B.1 P1-17c (WS origin)
Single file: `apps/api/src/modules/gateway/app.gateway.ts`
```
before:
  if (isProd) { client.disconnect(true); return; }
  this.logger.warn(`WS connection from unlisted origin "${origin}" allowed (development mode)`);

after:
  if (origin && !allowedOrigins.includes(origin)) {
    this.logger.warn(`WS connection from unlisted origin "${origin}" rejected`);
    client.disconnect(true);
    return;
  }
```
Add 2 jest cases: (1) unlisted origin in dev → disconnect; (2) listed origin in dev → connect. Existing test at `app.gateway.spec.ts` keeps passing.

### B.2 P1-17d (ICS)
- `apps/api/src/common/security/ics-text.ts` (new) — pure function `escapeIcsText(input: string): string` per RFC 5545 §3.3.11: replace `\` `,` `;` `\n` `\r`.
- `apps/api/src/modules/matches/matches.controller.ts:98,101,102` — wrap user-controlled fields.
- `apps/api/src/modules/matches/matches.ics-escape.spec.ts` (new) — use ical.js to parse the generated string, assert exactly one VEVENT.

### B.3 P2-19 (per-IP daily cap)
- `apps/api/src/modules/auth/otp-store.service.ts` — add `keys.ip_day(ip)`, `getIpDailyCount(ip)`, `incrementIpDaily(ip)`, constant `OTP_DAILY_IP_CAP = 50`, `DAY_MS` reuse.
- `apps/api/src/modules/auth/auth.service.ts:sendOtp` — call `incrementIpDaily(ip)` after per-phone daily passes; 429 if `> 50`.
- `apps/api/src/modules/auth/otp-store.service.spec.ts` (extend) — 3 cases (under cap, at cap, race).
- IP source: the `ip` argument already passed to sendOtp (NestJS `@Req().ip` or the existing pipeline).

### B.4 P2-32 (foreign pitchId 404)
- `apps/api/src/modules/partner/partner.service.ts:getPartnerMatches` — after the existing ownership check, add an existence check: `SELECT id FROM pitches WHERE id = ? AND venue_id IN (scopedVenueIds)`. Zero rows = `NotFoundException('Pitch not in your scope.')`. Else proceed.
- `apps/api/src/modules/partner/partner.match-visibility.spec.ts` (extend) — 2 cases: foreign-but-valid 404, own 200.

---

## C — Program Design (contracts)

### C.1 P1-17c

**API surface (unchanged)** — no controller / DTO change. Only `app.gateway.ts` runtime behavior.

**Test contract** (jest):
```typescript
describe('handleConnection origin allowlist', () => {
  it('disconnects on unlisted origin in dev mode', async () => {
    // PLAYER_URL = http://localhost:3000
    // client.handshake.headers.origin = 'https://attacker.example'
    // expect client.disconnect called with true
  });
  it('accepts listed origin in dev mode', async () => {
    // origin = 'http://localhost:3000'
    // expect NO disconnect
  });
});
```

### C.2 P1-17d

**Helper signature**:
```typescript
// apps/api/src/common/security/ics-text.ts
export function escapeIcsText(input: string): string {
  return input
    .replace(/\\/g, '\\\\')   // backslash FIRST
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n/g, '\\n')
    .replace(/[\r\n]/g, '\\n');
}
```

**Endpoint response (unchanged shape)**: `Content-Type: text/calendar; charset=utf-8`, attachment with koralink-match-<id8>.ics.

**Test contract** (jest):
```typescript
describe('getCalendar ics export TEXT escape', () => {
  it('escapes CRLF in title — produces exactly one VEVENT', async () => {
    // title = 'Friday game\r\nSUMMARY:Hijacked'
    // response body parsed by ical.js → exactly one VEVENT, SUMMARY = 'Friday game\\nSUMMARY:Hijacked'
  });
  it('escapes backslash, semicolon, comma', async () => {
    // title = 'A\\B;C,D' → SUMMARY:A\\\\B\\;C\\,D
  });
});
```

### C.3 P2-19

**API surface (unchanged shape)** — same `send-otp` endpoint, new 429 path.

**429 body** (existing throttle format):
```json
{ "statusCode": 429, "message": "Daily SMS limit reached for this IP. Please try again tomorrow." }
```

**Service signature** (added):
```typescript
// apps/api/src/modules/auth/otp-store.service.ts
static readonly DAILY_IP_CAP = 50;
async getIpDailyCount(ip: string): Promise<number>;
async incrementIpDaily(ip: string): Promise<number>;
```

**Test contract** (jest):
```typescript
describe('OtpStoreService per-IP daily cap (P2-19)', () => {
  it('increments per-IP daily count', async () => { ... });
  it('caps at DAILY_IP_CAP (50)', async () => { ... });
  it('isolates phones under the same IP — one phone over daily still blocks', async () => { ... });
});
```

### C.4 P2-32

**API surface change**:
- `GET /partner/matches?pitchId=<id>` now returns `404 Not Found { "message": "Pitch not in your scope." }` for a valid-but-out-of-scope pitchId.
- Previously it returned `200 { matches: [], total: 0, ... }` (silent fall-through).

**Service signature change**:
```typescript
// apps/api/src/modules/partner/partner.service.ts
// getPartnerMatches gains a pitchExistenceCheck step before the existing query.
// Throws NotFoundException with a distinct message for out-of-scope.
```

**Test contract** (jest):
```typescript
describe('getPartnerMatches pitchId scope (P2-32)', () => {
  it('returns 404 for foreign-but-valid pitchId', async () => { ... });
  it('returns 200 for own pitchId', async () => { ... });
  it('returns 404 for nonexistent pitchId', async () => { ... });
});
```

### C.5 Contract verification checklist (Gate 3)

- [x] Every mutation endpoint returns a fully populated object with relations → N/A (no mutations in this run)
- [x] Frontend types can accept the exact JSON the backend produces → unchanged for all 4 items
- [x] Adapter functions exist for every API shape the frontend consumes → unchanged
- [x] No field is silently `undefined` in the frontend that the backend claims to return → unchanged
- [x] i18n keys exist for every user-facing string in both languages → N/A (no user-facing strings added)
