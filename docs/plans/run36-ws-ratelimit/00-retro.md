# Run #36 — WS chat rate limiting (P1-42) — Retrospective (Gate 0)

**Area audited:** `apps/api/src/modules/gateway/app.gateway.ts` (WS surface) + mailer review follow-ups.

## Recent commits in area
- `16d4cc1` feat(api): transactional email layer (run #35) — mailer module + users.email columns
- `148acb2` / `1dea7b0` (run #34) — no-show reputation, decision-mutation guards
- Gateway last structurally touched: runs #6/#22/#31 (moderation handshake, JWT getOrThrow, PDPL parity)

## Findings
1. **[CRITICAL — the item] WS handlers `send-message` (app.gateway.ts:225) and `send-dm` (:377) have
   no rate limiting at all.** REST equivalents are DTO-capped (`@MaxLength(2000)` in
   `send-message.dto.ts:8`, `create-match-message.dto.ts:8`) and throttled; WS is wide open —
   an authenticated user can flood the event loop and rooms. Confirmed independently by Reviewer A
   (run #36) and pre-boarded as P1-42 by run #35.
2. **WS content length is unbounded too** — REST caps 2000 chars, WS handlers accept any length.
   Same flood vector; fix together.
3. [IMPORTANT, mailer — separate follow-up, not this slice] `renderEmail()` runs outside the try in
   `deliver()` (mailer.service.ts:193-199) → partial-send outcomes discarded on render throw.
4. [IMPORTANT, mailer — follow-up] `setEmail` maps every non-EMAIL_TAKEN error to 400
   (mailer.controller.ts:45); TOCTOU race loser surfaces 400 not 409.

## Verified-good (do not re-litigate)
Membership checks on both handlers (run #22 refutation stands), idempotent clientMessageId path,
moderation handshake specs (12 scenarios in app.gateway.spec.ts), `::uuid`/`eq(col,null)`/console.*
sweeps all clean this run.

## Decision
Build P1-42 as a dependency-free per-socket sliding-window limiter inside the gateway module
(board spec: "per-socket token bucket"). Do NOT adopt @nestjs/throttler mid-run (adoption = Gate cycle).
