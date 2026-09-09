# Gate 2 — Architecture: User→User Messaging (Profile → Message)

## Overview

No new modules. The cycle **closes the loop** on the existing stack: one new UI affordance
(Message button), one integrity fix (pair uniqueness), observability, and a discussions
union. Data flow:

```
PlayerProfileSheet ──POST /conversations {userId}──▶ ConversationsService.findOrCreateDirect
        │ (dedupe: unique pair index + retry-on-conflict)        │
        ▼                                                        ▼
router.replace(/messages/{id})  ◀────────────────────────  conversations row
        │                                                        │
        ▼                                                        ▼
[locale]/messages/[id] page ──WS join-conversation/send-dm──▶ gateway (existing)
        │                                    │
        ▼                                    ▼
useConversationMessages (existing)      new-dm echo / offline web-push (existing)
```

## Component changes

| File | Change | Why |
|---|---|---|
| `apps/api/drizzle/0039_conversation_pair_unique.sql` | **NEW** — backfill dedupe then `CREATE UNIQUE INDEX conv_pair_unique_idx ON conversation_participants (conversation_id, user_id)` already exists; NEW index is **pair-level**: unique on `(least(u1,u2), greatest(u1,u2))` enforced via generated columns table `conversations` or a functionally-deduped partial approach (see §Pair uniqueness below) | C-2 |
| `apps/api/src/modules/conversations/conversations.service.ts` | `findOrCreateDirect`: wrap INSERT in `try/catch` on unique-violation (23505) → re-SELECT and return existing; add Sentry breadcrumb + PostHog-safe activity already exists | C-2, I-1 |
| `apps/api/src/modules/conversations/conversations.service.ts` | `sendMessage` / `findOrCreateDirect` error paths: `Sentry.captureException` (env-gated) on 5xx-class only; structured Pino via Nest Logger on insert-conflict recovery | I-1 |
| `apps/api/src/modules/users/users.service.ts` | `getMyDiscussions`: append `UNION ALL` branch for personal conversations (`type='personal'`, title = other participant full_name, avatar fields, unread_count real) | I-2 |
| `apps/player-pwa/src/components/matches/PlayerProfileSheet.tsx` | NEW `MessageButton` row (icon `MessageCircle`, brand-green pill) between Follow card and Report; hidden when `isSelf`; mutation → `router.replace('/{locale}/messages/{id}')`; pending spinner; error = localized toast (`errors.generic` + detail) | C-1 |
| `apps/player-pwa/src/hooks/useConversations.ts` | NEW `useStartConversation(targetUserId)` mutation hook wrapping POST /conversations; invalidates `['conversations']` on success | C-1 |
| `apps/player-pwa/src/app/[locale]/(main)/messages/page.tsx` | DM rows: add relative time (reuse DiscussionCard `formatTime` semantics via export or local helper), render avatar image when `avatarUrl` present | M-1 |
| `apps/player-pwa/src/messages/{en,ar}.json` | `profile.messageUser` ("Message" / "رسالة"), `messages.startFailed` (classified error), reuse `errors.*` where possible | C-1 |
| `apps/player-pwa/test/...` | NEW: `PlayerProfileSheet.message.test.tsx` (renders for others, hidden self, navigates on success, localized error on failure); `useConversations.test.ts` (start mutation happy + 409 race path); `discussions` union fixture test if hook-level | M-2 |

## Pair uniqueness design (C-2) — FINAL

All 1:1 conversations have exactly 2 participants; the pair spans two rows in
`conversation_participants`, so a unique expression index there is impossible. Adopted:
**canonical `pair_key` on `conversations`** — the service computes
`least(u1,u2) + ':' + greatest(u1,u2)` (36+1+36 = 73 chars) at insert time; a partial
unique index enforces one conversation per pair at the DB level, closing the double-tap
race atomically (23505 → service re-SELECTs by `pair_key` and returns the existing row).

```sql
-- 0039_conversation_pair_unique.sql (idempotent, staging-verified data first)
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS pair_key varchar(73);
-- backfill from participants (2-member conversations only)
UPDATE conversations c SET pair_key = sub.k FROM (
  SELECT c2.id, MIN(u.id) || ':' || MAX(u.id) AS k
  FROM conversations c2
  JOIN conversation_participants cp ON cp.conversation_id = c2.id
  JOIN users u ON u.id = cp.user_id
  GROUP BY c2.id HAVING COUNT(DISTINCT cp.user_id) = 2
) sub WHERE c.id = sub.id AND c.pair_key IS NULL;
-- dedupe: collapse zero-message duplicates, keep OLDEST (never deletes history)
DELETE FROM conversations c USING conversations c2
  WHERE c.pair_key = c2.pair_key AND c.created_at > c2.created_at
    AND NOT EXISTS (SELECT 1 FROM personal_messages pm WHERE pm.conversation_id = c.id);
CREATE UNIQUE INDEX IF NOT EXISTS conv_pair_unique_idx
  ON conversations (pair_key) WHERE pair_key IS NOT NULL;
```

Non-empty duplicate pairs (if any) would fail the index creation loudly → deploy stops →
manual merge decision. Staging data checked before deploy.

## i18n keys needed

| Key | en | ar |
|---|---|---|
| `profile.messageUser` | Message | رسالة |
| `messages.startFailed` | Couldn't start the chat. Check your connection and try again. | تعذّر بدء المحادثة. تحقّق من اتصالك وحاول مرة أخرى. |

## Risks & mitigations

- **Migration on live staging DB** → idempotent SQL, gap-guarded applier runs it in the
  deploy loop; journal row recorded automatically.
- **Backfill deleting user data** → dedupe only collapses conversations with zero
  messages (verified count first; if any dupes hold messages, stop + report).
- **Route conflict** `(main)/messages/:id` (list page) vs standalone `/messages/[id]`
  (chat) — both already coexist; list links use the standalone route. No change.

## Descoped

Blocking rules, group chat, attachments, typing/reads UI, admin moderation (see 01-product).
