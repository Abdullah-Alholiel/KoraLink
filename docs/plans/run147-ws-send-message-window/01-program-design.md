# Run #147 — Program Design (Gates 1–3 compact)

## Problem
WS `send-message` carries the same check-vs-insert window REST had before P2-220 (run #146):
membership + chat-closed checks run outside the insert transaction.

## User story
As a player, when my match ends while I am typing, my message must not silently land in a
closed chat; and a malformed/stale socket payload with an unknown matchId must get a clean
error, not a server-side FK crash.

## Scope
IN: `app.gateway.ts` `handleMessage` only (+ spec). OUT: send-dm (separate service, has its
own path), REST sendMessage (done run #146), notify fan-out (unchanged, already tx-free).

## Contract (Gate 3)
- Error contract (WsException, machine strings — PWA maps codes client-side):
  - unknown matchId → `Match <id> not found.` (was: FK crash)
  - non-member → `You are not a member of this match.` (unchanged, now evaluated on the
    locked row inside the tx)
  - chat closed → same message + `code: CHAT_CLOSED_ERROR_CODE` (unchanged, now on the
    locked row)
  - lost idempotency race WITHOUT clientMessageId → `Message send conflicted; retry.`
    (parity with REST ConflictException; was: garbage emit)
  - reconcile-before-guard preserved: a retried send with an accepted clientMessageId still
    returns the original row even if the match went terminal after acceptance (P2-172).
- Order (mirrors REST sendMessage :2757-2868 exactly): moderation gate → rate limit →
  idempotency pre-read (outside tx) → tx { match row `SELECT … FOR UPDATE` → membership →
  isChatClosed(locked) → insert onConflictDoNothing } → winner re-read (outside tx) →
  conflict error if still empty → emit + fan-out (unchanged).
- `new-message` payload shape unchanged.
- i18n: none (WS codes; no new user-facing strings).

## Verification
- Rewritten tx-aware spec mocks (`transaction(cb)`, `.for('update')` routing) + new cases:
  unknown-id 404, closed-chat, lost-race-with-key reconcile, lost-race-without-key conflict.
- Gates: targeted jest (gateway + matches), `turbo run build --concurrency=1`, PWA vitest.
- Live E2E: socket.io client on loopback → emit send-message with random UUID → clean
  not-found error (pre-fix: FK error).
