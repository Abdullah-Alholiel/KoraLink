# Run #7 — Gate 0 Retrospective: DM send idempotency (P1-11)

**Cycle:** `run7-dm-idempotency` · **Date:** 2026-08-28T01:3xZ · **Mode:** autonomous

## Area under audit

`personal_messages` (DMs) send path vs the already-hardened `match_messages` path.

## Recent commits (context)

- `4df0d4d` (run #6) — WS handshake ban/suspend + DB-role parity. Verified this run.
- `6351726`/`65bac93` (P1-3) — match-chat idempotency: unique partial index
  `match_messages_client_msg_uidx` + `onConflictDoNothing` + winner re-read.

## Contract audit of the DM send path

`conversations.service.ts:194-294` `sendMessage`:

1. `assertParticipant` — participant membership enforced ✅ (same as match chat).
2. **Fast-path** `findFirst` on `(sender_id, conversation_id, client_message_id)` —
   returns the existing row if a retry already landed. Correct for the *sequential*
   retry case, but it is a **TOCTOU** window: two concurrent requests both pass the
   `findFirst` (no existing row) and both insert.
3. **Insert** `.values(...).returning()` — **no `onConflictDoNothing`**, and no unique
   index backing the idempotency key. A concurrent retry inserts a *duplicate* DM row.
4. Side effects after insert: `markRead`, `activities.record('messaged')`,
   `sendPushToUsers` (offline recipients). These must NOT re-fire on a duplicate retry.

## Schema diff vs match_messages

`schema.ts:650-653` — `personal_messages` indexes:
- `personal_messages_conv_idx` (conversation_id)
- `personal_messages_conv_created_idx` (conversation_id, created_at)
- ❌ **no partial unique index** on `(sender_id, conversation_id, client_message_id)`.

Contrast `schema.ts:429-431` (`match_messages`):
```ts
uniqueIndex('match_messages_client_msg_uidx')
  .on(t.user_id, t.match_id, t.client_message_id)
  .where(sql`client_message_id IS NOT NULL`),
```

## Tech-debt classification

- **Root cause:** idempotency key has no DB-level uniqueness guard; the SELECT-then-INSERT
  is a classic TOCTOU race. This is a **data-integrity** bug (duplicate DMs), same family as
  the match-chat fix (P1-3) and the settlements/reports races (P2-9, run #4).
- **Fix is a proven mirror:** add the partial unique index + `onConflictDoNothing` +
  winner re-read, exactly the pattern already shipped for `match_messages`.

## Proceed

✅ Proceed to build. One vertical slice, no external dependency, no i18n/user-facing strings.
