# Run #7 — Program Design: DM send idempotency (P1-11)

## Problem

A retried DM send (network blip, client retry) can insert a **duplicate** `personal_messages`
row because the idempotency key `(sender_id, conversation_id, client_message_id)` has no unique
index and the insert is a `findFirst`→`insert` (TOCTOU). Match chat is already hardened; DMs
are not.

## User story

As a player, when my DM send retries due to a transient failure, I see exactly ONE copy of my
message — never a duplicate.

## Scope

**IN:** partial unique index + `onConflictDoNothing` + winner re-read in `sendMessage`.
**OUT:** DM pagination (P1-3), attachments/media (P1-3), any other endpoint.

## Architecture delta

- `apps/api/src/database/schema.ts` — add `uniqueIndex('personal_messages_client_msg_uidx')`
  on `(sender_id, conversation_id, client_message_id)` with
  `.where(sql\`client_message_id IS NOT NULL\`)`.
- `apps/api/src/modules/conversations/conversations.service.ts` — insert becomes
  `.onConflictDoNothing().returning()`; when `inserted` is empty (a concurrent retry won the
  race), re-read the winner and return it, **skipping** `markRead`/activity/push side effects;
  fall back to `ConflictException` only if the row is somehow absent.

## API contract (unchanged — POST /conversations/:id/messages)

Response shape is already `PersonalMessage` (conversations.service.ts:45-52):

```json
{
  "id": "…",
  "conversation_id": "…",
  "sender": { "id": "…", "full_name": "…", "handle": "…", "avatar_url": "…" },
  "content": "hello",
  "created_at": "2026-08-28T…",
  "client_message_id": "a1b2c3d4"
}
```

No frontend type changes — the PWA already consumes this shape.

## TS signatures (unchanged)

```ts
async sendMessage(
  userId: string,
  conversationId: string,
  content: string,
  clientMessageId?: string,
): Promise<PersonalMessage>
```

## i18n keys

None — no user-facing strings added or changed.

## Gate 3 contract verification checklist

- [x] Mutation returns a fully populated object with relations — `sendMessage` already
      returns `{ ...inserted, sender }`; winner re-read returns `{ ...existing, sender }`.
- [x] Frontend type (`PersonalMessage` consumer) accepts the exact JSON — shape unchanged.
- [x] Adapter exists for the shape — unchanged (DMs already rendered from this shape).
- [x] No field silently `undefined` — `sender` fetched on every return path.
- [x] i18n keys — N/A (no new strings).

## Slices

1. **Slice 1 (tracer bullet):** schema index + `onConflictDoNothing` + winner re-read +
   `conflict` fallback. Build + jest + a new `conversations.service.spec.ts` idempotency spec.
2. **Slice 2:** generate migration `0019`, apply to live DB, verify index in `pg_indexes`,
   restart API service.
