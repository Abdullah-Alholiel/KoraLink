# Run #151 — P2-231 Program Design (Gates 1-3 compact)

## Problem (user story)

As a player in a busy match lobby or DM, typing indicators should stay instant and the
API should not spend a database round-trip on every keystroke-driven signal. Today each
typing event runs the P1-48 moderation gate — one users-table SELECT per event, ~every
2.5s per typing user — pure overhead on a read-feel-only signal.

## Scope

IN: `apps/api/src/modules/gateway/app.gateway.ts` — positive-only 10s TTL cache used by
the TWO typing handlers only; new jest specs; ws-gate tripwire stays green.
OUT: all other gated handlers (messages/DMs/joins/reads keep the uncached gate); no
schema, migration, i18n, or PWA changes; no multi-instance cache sharing (single-process
noted in comment).

## Architecture delta

- `requireActiveUser(userId)` keeps its signature + call-site text (tripwire-pinned) and
  delegates to `requireActiveUserCached(userId, { cacheable: false })`.
- `handleTyping` / `handleConvTyping` swap their gate line to the cached variant
  `requireActiveUserCached(client.userId, { cacheable: true })` at the SAME guard-chain
  position: after `isUuidShape`, BEFORE rate-limit consumption.
- Cache: `Map<string, number>` (userId → expiresAt ms), TTL 10_000ms, positive outcomes
  only; lazy expiry; purge when size > 10_000; no timers.
- Failure modes: negative results (banned/suspended/deleted/missing row) never cached —
  they throw exactly as today and are re-read next event.

## Contract verification checklist (Gate 3)

- [x] Tripwire `ws-gate-coverage.spec.ts` (first-await pin on every gated handler) still
      passes — call-site text of the 8 uncached handlers unchanged; typing handlers keep
      a gate await in the same position (variant name is explicit).
- [x] Moderation-lag tradeoff documented in-code at the cached variant (≤10s typing-only;
      message sends uncached — a banned user's next SEND still throws immediately).
- [x] Cached deny consumes no rate-limit budget; cached allow still consumes the typing
      bucket (guard order preserved) — pinned by spec.
- [x] Positive-only invariant pinned by spec (ban-first never cached; row-flip detection
      on the uncached path).
- [x] No API JSON shape changes → no adapter/hook/i18n contract impact.

## i18n keys

None (no user-facing copy changes; WsException messages unchanged).

## Acceptance criteria

1. jest gateway spec + ws-gate-coverage green with ≥4 new cache specs.
2. turbo build (sequential) zero errors; vitest full suite green (no PWA impact).
3. LIVE E2E (parent, on rebuilt API): `conv-typing` from a participant passes gates; DB
   SELECT count for the gate drops to ≤1 per 10s window on repeated typing events.
