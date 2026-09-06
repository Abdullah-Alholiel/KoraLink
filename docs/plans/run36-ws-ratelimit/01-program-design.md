# Run #36 — WS chat rate limiting (P1-42) — Program Design (Gates 1–3 compact)

## Problem
`send-message` (app.gateway.ts:225) and `send-dm` (:377) accept unlimited message volume and
unbounded content length from any authenticated member. REST paths cap at 2000 chars and are
throttled; WS is a flood/spam vector (Reviewer A run #36: CRITICAL; board P1-42).

## User story
As a player in a match lobby or DM, I want chat to stay responsive and spam-free, so that one
misbehaving client cannot flood the room or degrade the API for everyone.

## Scope
IN: per-socket sliding-window rate limit on the two send handlers; 2000-char content cap
(parity with REST `@MaxLength(2000)`); helpful `WsException` messages the PWA already renders
as send-failure states. Tests for limiter + handlers.
OUT: @nestjs/throttler adoption; DM-conversation-level quotas; persistence of violations
(counters are in-memory by design — a restart resets them; acceptable for flood control);
PWA changes (existing per-message error states already cover a rejected send).

## Architecture delta
New file `apps/api/src/modules/gateway/rate-limit.service.ts`:
- `WsRateLimitService`, `@Injectable()`, provided in `gateway.module.ts`.
- API: `consume(key: string): { allowed: boolean; retryAfterSec: number }` — sliding window,
  in-memory `Map<string, number[]>` of timestamps, pruned per call.
- Two independent buckets keyed `msg:<socketId>` and `dm:<socketId>` — per-socket per-channel,
  so one busy lobby can't consume a user's DM budget (or vice versa).
- Limits (const, documented): 10 msgs / 10s window (healthy human chat peaks ~2-3/s briefly;
  10/10s is generous for real use, brutal for a flood loop).
- `onModuleDestroy` clears the map; per-entry cleanup piggybacks on access (bounded memory;
  sockets are also bounded by `handleConnection` auth).
- Bind to `socket.id` (per-connection, not per-user): a reconnecting flooder gets a fresh
  bucket, but each connection is re-authenticated at handshake (moderation guard) and every
  reconnect costs a full handshake — flood loop via reconnect is slow and visible in logs.
  Cross-connection per-user budgets are a follow-up if abuse is observed (recorded in plan).

Gateway changes (app.gateway.ts):
- `handleMessage`: after membership check → length check (`content.length > 2000` →
  WsException 'Message is too long (max 2000 characters).') → `consume('msg:'+client.id)`
  → not allowed → WsException \`Rate limit exceeded. Try again in ${retryAfterSec}s.\`
- `handleDm`: same order, key `dm:` + same length cap (parity with conversations REST DTO).

## Contract (Gate 3)
- No endpoint JSON shapes change. No DB changes. No new env vars.
- Handler signatures unchanged; both still `Promise<void>` and throw `WsException` on rejection
  (PWA ChatSheet/message UIs already surface thrown WS errors as failed-send states).
- New TS surface: `class WsRateLimitService { consume(key: string): { allowed: boolean; retryAfterSec: number } }`.

## i18n
None (WS error strings are English like all existing WsException messages in this gateway —
e.g. 'You are not a member of this match.'; PWA maps send failures to localized generic copy).

## Contract verification checklist
- [x] No mutation contract touched (no endpoint responses change).
- [x] No frontend type consumes new fields (throw-path only).
- [x] No i18n keys needed (no new user-facing UI strings).
- [x] Limiter cannot throw (pure Map math) — handlers keep their existing error behavior.
- [x] Both send handlers covered: match lobby + DM.
- [x] REST/WS parity documented: 2000-char cap both paths; throttle WS-side added.

## Tests (RED→GREEN)
1. Limiter: allows up to 10 in window; 11th rejected with retryAfterSec>0; window slides
   (old timestamps pruned → allowed again); independent buckets per key.
2. handleMessage: >2000 chars → WsException 'too long'; 11th msg in 10s → WsException rate limit;
   under-limit messages pass through (membership check still enforced).
3. handleDm: same three cases.
