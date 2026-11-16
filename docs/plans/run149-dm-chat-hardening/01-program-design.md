# Run #149 — Program Design (Gates 1–3 compact)

## Item 1 — P2-227: DM send serialization (API hardening)

### Problem / user story
A DM participant can be removed, or a block created between the sender and recipient, in the
window between `sendMessage`'s checks and its INSERT — one message then lands in a conversation
the sender may no longer post to (or to a user who just blocked them). Match chat fixed this in
runs #146–#148; DMs are the remaining unserialized sibling.

### Scope
IN: rewrite `ConversationsService.sendMessage` as ONE transaction with `SELECT … FOR UPDATE`
locks on the **conversation row**; participant + block checks inside the tx; idempotency
re-read inside the tx (unique index `personal_messages_client_msg_uidx` backstop kept); lost
race → winner re-read (P2-172) or 409/`ConflictException` without a key. WS `send-dm` gains the
**idempotency pre-read BEFORE the rate limiter** (mirror of the `send-message` P2-172
reconcile, run #148 pattern) with a sender-scoped ack. Side effects (markRead, activity, push)
stay AFTER the tx commits — unchanged behavior.
OUT: group-chat fan-out changes, schema changes, client queue changes.

### Exact API shapes (unchanged — this is a serialization fix, not a contract change)
- REST `POST /conversations/:id/messages` → `200` body unchanged: `{ ...personal_messages row, sender: { id, full_name, handle, avatar_url } }`.
- Errors unchanged: 400 empty · 403 not-participant · 403 `BLOCKED_BY_RECIPIENT` (shape kept: `{ message, code }`) · 404 unknown conversation (tx lookup) · 409 lost race without key.
- WS `send-dm`: replay of an accepted `clientMessageId` → `new-dm` emit to the SENDER's socket only (sender-scoped reconcile ack, PR-Agent run-#148 rule), never `Rate limit exceeded`. First send → room `new-dm` broadcast as today.

### TS signatures (changed methods only)
```ts
// conversations.service.ts
async sendMessage(userId: string, conversationId: string, content: string, clientMessageId?: string): Promise<PersonalMessage>;
// internals (private, inside sendMessage): tx-carried helpers; no new public surface
```

### Lock-order note
Single-lock design: the tx takes ONLY the conversation-row lock (the conversation row is the
arbiter of the participant set; `conversations` rows are never locked elsewhere in the API —
grep-verified — so no ordering hazard). Block checks read `user_blocks` inside the tx WITHOUT
locking (a concurrent block creation racing a message write is a benign window of one message —
the block's next send rejects; document as accepted residual).

### i18n
None (no new user-facing strings; errors are existing message text).

### Verification (Gate 3 checklist)
- [x] Mutation returns the fully populated message `{ ...row, sender }` in ALL paths (insert / winner re-read / idempotency hit) — contract kept.
- [x] REST + WS shapes unchanged; adapter/queue consumers unaffected (client types untouched).
- [x] No field silently undefined (sender re-fetch after commit, same as today).
- [x] No new i18n keys needed.
- [x] Unknown conversationId → clean 404 (was: membership check on nonexistent id → 403; tx lookup makes 404 explicit — matches REST expectations).

## Item 2 — P2-225: DM typing indicator (API + PWA, user-visible)

### Problem / user story
Match lobby chat shows "typing…" (P2-99); personal DMs don't — inconsistent realtime feel on
the chat surface Saudi users use most.

### Scope
IN: gateway `conv-typing` handler (moderation gate → independent `convtyping` rate bucket →
participant proof → relay `conv-typing` to `conv:<id>` EXCEPT sender); PWA `useConversationMessages`
gain `typingUserIds` + `emitTyping` (mirror useMessages P2-99: 2.5s emit throttle, 4s expiry);
DM page typing pill above the composer; i18n `messages.userTyping` EN+AR.
OUT: group typing avatars (single pill with name), REST fallback, server-side presence storage.

### Exact API/WS shapes
- Client → server: `conv-typing` `{ conversationId: string }` (uuid-shaped).
- Server → room: `conv-typing` `{ conversationId, userId }` (client.to semantics — typer excluded).
- Room name: `conv:<conversationId>` (existing join-conversation room).

### TS signatures
```ts
// useConversationMessages.ts (new hook, mirrors useMessages typing block)
typingUserIds: Set<string>; emitTyping: () => void;
```

### i18n contract
- **Zero new keys (revised during build):** the DM pill reuses the existing ChatSheet keys —
  `chatSheet.typingOne` ("{} is typing…" / "يكتب {} الآن…"), `chatSheet.typingMany`, and
  `chatSheet.typingPlayer` ("Player" / "لاعب") — exact i18n-parity maintained (1099=1099
  before AND after; no orphan keys). DM rooms are 1:1 so `typingTwo` never applies.

### Verification (Gate 3 checklist)
- [x] Relay emits only to `conv:<id>` members who joined; sender excluded (client.to).
- [x] Participant proof required (a socket that never joined conv room can't probe arbitrary rooms — P2-74 proportionality rule).
- [x] Typing bucket independent (never consumes dm/msg budget).
- [x] i18n keys exist in BOTH en.json + ar.json; RTL-safe (no sliced strings).
- [x] Hook cleanup: expiry timers cleared on unmount/conversation switch (P2-99 pattern).
