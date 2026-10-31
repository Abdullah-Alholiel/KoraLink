# Run #148 — P2-224 DM offline queue: Program Design (Gates 1-3 compact)

## Problem / user story
A player types a DM on the metro (no signal). Today the send one-shot REST-fails
and the bubble shows "failed" — the message is lost unless she babysits the
retry button. Match chat already queues + replays (P2-172). **As a player, my
DM sends when I lose signal must park safely and deliver on reconnect, exactly
like match chat.**

## Scope
IN: persisted DM send queue (TTL 7d, cap 50, owner-bound), queued-bubble UX +
toast on the DM page, reconnect flusher (online event + rising-edge poll),
previous-session backfill into an open thread, flush-delivery reconcile,
head-of-line-free flush failures, vitest suite.
OUT: DM typing indicator (P2-225, separate), read-receipt REST fallback
(Reviewer B P2, separate), any server change (server already idempotent).

## Architecture delta
New module `apps/player-pwa/src/lib/offline-dm-queue.ts` — parallel of the
match-chat queue internals in `useMessages.ts` (those are module-private; DM
gets its own storage key so the two queues can never collide):
- key `kl.offlineDmQueue.v1`, entry `{conversationId, content, clientMessageId, queuedAt, userId}`
- `enqueueOfflineDm` (dedupe on clientMessageId, FIFO cap), `discardOfflineDm`,
  `getQueuedDmsForConversation(convId, userId)`, `getOfflineDmQueueCount`,
  `pruneOfflineDmQueue`, `registerOfflineDmFlushListener`, `flushOfflineDmQueue`
  (replays oldest-first via `POST /conversations/:id/messages` with the SAME
  `clientMessageId` — server dedupes, conversations.service.ts:285-292),
  `startOfflineDmQueueWatcher` (online event + 5s poll, idempotent arm),
  `OfflineDmSendSignal`, `__resetOfflineDmQueueForTests`.

## Hook wiring (useConversationMessages)
- mutationFn: `if (!isNetworkOnline()) throw new OfflineDmSendSignal();` BEFORE
  the socket branch (an offline device has no socket — but the guard is first
  so a socket-less-but-online device still REST-falls back as today).
- onError on the signal: orphan guard (no user → loud failed), else enqueue +
  stand down the ack timer + flip bubble `queued` + toast + arm watcher.
- onMutate/onSuccess/onError otherwise unchanged; onSuccess also discards the
  queue entry (manual-retry escape hatch).
- Backfill: queued entries for this conversation merge into the view as
  `queued` (filtered against local+history clientMessageIds).
- Flush listener: delivery → reconcile `sent` (append if backfilled; ONLY this
  conversation's deliveries land in this view); failure → bubble `failed`.
- Return surface: `queuedCount` for the thread.

## UI (messages/[id]/page.tsx)
- `status === 'queued'` bubble marker: Clock icon + `messages.queuedOffline`
  title/aria (same as ChatSheet; EN+AR keys exist at messages/en.json:866 /
  ar.json:866 — zero new i18n).
- Queued-confirmation toast (role=status, info style) when a send parks.

## Exact contracts
- Server (existing, unchanged): `POST /conversations/:id/messages`
  `{content, clientMessageId}` → `201 MessageApi | replay` — dedupe on
  (sender_id, conversation_id, client_message_id) partial unique index.
- `PersonalMessage` type unchanged; `MessageStatus` already includes `'queued'`.
- Queue entry shape: see above; storage JSON array, same hygiene as P2-172.

## Gate 3 contract verification checklist
- [x] Every mutation path keeps its existing return shape (hook returns
      `undefined` on the WS path, `PersonalMessage` on REST — unchanged; the
      queue rides onError, not the return path).
- [x] Frontend types accept the exact JSON the backend produces (MessageApi
      mapping unchanged; queue entries are client-local only).
- [x] Adapter functions unchanged (mapMessage; queue stores raw content +
      ids only).
- [x] No field silently undefined (backfill constructs full PersonalMessage).
- [x] i18n keys exist in BOTH languages (`messages.queuedOffline` en:866 /
      ar:866; `messages.failedToSend`, `messages.tapToRetry`, `common.retry`
      already used by the page).

## Observability
`trackEvent('dm_offline_queue_flushed')` on each flush delivery,
`captureError` retained on real send errors (existing line kept).

## i18n keys
None new (reuse `messages.queuedOffline`, `messages.failedToSend`,
`messages.tapToRetry`).

## Risks & mitigations
- Double-queue across match+DM modules → separate storage keys + separate
  entry shapes; dedupe within each module on clientMessageId.
- Replay storm on reconnect → flusher is single-flight (`flushing` flag),
  FIFO cap 50, per-entry try/catch (no head-of-line block), same as P2-172.
- Timer-based tests starve React Query → real timers (proven in the P2-172
  suite).
