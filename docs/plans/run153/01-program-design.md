# Run #153 — Program Design (Gates 1-3 compact)

**Item:** P1-53 — WS restore-token replay guard · **P2-238** — completeProfile 23505 race (2nd item, budget permitting)

## Gate 1 — Product spec (problem / user story / scope)
**P1-53.** A user who deleted then restored their account still holds a `purpose:'restore'` JWT
(valid up to 7 days). REST rejects it everywhere (403 "already used… sign in normally"), but the
WebSocket handshake accepts it as a FULL session — chat, DMs, notifications, and (for a staff
account) the ops room. User story: "As a restored account, my leftover restore token must not open
any realtime session." IN: handshake purpose check mirroring REST. OUT: token format changes,
REST strategy changes, client changes.
**P2-238.** Two users claiming the same handle concurrently: the loser gets a raw 500 (23505).
User story: "As a handle claimer who loses a race, I get a clean 'handle taken' 400." IN: 23505
catch → re-select → clean 400. OUT: handle format rules, username suggestions.

## Gate 2 — Architecture (files changed)
- P1-53: `apps/api/src/modules/gateway/app.gateway.ts` (handleConnection, ~line 219 area: add
  purpose check after JWT verify, before/with the deleted_at check).
- P2-238: `apps/api/src/modules/auth/auth.service.ts` (completeProfile: wrap UPDATE in 23505
  catch → re-select → BadRequestException('Handle already taken.')).
- Tests: extend/append jest specs near existing auth/gateway suites.

## Gate 3 — Contracts (exact shapes)
- **P1-53 behavior:** handshake with `payload.purpose === 'restore'` → `client.disconnect(true)` +
  warn log `WS connection rejected: restore token used as session (account <sub>)` — mirroring the
  REST message semantics ("restore token has already been used"). No JSON response shape (socket
  layer). The three existing rejection paths (missing user / banned / suspended / deleted) keep
  their exact log lines — no regression surface.
- **P2-238 behavior:** `PATCH/POST profile` with a handle lost to a race → HTTP 400
  `{"message":"Handle already taken.","error":"Bad Request","statusCode":400}` — identical to the
  pre-check path. No DTO changes; response shape unchanged.
- TS signatures unchanged (both are internal behavior fixes). i18n: none (API-side messages).

## Gate 3 contract verification checklist
- [x] No mutation return-shape change (neither fix alters any endpoint response).
- [x] Frontend types unaffected (zero PWA files touched).
- [x] No adapter/hook changes needed.
- [x] No field silently undefined — no field changes at all.
- [x] i18n keys: none required (no user-facing string added; WS reject = disconnect only).

## Gate 4 slice plan
1. Slice 1 (P1-53): gateway purpose guard + jest spec (restore-purpose token rejected at handshake;
   normal token still accepted) → build → test → commit.
2. Slice 2 (P2-238): 23505 catch + re-select + spec (race loser gets 400, winner ok) → build →
   test → commit.
3. Observability: both paths already log via Pino (logger.warn) — no new surface needed.
4. Ship: one lane branch `lane/run153-p1-53`, PR → triage PR-Agent → squash-merge → deploy
   (rebuild API, restart service) → live E2E probe (WS connect with restore-purpose token → reject;
   normal token → accept).
