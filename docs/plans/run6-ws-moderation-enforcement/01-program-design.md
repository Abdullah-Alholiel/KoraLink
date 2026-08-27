# Run #6 — Program Design: WS Moderation Enforcement (Gates 1-3 compact)

## Gate 1 — Product spec

**Problem:** A banned or suspended user retains full WebSocket access (match chat, DMs, lobby
join, POTM toasts) until their JWT expires (up to 7 days), because `handleConnection` only
verifies the token signature and never re-reads the user row. Moderation actions only take full
effect on the REST path.

**User story (P1):** As an admin, when I ban/suspend a user, I expect their realtime access to be
revoked immediately on every transport (REST **and** WebSocket), not just REST.

**Scope — IN:** WS connection-time enforcement of ban/suspend + DB-role parity for the `ops` room.
**Scope — OUT:** re-auth on every WS event (connection-time check is sufficient; ban/suspend
already forces a reconnect via the REST 401 → logout flow), DM idempotency (separate item P1-11).

**Success criteria:** a banned user's `handleConnection` disconnects before joining any room; a
suspended user (future `suspended_until`) likewise; a demoted admin's socket does not join `ops`;
an active user still connects and joins `user:<id>` (and `ops` only when DB role is Admin/VenueOwner).

## Gate 2 — Architecture

One-file change in the gateway, mirroring the existing REST strategy. No schema/migration/DTO
changes. Add one jest spec.

- `handleConnection` (app.gateway.ts:98-127): after `jwt.verify`, `SELECT id, role, banned_at,
  suspended_until FROM users WHERE id = payload.sub LIMIT 1`. Reject (disconnect) when: no row,
  `banned_at` set, or `suspended_until` in the future. Set `client.role = user.role` (DB role) and
  join `ops` based on the DB role. Log each rejection via `this.logger.warn` (Pino structured).

## Gate 3 — Contracts (exact shapes)

The `users` row fetched in the gateway:

```ts
const [user] = await this.db
  .select({
    id: users.id,                       // varchar(36)
    role: users.role,                   // 'Player' | 'VenueOwner' | 'Admin'
    banned_at: users.banned_at,         // Date | null
    suspended_until: users.suspended_until, // Date | null
  })
  .from(users)
  .where(eq(users.id, payload.sub))
  .limit(1);
```

Enforcement (mirror jwt-cookie.strategy.ts:64-76 exactly):

```ts
if (!user)      { this.logger.warn(...); client.disconnect(true); return; }
if (user.banned_at) { this.logger.warn(...); client.disconnect(true); return; }
if (user.suspended_until && user.suspended_until.getTime() > Date.now()) {
  this.logger.warn(...); client.disconnect(true); return;
}
client.role = user.role;                          // DB role, not payload.role
if (user.role === 'Admin' || user.role === 'VenueOwner') await client.join('ops');
```

### Contract verification checklist

- [x] No mutation endpoints changed — `findOne(id)` return contract untouched.
- [x] Frontend types unchanged — WS enforcement is server-side; the client already handles the
  REST 401 → logout → socket disconnect on ban (existing NotificationProvider/useMessages flows).
- [x] No new adapter / i18n keys — no user-facing strings added.
- [x] `::text` casts only (no `::uuid`), `eq()` on `users.id` matches varchar(36).
- [x] DB role enum values verified (`schema.ts:41-44`: Player/VenueOwner/Admin).

### Observability (AGENTS.md §4)

- Rejection paths log structured Pino warnings (`this.logger.warn`) with the userId and reason —
  no Sentry/PostHog needed for a connection-enforcement change (no new user-facing event).

## Gate 4 — Vertical slices

- **Slice 1 (tracer bullet):** enforcement in `handleConnection` + jest spec covering the five
  cases (missing user / banned / suspended / demoted role no-ops / happy path). Then build +
  vitest/jest green.
