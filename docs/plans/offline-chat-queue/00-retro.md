# Cycle: Offline chat-send queue (P2-172, run #144)

## Gate 0 — Retrospective

**Area audited:** PWA chat send path (`useMessages.ts` useMatchChat, ChatSheet), offline infra
(OfflineBanner ×12 pages, useOnlineStatus, SW read-fallback P2-73), DECISIONS.md ledger.

**Recent commits in area:** P2-196 (missed-marker clear), P2-111 (send-failure reason surfacing),
optimistic append + client_message_id reconcile (runs #70s). No fix:feat regression pattern in area.

**Findings:**
- [IMPORTANT][verified] P2-172 stands: offline chat send → `mutationFn` runs REST fallback →
  FetchError network → bubble flips `failed` → user must manually retry after reconnect.
  `useMessages.ts:539-549`. Queued-send infra does not exist (`src/lib`, `src/hooks` swept).
- [REFUTED] Reviewer B P0 "venue detail lacks offline affordance" — FALSE: clubs/[id]/page.tsx:34-35,161,167
  imports + renders OfflineBanner (run-#52). Claims ≠ facts treatment applied.
- [NEW][hex] Reviewer A: PaymentSheet.tsx:8 imports `fetcher` directly in a component;
  match-fees.ts imports drizzle while the hex doctrine names it domain-pure. Both verified real;
  both DEFERRED (see 01-program-design §out-of-scope) — money-path churn not taken this run.
- DECISIONS.md check: no ledger entry contradicts a chat-send offline queue. Money actions stay
  excluded per standing money-path rules (join = server-side fee debit — never queued offline
  without an owner decision; recorded, not defaulted).

**Fix:feat ratio:** healthy (recent cycle mostly feature PRs from board items).

**Proceed to Gate 1:** YES — scope narrowed to chat-send only.

## Gate 1 — Product Spec (compact)

- **Problem:** A player at a venue with poor signal types a chat message; the send fails and the
  bubble goes red. They must notice, wait for signal, and manually re-tap. Messages are the
  coordination layer for games — silent loss of a typed message is the worst UX state in the app.
- **User story:** As a player in a weak-signal venue, when I send a chat message while offline,
  my message stays visible as "will send when back online" and delivers automatically on
  reconnect — I never retype or notice a failure.
- **In scope:** chat-send in match lobby chat (ChatSheet + useMatchChat) ONLY.
- **Out of scope:** join/leave/booking/payment actions (money paths — server-side fee debit;
  queueing them offline is an owner decision, not a default), DM start (creates server state),
  typing indicators, push notifications (P1-66 keys are owner-gated).
- **Success criteria:** offline send → bubble shows queued state (not failed); reconnect →
  automatic replay with the SAME client_message_id → server dedupes → bubble flips to the
  server message; replay works after page reload (persisted queue); join flows untouched;
  EN+AR parity; build+vitest green.

## Gate 2 — Architecture (compact)

- Data flow: send → `!navigator.onLine` → persist to `localStorage['kl.offlineChatQueue']` →
  bubble status `queued` → module watcher (online event + 5s rising-edge poll) → flush replays
  `sendMessage.mutate({content, clientMessageId})` (existing idempotent path) → existing
  reconcile swaps local id → server id → queue entry removed AFTER server ack
  (`onSettled`-equivalent in flush), so a crash mid-replay never loses a message.
- Files changed: `apps/player-pwa/src/hooks/useMessages.ts` (queue + watcher + status),
  `apps/player-pwa/src/components/matches/ChatSheet.tsx` (queued icon, offline banner above
  composer, queued toast), `src/messages/{en,ar}.json` (2 keys), `test/offline-chat-queue.test.tsx` (new).
- i18n keys: `messages.queuedOffline`, `messages.offlineQueuedBanner` (EN+AR).
- Observability: PostHog `chat_message_offline_queued` / `chat_offline_queue_flushed` (AGENTS §4).
- Risks: duplicate replay → mitigated by server dedupe on client_message_id (already built);
  localStorage unavailable (private mode) → try/catch, degrade to in-memory queue.

## Gate 3 — Program Design (contracts)

```ts
// useMessages.ts
export type MessageStatus = 'sending' | 'sent' | 'failed' | 'queued'; // extended
interface QueuedMessage { matchId: string; content: string; clientMessageId: string; queuedAt: string }
// module-level: offlineQueue: QueuedMessage[] (hydrated from localStorage lazily, single instance)
// useMatchChat(matchId, onSendError?, opts?: { onQueued?: () => void })  — 3rd param optional, back-compat
// mutationFn: FIRST LINE if (!navigator.onLine) throw new OfflineSendSignal()
// onError: OfflineSendSignal → status 'queued' + queue push + watcher start; NO ack timer armed
// flushOfflineQueue(): replays oldest-first via the same mutation; entry removed on server ack;
//                     double-flush guarded by `flushing` flag + entry removal before re-mutate? -> removal on ack only, `flushing` guard prevents re-entry
// __resetOfflineChatQueueForTests(): exported for spec isolation
```

- ChatSheet: `msg.status === 'queued'` → `<Clock>` icon, aria/title `messages.queuedOffline`;
  `!isOnline` → banner above composer `messages.offlineQueuedBanner`; onQueued → info toast.
- Adapter/hook contract: no API-shape change (client-only feature; zero backend surface).
- Contract verification checklist:
  - [x] No mutation endpoint changes — nothing to populate; existing send path reused verbatim.
  - [x] Frontend types accept existing API shapes — MatchMessage unchanged except client-only status union.
  - [x] Adapter functions unchanged — no new API shape consumed.
  - [x] No field silently undefined — queued entries carry all replay inputs (matchId, content, clientMessageId).
  - [x] i18n keys exist in BOTH en.json and ar.json (added in same commit).
