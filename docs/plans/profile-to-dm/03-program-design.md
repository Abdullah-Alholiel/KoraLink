# Gate 3 — Program Design (CONTRACTS): User→User Messaging (Profile → Message)

> This document is the executable build contract. Frontend and backend code MUST match
> these shapes exactly. Where the existing module already conforms, the contract states
> "exists" — do not drift it.

## 1. Endpoints (existing — contract locked by audit)

### POST /api/v1/conversations  (201)

Request: `{ "userId": "<36-char varchar id>" }` (CreateConversationDto)

Response `201` — `Conversation` (existing shape, `findOrCreateDirect` → `findConversation`):

```json
{
  "id": "conv-uuid-36",
  "participants": [
    { "id": "u-me",  "full_name": "Me",   "handle": "me",  "avatar_url": null },
    { "id": "u-them","full_name": "Them", "handle": "them","avatar_url": null }
  ],
  "created_at": "2026-09-09T12:00:00.000Z"
}
```

Frontend uses `id`; participants available for avatar/name fallback.

**Errors:** 400 self-message · 401 unauthenticated · (NEW D-2) 23505 → handled server-side
(re-SELECT by `pair_key`, return existing with 201) — client never sees a conflict.

### GET /api/v1/conversations (200) — exists, shape in `useConversations.ts`

`{ conversations: [{ id, otherParticipant{ id, full_name, handle, avatar_url },
lastMessage, lastMessageAt, lastMessageSenderId, unreadCount }], total, hasMore }`

### GET /api/v1/conversations/:id/messages?page&perPage (200) — exists

`{ messages: [{ id, conversation_id, sender{id,full_name,handle,avatar_url}, content,
created_at, client_message_id? }], total, hasMore }`

### POST /api/v1/conversations/:id/messages (201) — exists, idempotent

### GET /api/v1/users/me/discussions (200) — EXTENDED (I-2)

New union branch appended (schema preserved, `type` discriminator already in contract):

```json
{
  "discussions": [
    { "id": "match-or-conv-id", "type": "match" | "personal",
      "title": "...", "matchStatus": "Open" | null,
      "participantCount": 8, "lastMessage": "...", "lastMessageAt": "...",
      "lastMessageSenderName": "...", "unreadCount": 0, "avatarUrl": null,
      "avatarInitials": "س" },
    { "id": "conv-id", "type": "personal", "title": "Other Person",
      "matchStatus": null, "personal": true,
      "participantCount": 2, "lastMessage": "noted 👍",
      "lastMessageAt": "...", "lastMessageSenderName": "Other Person",
      "unreadCount": 2 }
  ], "total": 12, "hasMore": false
}
```

Order: single `ORDER BY last_activity DESC LIMIT 30` across the union (most-recent
personal chat floats above match chats — US-5). `personal: true` flag added to the
personal branch so the page can route without `type` reliance (both used, belt+braces).

## 2. New frontend hook (D-1)

```ts
// hooks/useConversations.ts
useStartConversation(targetUserId: string | null): {
  mutate: (undefined) => void;          // fires POST /conversations { userId: targetUserId }
  mutateAsync: () => Promise<ConversationCreatedApi>; // { id, participants, created_at }
  isPending: boolean; isError: boolean; error: FetchError | null; reset: () => void;
}
// onSuccess: invalidate ['conversations'] and ['discussions'];
// trackEvent('dm_started', { locale }) — env-gated via ObservabilityProvider
```

Component flow: `mutate()` → `onSuccess` in the SHEET (`router.replace` NOT push, so
back from chat returns to the match page, not a dead sheet route) — sheet unmounts.

## 3. Migration 0039 (D-2) — final SQL locked in 02-architecture §Pair uniqueness

- Column `conversations.pair_key varchar(73)` (nullable; legacy/group-proof).
- Backfill + zero-message-dupes cleanup + partial unique index
  `conv_pair_unique_idx ON conversations(pair_key) WHERE pair_key IS NOT NULL`.
- Service: compute `pair_key = least(u1,u2) || ':' || greatest(u1,u2)` before INSERT;
  on `23505` re-SELECT `WHERE pair_key = $pk` → return `findConversation(existing.id)`.
  Self-check (400) BEFORE pair_key computation.
- Drizzle schema.ts gains `pair_key: varchar('pair_key', { length: 73 })` on
  `conversations` — no relation changes.

## 4. PlayerProfileSheet Message row (D-3)

Placement: between Follow card and Report button — a full-width white card row, same
visual language as Report (`bg-white rounded-xl shadow-card p-4 mb-3`, centered, gap-2):

```tsx
{!isSelf && (
  <button data-testid="profile-message-btn"
    onClick={() => startConversation.mutate()}
    disabled={startConversation.isPending}
    className="w-full bg-white rounded-xl shadow-card p-4 mb-3 flex items-center
               justify-center gap-2 text-sm font-semibold text-brand-green
               disabled:opacity-50">
    {startConversation.isPending
      ? <Loader2 className="w-4 h-4 animate-spin" strokeWidth={2} />
      : <MessageCircle className="w-4 h-4" strokeWidth={2} />}
    {t('profile.messageUser')}
  </button>
)}
```

- Hidden when `isSelf` (US-6) or while `profile` still loading? No — `player.userId`
  is enough; render regardless of profile fetch state.
- `onSuccess` (in sheet): `router.replace(\`/${locale}/messages/${id}\`)`; `onClose()`.
- `onError`: `showToast(t('messages.startFailed'), 'error', { detail: undefined })` —
  per §12 single-surface rule the sheet stays open, retry enabled (button re-enables).
  `captureError(err, { scope: 'startConversation', targetUserId })` always.

## 5. i18n contract (BOTH locales, same tree path)

| Key | en | ar |
|---|---|---|
| `profile.messageUser` | `Message` | `رسالة` |
| `messages.startFailed` | `Couldn't start the chat. Check your connection and try again.` | `تعذّر بدء المحادثة. تحقّق من اتصالك وحاول مرة أخرى.` |

Reuse (no new keys): `common.back`, `common.loading`, `messages.typeMessage`,
`messages.send`, `messages.failedToSend`, `messages.tapToRetry`.

## 6. Adapter contract

`ConversationCreatedApi → { id }` only — the sheet needs no adapter beyond reading
`id`. `useConversations`/`useConversationMessages` mappers exist and are reused
unchanged (`mapSummary`, `mapMessage`).

## 7. Observability contract (AGENTS.md §4)

| Surface | Mechanism | Event / scope |
|---|---|---|
| Start conversation success | `trackEvent('dm_started')` | once per successful POST |
| Send message success (DM) | `trackEvent('dm_message_sent')` | in `useConversationMessages.sendMessage.onSuccess` (WS path reconciles via echo → track there, not mutationFn) |
| Start failure | `captureError(err, { scope: 'startConversation' })` | every failure |
| Send failure | `captureError(err, { scope: 'dmSend' })` in onError | every failure |
| API insert-conflict recovery (23505 recovery path) | Nest `Logger.log('conversation pair-key collision resolved', ...)` | race recovered |

## 8. Contract verification checklist (filled at Gate 3→4 boundary)

| # | Item | Result |
|---|---|---|
| 1 | POST /conversations returns fully populated `Conversation` with participants | ☐ exists — verify live |
| 2 | `useStartConversation` accepts targetUserId, returns `{ id }` | ☐ |
| 3 | Adapter: sheet reads only `id` from response | ☐ |
| 4 | No field silently undefined: `otherParticipant` non-null in list (INNER JOIN guarantee) | ☐ exists |
| 5 | i18n keys exist in BOTH en.json and ar.json before component references them | ☐ |
| 6 | Migration 0039 idempotent + journal row via deploy applier | ☐ |
| 7 | 23505 race → existing conversation returned (201), never surfaced to client | ☐ |
| 8 | Message send retry idempotent (same clientMessageId → same row) | ☐ exists — E2E re-verify |
| 9 | WS `join-conversation` gates membership + echoes reach sender (`server.to`) | ☐ exists |
| 10 | Discussions union: personal branch fields all present in PWA `Discussion` type | ☐ |
| 11 | Error UX: localized in-sheet/toast failure, retry enabled, no raw err.message | ☐ |
| 12 | Sentry/PostHog wired per §7 table | ☐ |

## 9. Slices (Gate 4)

- **Slice 1 (tracer):** migration 0039 + service pair-key + `useStartConversation` +
  Message button → build → vitest → commit. E2E: double-tap race probe (two rapid
  POSTs → same conversation id).
- **Slice 2:** discussions union (SQL + PWA type + list routing already handles
  `type==='personal'`) + DM row polish (time, avatar) → build → vitest → commit.
- **Slice 3:** observability wiring (§7) + colocated tests + i18n parity check →
  build → vitest → commit.
- **Slice 4:** staging deploy via `scripts/deploy-staging.sh` → health matrix → live
  two-user E2E (browser): roster → profile → Message → chat → send → echo → badge.
  Hand to Abdullah for staging review before any promote.
