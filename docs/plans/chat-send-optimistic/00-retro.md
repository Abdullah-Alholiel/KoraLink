# Chat Send UX — Optimistic Send + Reconciliation

**Cycle:** `chat-send-optimistic`
**Date:** 2026-08-15
**Mode:** Autonomous (full cycle without per-gate approval pauses)

---

## Gate 0 — Retrospective

**Reported symptom:** Clicking Send in the chat UI leaves the text in the input bar / produces no visible "sent" bubble, even though the message *is* persisted server-side (other participants receive it). The sender has no send UX.

**Root cause (verified by code trace):** Both chat surfaces are **echo-dependent with no optimistic layer**:

1. `useMatchChat` (match chat → `ChatSheet`) and `useConversationMessages` (DM → conversation page) build `messages = [...history, ...liveMessages]` where `liveMessages` is populated *only* by the WebSocket `new-message` / `new-dm` echo.
2. The server does `server.to(room).emit('new-message', …)` — it *does* broadcast to the sender's room, **but only if the sender has successfully joined the room** (`join-lobby`). Any gap (join race, missed `join-lobby`, socket drop/reconnect) means the message persists but the sender never sees it.
3. `useMatchChat`'s `sendMessage` has **no REST fallback** — it `throw`s when the socket is down (unlike the DM hook).
4. **No pending / failed / retry state per message** — only a global `isPending` spinner and a global error banner.

**Contract audit findings (Gate 0 checklist):**

| Finding | Severity |
|---|---|
| `send-message` gateway handler does **no membership check** (any authenticated user can INSERT into `match_messages` for any `match_id`) | CRITICAL (security) |
| No idempotency key → a retry after a lost echo creates duplicate messages | IMPORTANT |
| Match chat has no REST fallback (DM does) | IMPORTANT |
| No optimistic bubble / no per-message status | IMPORTANT (the reported bug) |
| Input clears synchronously (`setInput('')`) but the bubble never appears → user perceives "it stays / nothing happened" | ROOT CAUSE |

**fix:feat ratio over last 15 commits ≈ 4:11 — healthy, no reactive-fix loop.**

---

## Gate 1 — Product Spec

**User stories:**
- **P0** — As a player, when I tap Send, my message appears in the chat immediately and the input clears, even before the server confirms.
- **P0** — As a player, if my message fails to send, I see a clear "not sent" indicator and can retry without retyping.
- **P1** — As a player, sending the same message twice (via retry) must never produce duplicate messages.
- **P1** — Only members of a match may post to its chat.

**In scope:** optimistic send + reconciliation + per-message status + idempotent retry + membership enforcement, for BOTH match chat and DM.

**Out of scope:** message editing/deletion, read receipts, typing indicators, pagination of chat history.

**Success criteria:** tap send → bubble renders instantly (status "sending" → "sent"), input clears; a failed send shows "Not sent — tap to retry" and retry re-emits with the same client id (no duplicate on the server).

---

## Gate 2 — Architecture

Data flow (optimistic → authoritative):

```
User taps Send
  └─> hook: append optimistic msg (client_message_id = uuid, status="sending"), clear input
        ├─ socket connected  → emit('send-message', { matchId, content, clientMessageId })
        │     └─ server: membership check → idempotency check → INSERT(client_message_id)
        │            → emit('new-message', { …row, client_message_id, user }) to room
        │            → client echo handler: reconcile optimistic msg by client_message_id → status="sent"
        └─ socket down       → (match chat) mark "failed" after ack timeout; retry re-emits same id
                                (DM) REST POST /conversations/:id/messages { content, clientMessageId }
                                      → reconcile from REST response
```

**Files changed:**

| Layer | File | Change |
|---|---|---|
| API schema | `apps/api/src/database/schema.ts` | add `client_message_id` to `match_messages` + `personal_messages` |
| API migration | `apps/api/drizzle/0009_*.sql` (generated) | add the two columns + partial unique index per (user, client_message_id) |
| API gateway | `apps/api/src/modules/gateway/app.gateway.ts` | `send-message`: membership check + idempotency + `clientMessageId` passthrough/echo |
| API service | `apps/api/src/modules/conversations/conversations.service.ts` | `sendMessage(…, clientMessageId?)`: idempotency + store + return |
| API DTO | `apps/api/src/modules/conversations/dto/send-message.dto.ts` | add optional `clientMessageId` |
| PWA hook | `apps/player-pwa/src/hooks/useMessages.ts` | `useMatchChat`: optimistic send + reconciliation + status + retry + ack timeout |
| PWA hook | `apps/player-pwa/src/hooks/useConversations.ts` | `useConversationMessages`: same for DMs |
| PWA UI | `apps/player-pwa/src/components/matches/ChatSheet.tsx` | per-message status (sending spinner / failed retry), always-clear input |
| PWA UI | `apps/player-pwa/src/app/[locale]/messages/[id]/page.tsx` | per-message status + retry |
| i18n | `src/messages/en.json` + `ar.json` | `messages.sending`, `messages.failedToSend`, `messages.tapToRetry` |

---

## Gate 3 — Program Design (contracts)

### Wire shapes

**Match message (REST GET + WS `new-message` echo), snake_case:**
```json
{
  "id": "<uuid>",
  "match_id": "<uuid>",
  "user_id": "<uuid>",
  "content": "text",
  "created_at": "ISO-8601",
  "client_message_id": "<uuid>|null",
  "user": { "id": "<uuid>", "full_name": "…", "handle": "…", "avatar_url": "…" }
}
```

**DM message (REST + WS `new-dm` echo), snake_case:**
```json
{
  "id": "<uuid>",
  "conversation_id": "<uuid>",
  "sender": { "id": "…", "full_name": "…", "handle": "…", "avatar_url": "…" },
  "content": "text",
  "created_at": "ISO-8601",
  "client_message_id": "<uuid>|null"
}
```

**WS send payloads (camelCase, matching existing):**
- `send-message`: `{ matchId: string, content: string, clientMessageId?: string }`
- `send-dm`: `{ conversationId: string, content: string, clientMessageId?: string }`

**REST send payloads:**
- `POST /conversations/:id/messages`: `{ content: string (≤2000), clientMessageId?: string }`
- (match chat keeps WS-only; no REST fallback endpoint added — out of scope this cycle)

### Frontend type contracts

```ts
// useMessages.ts
export interface MatchMessage {
  id: string; match_id: string; user_id: string; content: string; created_at: string;
  user: { id: string; full_name: string | null; handle: string | null; avatar_url: string | null };
  client_message_id?: string;
  status?: 'sending' | 'sent' | 'failed';
}

// useConversations.ts
export interface PersonalMessage {
  id: string; conversationId: string; content: string; createdAt: string;
  sender: { id: string; fullName: string | null; handle: string | null; avatarUrl: string | null };
  clientMessageId?: string;
  status?: 'sending' | 'sent' | 'failed';
}
```

### Hook return contracts

- `useMatchChat(matchId)` → `{ messages, isLoading, error, refetch, isConnected, sendMessage: UseMutationResult, retryMessage: (clientMessageId, content) => void }`
- `useConversationMessages(id)` → `{ messages, isLoading, error, sendMessage: UseMutationResult, retryMessage: (clientMessageId, content) => void }`

### Idempotency contract

Server: on send with `clientMessageId`, `SELECT` existing row `WHERE user_id = $1 AND client_message_id = $2`; if found, return it (no re-insert). Enforced for both match messages (gateway) and DMs (service). Legacy rows have `client_message_id = NULL` (never collide).

### i18n key contract

| Key | en | ar |
|---|---|---|
| `messages.sending` | `Sending…` | `جارٍ الإرسال…` |
| `messages.failedToSend` | `Not sent` | `لم يُرسل` |
| `messages.tapToRetry` | `Tap to retry` | `اضغط لإعادة الإرسال` |

---

## Gate 4 — Vertical Slices

1. **Slice 1 (tracer bullet):** match chat end-to-end — schema + gateway + `useMatchChat` + `ChatSheet` + i18n + tests. `turbo run build` green.
2. **Slice 2:** DM end-to-end — `conversations.service` + DTO + `useConversationMessages` + conversation page. `turbo run build` green.

Hard gate: `turbo run build` (zero errors) + `npx vitest run` (all green) before each slice is claimed done.
