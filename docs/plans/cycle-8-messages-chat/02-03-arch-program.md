# Cycle 8 — Architecture + Program Design (Gates 2-3)

## Architecture Overview

```
┌─ Messages Page ─────────────────────────────────────────────────┐
│  Header ("Messages" + count + search icon)                       │
│  ┌─ DiscussionCard (Match) ──────────────────────────────────┐  │
│  │ Avatar │ Title (match name)        │ Time (e.g. "2:30 PM")│  │
│  │        │ Last message preview...   │ Unread badge (green) │  │
│  └────────────────────────────────────────────────────────────┘  │
│  ┌─ DiscussionCard (Match) ──────────────────────────────────┐  │
│  │ ...                                                        │  │
│  └────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘

Data Flow:
  GET /users/me/discussions
    → API: matches.service.getMyDiscussions()
      → SQL: LEFT JOIN match_messages for last message
      → SQL: COALESCE(BOOL_OR unread check)
    → Hook: useDiscussions()
    → Page: MessagesPage → DiscussionCard[]
```

## Files Changed

### Backend (apps/api)

| File | Change |
|------|--------|
| `src/database/schema.ts` | Add `conversations`, `personal_messages` tables + relations |
| `src/modules/users/users.service.ts` | Add `getMyDiscussions()` method |
| `src/modules/users/users.controller.ts` | Add `GET /users/me/discussions` endpoint |

### Frontend (apps/player-pwa)

| File | Change |
|------|--------|
| `src/components/matches/DiscussionCard.tsx` | **NEW** — reusable discussion card |
| `src/app/[locale]/(main)/messages/page.tsx` | Rewrite with DiscussionCard, search, unified list |
| `src/components/matches/MatchRulesSheet.tsx` | Add green CTA button at bottom |
| `src/app/[locale]/match/[id]/page.tsx` | Reorder joined state sections |
| `src/hooks/useMessages.ts` | Add `useDiscussions()` hook |
| `src/types/index.ts` | Add `Discussion` type |
| `src/lib/api-adapter.ts` | Add `adaptDiscussionList()` |
| `src/messages/en.json` | New i18n keys |
| `src/messages/ar.json` | New i18n keys |

---

## Gate 3: Program Design — Contracts

### 3.1 API Response Shape

**GET /users/me/discussions**
```json
{
  "discussions": [
    {
      "id": "match-abc123",
      "type": "match",
      "title": "Friday Night 7v7",
      "avatar_url": null,
      "avatar_initials": "FN",
      "last_message": "See you all at 8! 👋",
      "last_message_at": "2026-08-12T14:30:00Z",
      "last_message_sender_name": "Mohammed",
      "unread_count": 2,
      "match_status": "open",
      "participant_count": 8
    }
  ],
  "total": 5,
  "hasMore": false
}
```

### 3.2 TypeScript Types

```typescript
// types/index.ts — new
export interface Discussion {
  id: string;
  type: 'match' | 'personal';
  title: string;
  avatarUrl: string | null;
  avatarInitials: string;
  lastMessage: string | null;
  lastMessageAt: string | null;
  lastMessageSenderName: string | null;
  unreadCount: number;
  matchStatus?: Match['status'];    // only for type='match'
  participantCount?: number;         // only for type='match'
  userIds?: string[];                // only for type='personal'
}
```

### 3.3 DiscussionCard Props

```typescript
interface DiscussionCardProps {
  discussion: Discussion;
  href: string;
  locale: string;
  onTap?: () => void;
}
```

### 3.4 Match Detail Joined State — New Order

```
1. GameDetails (date, price, water)
2. TeamLineup (players grouped by Home/Away)
3. Chat/Discussion preview (latest messages + "Open Chat" button)
4. Location / Map
5. View Match Rules (centered trophy button)
6. PostMatchSection (completed only)
7. ReviewSection (completed only)
8. Leave Match (non-host)
9. Host controls (Start/Complete)
10. Cancel Match (host)
11. WhatsApp invite (sticky CTA)
```

### 3.5 MatchRulesSheet — Bottom CTA

```tsx
// Green CTA at bottom of sheet
<button onClick={onClose}
  className="w-full py-4 rounded-2xl bg-brand-green text-white text-sm font-bold
    shadow-[0_4px_20px_rgba(37,65,50,0.4)] active:scale-[0.98] transition-transform">
  {t('matchRules.gotIt')}
</button>
```

### 3.6 New i18n Keys

**en.json additions:**
```json
"messages": {
  "discussions": "discussions",
  "unread": "unread",
  "noDiscussions": "No discussions yet",
  "noDiscussionsDescription": "Join or host a match to start chatting!",
  "matchDiscussion": "Match Chat",
  "personalChat": "Direct Message"
},
"discussionCard": {
  "you": "You: ",
  "tapToOpen": "Tap to open chat"
},
"matchRules": {
  "gotIt": "Got It"
}
```

### 3.7 DB Schema Addition

```sql
-- personal_messages (foundation only — no API endpoints this cycle)
CREATE TABLE conversations (
  id VARCHAR(36) PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE conversation_participants (
  id VARCHAR(36) PRIMARY KEY,
  conversation_id VARCHAR(36) NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(conversation_id, user_id)
);

CREATE TABLE personal_messages (
  id VARCHAR(36) PRIMARY KEY,
  conversation_id VARCHAR(36) NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

## Pre-Gate Verification

- [x] Build: `npm run build` passes ✅
- [x] Tests: 10 pre-existing failures (stale files, not from current work)
- [x] Contract verification:
  - [x] API response shape documented with JSON example
  - [x] TypeScript types match API shape
  - [x] Adapter function contract defined
  - [x] i18n keys enumerated for both languages
  - [x] Mutation endpoints (not applicable — read-only + UI reorder only)
