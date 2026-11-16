# Run #147 — Gate 0 Retro: WS send-message window (P2-220 twin)

**Area:** `apps/api/src/modules/gateway/app.gateway.ts` `handleMessage` (send-message).

**Recent commits in area:** `5367063` (REST sendMessage tx serialization, P2-220, run #146 —
its row documents "WS send-message path (app.gateway.ts:~421-470) carries the same window —
follow-up when the matches module is next touched"), `c442d37`/`c8c1f4b` (P2-172 offline
queue — client-side replay relies on idempotent `client_message_id`, which the server-side
reconcile contract must keep honoring).

**Findings:**
1. [IMPORTANT] WS race — membership read (:412-423) + chat-closed predicate (:427-442) +
   INSERT (:457-480) run as independent statements. A match flipping terminal between check
   and write lets one message land in a just-closed chat. REST twin fixed this run #146.
2. [IMPORTANT] Unknown matchId: `chatMatch` undefined skips the closed-guard → INSERT dies
   on the FK as a raw 500-ish socket error (REST side now 404s; WS should fail with a clean
   `Match <id> not found.`).
3. [MINOR] Lost idempotency race WITHOUT a clientMessageId: `onConflictDoNothing` returns 0
   rows → `messageRow` undefined → `{...undefined, user}` emits a garbage payload instead of
   erroring (REST throws 409 Conflict).
4. DECISIONS.md consulted — backend concurrency only, no design/UX touch. No contradiction.
5. fix:feat ratio in recent log healthy (fix+docs dominant). No contract breaks found.

**Recommendation:** proceed — mirror the REST P2-220 shape one-for-one.
