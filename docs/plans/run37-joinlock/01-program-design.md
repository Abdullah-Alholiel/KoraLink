# Run 37 — Program Design (compact Gates 1-3)

## Item 1 — joinMatch/leaveMatch/removePlayer row locks (P2-49 final sub-class)

**Problem:** concurrent joins overbook (count-then-insert race); concurrent leave/remove can
race the status flips. No user-facing symptom until a match shows 11/10 or a Full match stays
Open with a full roster.

**User story:** As a player, I can never join a "full" match, and the roster count I see always
matches reality, even when many players tap Join at once.

**Scope IN:** `FOR UPDATE` on the matches row as the FIRST lock statement of joinMatch,
leaveMatch, removePlayer txs (same order as cancelMatch → no lock-order cycles; reschedule
locks slots AFTER its match read, join/leave/remove never touch pitch_slots → no cross cycle).
**Scope OUT:** serializable isolation, Redis counters, leaveMatch flip logic changes.

**Architecture delta (exact):**
- `joinMatch` — existing match select (matches.service.ts:952-960) gains `.for('update')`:
  `SELECT id, status, max_players FROM matches WHERE id = $1 LIMIT 1 FOR UPDATE`.
- `leaveMatch` — new first statement inside tx:
  `SELECT id FROM matches WHERE id = ${matchId}::text FOR UPDATE` (raw sql``; keeps the
  membership-first error semantics — a leave on an unknown match still throws
  "You are not a member of this match.").
- `removePlayer` — existing match select gains `.for('update')`.

**Contract verification:**
- [x] No API JSON shape changes — mutations still return `this.findOne(matchId)` outside tx.
- [x] No new columns/migrations. `::text` cast on the raw lock (varchar(36) rule).
- [x] Specs assert the lock: PgDialect-asserted `for update` in the emitted SQL (join, leave,
  remove) + stub chains extended with `.for()` passthrough so existing specs still run.
- [x] Deadlock ordering: matches-row-first everywhere; documented in code comments.

## Item 2 — WS rate-limiter eviction on disconnect

**Problem:** `hits` Map grows unbounded; every socket that ever sent a message leaks its bucket.

**User story:** As the operator, the API's memory stays flat under chatty-socket churn.

**Scope IN:** `WsRateLimitService.release(socketId)` — deletes `msg:<id>` + `dm:<id>`;
`handleDisconnect` calls it. Honest doc note: per-socket budget means a reconnect-refiller still
gets a fresh 10/10s per handshake (~1 msg/s sustained with reconnects) — the handshake cost is
the deterrent, the Map no longer leaks.
**Scope OUT:** per-user cross-socket budgets, Redis, reconnect backoff (would be a new item).

**TS signature:** `release(socketId: string): void` (pure Map deletes, never throws).

## Observability
No new events needed; disconnect already logs (`app.gateway.ts:188`). Limiter stays invisible
to users (WsException path unchanged from P1-42).

## i18n
No user-facing strings (API-internal concurrency + lifecycle).

## Gate table
| Gate | Status |
|---|---|
| 0 retro | ✅ 00-retro.md |
| 1-3 design | ✅ this doc |
| 4 slices | slice 1 = locks (+specs), slice 2 = eviction (+specs) — build+jest green per slice |
