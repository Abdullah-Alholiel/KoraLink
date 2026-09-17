# Run #57 — API lane (rotation 57%4=1): P1-48 WS mid-session ban enforcement

## Gate 0 — Retrospective

**Area audited:** `apps/api/src/modules/gateway/app.gateway.ts` (528 lines) + the moderation
chain P1-47 landed in run #56 (`users.service.ts:445-470`, `auth.service.ts:205-235`,
`email-otp.service.ts`, `jwt-cookie.strategy.ts`).

**History of the file:** handshake-level moderation evolved run #6 (connection check) → #27
(origin allowlist, P1-17c Strix finding) → #31 (deleted_at, P1-36) → #36/#37 (rate-limit
buckets). Each iteration hardened the handshake only. No run ever re-checked account state on
the message path — that residual gap is exactly board item P1-48 (filed by Reviewer B, run #56).

**Confirmed gap (Reviewer A, run #57 — CRITICAL):** `handleConnection` (:143–163) rejects
banned/suspended/deleted users at handshake, but all 6 state-changing `@SubscribeMessage`
handlers trust `client.userId` for the socket's whole life:
`join-lobby` :207, `send-message` :233, `join-conversation` :382, `mark-read` :404,
`mark-chat-read` :428, `send-dm` :454. A user banned mid-session keeps chat/DM/lobby access
until the 7-day JWT dies or the client reconnects. The REST strategy re-validates per request;
the WS layer does not — the moderation action is not felt in realtime surfaces.

**Fix:feat ratio:** recent commits are feat-heavy (P1-47, P2-70) with reviewer-driven fixes —
healthy. No unrelated debt in the touch area.

**Reviewer A sweep (this run, all clean — do not re-fix):** `::uuid` casts 0; `eq(col,null)` 0;
money sweep on all Cancelled/Completed writers present (guarded UPDATE + rowCount + per-payer
refunds); console.* 0 in prod paths; DTO enums narrow; pagination bounded (`@Max(50)`);
TOCTOU in `conversations.service.ts:241` is benign-by-design (`onConflictDoNothing` + unique
index + race re-read) — leave it alone.

**Decision:** proceed to Gate 1. The gateway is the last surface that ignores live moderation
state; P1-47 already gave every REST surface stable codes.

## Gate 1 — Product Spec (compact)

**Problem:** a banned/suspended user keeps chatting in lobbies and DMs until token expiry —
moderation is not enforced where users actually experience it (realtime chat).

**User story:** as a moderator (admin), when I ban an account, the user must be unable to send
another lobby/DM message on their existing connection — the same guarantee the REST layer gives.

**IN scope:** per-message account-state gate on the 6 state-changing WS handlers; shared
predicate with the handshake check; jest coverage (ban/suspend/delete reject per handler class;
clean user passes; leave-conversation stays exempt).
**OUT of scope:** admin-initiated force-disconnect broadcast (larger surface: needs an admin
API + client reconnect UX — separate item if ever needed); in-memory TTL cache optimization;
PWA changes (verified none needed: fire-and-forget emit + optimistic-append/reconcile already
degrades correctly when the server rejects a send).

**Success criteria:** banned/suspended/soft-deleted user's `send-message`/`send-dm` throw
before any DB write, rate-limit consumption, or broadcast; all gates green; no behavior change
for clean users.

## Gate 2 — Architecture (compact)

No schema, DTO, or client changes. One file + its spec.

- `moderationReason(user): 'banned' | 'suspended' | 'deleted' | null` — the single predicate,
  lifted from `handleConnection` :143–163 (banned → suspended_until > now → deleted).
- `requireActiveUser(userId): Promise<void>` — PK lookup of the 3 moderation columns; throws
  `WsException('Your account can no longer perform this action.')` when the row is missing or
  any reason fires. Called immediately after each handler's `!client.userId` guard, BEFORE
  rate-limit consumption / membership reads / writes.
- `handleConnection` refactored to use `moderationReason` (keeps its three distinct log lines).
- `leave-conversation` deliberately ungated (P2-6 rationale: leave only shrinks the caller's
  own event surface; gating would trap a removed/banned user in the room).

**Cost:** +1 PK SELECT per WS event (sub-millisecond; send paths already rate-limited per
socket, P1-42). TTL-cache optimization explicitly deferred — correctness first for a security
gate; revisit only if metrics show the load.

## Gate 3 — Program Design (contract)

```ts
private moderationReason(user: {
  banned_at: Date | null; suspended_until: Date | null; deleted_at: Date | null | undefined;
}): 'banned' | 'suspended' | 'deleted' | null
private async requireActiveUser(userId: string): Promise<void>  // throws WsException
```

- WsException message (single, handler-independent): `Your account can no longer perform this action.`
- Handlers gated (6): join-lobby, send-message, join-conversation, mark-read, mark-chat-read, send-dm.
- Handlers untouched: leave-conversation (documented exemption), broadcast* methods (server-initiated).
- No i18n keys: WsException strings never surface in the PWA (fire-and-forget emit; optimistic
  append reconciles by client_message_id; failure UX = existing localized send-failure path).

**Contract verification checklist:**
- [x] No mutation contract impact — WS handlers return void; the only new call is a read.
- [x] No new endpoint/DTO — nothing for the frontend types to drift against.
- [x] Predicate is the SAME shape as `jwt-cookie.strategy.validate()` / handshake check (order:
      banned → suspended (future-only) → deleted) — no semantic drift between REST and WS.
- [x] PWA renders no new strings — zero i18n parity work required.
- [x] Gates re-run by this session after the slice: turbo build + jest + vitest + tsc.
