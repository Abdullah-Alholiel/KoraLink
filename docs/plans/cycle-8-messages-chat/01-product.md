# Cycle 8 — Product Spec

## Workstreams

### WS-A: Messages Screen + Discussion Cards + Personal Messages Foundation
### WS-B: Match Detail Joined State Reorder + MatchRulesSheet CTA

---

## WS-A: Messages & Discussion Cards

### Problem Statement
The current Messages screen renders match cards (same component as the Play feed) grouped by date. It looks like a "My Games" clone rather than a messaging hub. The attached screenshot shows a proper messaging UI with WhatsApp-style discussion cards that show avatar, name, last message preview, timestamp, and unread indicators. Additionally, there is no infrastructure for personal (direct) messages between users — only match-scoped group chat exists.

### User Stories

| ID | Story | Priority |
|----|-------|----------|
| **A1** | As a player, I want to see my active discussions as clean chat-preview cards so I can quickly resume conversations | P0 |
| **A2** | As a player, I want each discussion card to show the other person's/group's avatar, name, last message preview, and time so I know what's happening at a glance | P0 |
| **A3** | As a player, I want unread message indicators on discussion cards so I know which conversations need my attention | P1 |
| **A4** | As a player, I want to tap a match discussion card and open the chat sheet directly | P0 |
| **A5** | As a developer, I want a scalable `DiscussionCard` component that works for both match group chats and future personal DMs | P0 |
| **A6** | As a developer, I want the `personal_messages` DB table and API foundation in place so personal DMs can be built in a future cycle without schema migrations | P1 |
| **A7** | As a player, I want to distinguish between match discussions and personal messages with different visual treatments | P1 |

### Scope & Boundaries

**IN SCOPE:**
- New `DiscussionCard` component (reusable for both match and personal discussions)
- Restructured Messages screen matching screenshot layout
- Discussion cards with: avatar, title, last message, timestamp, unread badge
- Match discussion → opens ChatSheet
- `personal_messages` DB table + Drizzle schema (foundation, no UI yet)
- `GET /users/me/discussions` endpoint returning unified discussion list
- i18n keys for all new strings

**OUT OF SCOPE:**
- Personal DM UI (chat screen, send, receive) — foundation only
- Online/offline presence indicators
- Typing indicators
- Message read receipts
- Push notifications for personal messages

### Success Criteria
- Messages screen renders `DiscussionCard` components matching screenshot layout
- Tapping a discussion card opens the match's ChatSheet
- `personal_messages` table exists in DB schema
- `npm run build` passes with zero errors
- All 5 UX states handled (loading, empty, populated, error, edge)

---

## WS-B: Match Detail Polish

### Problem Statement
The joined state of the match detail screen shows sections in the wrong order. TeamLineup (the most visually important section — who's playing) is buried after Location, Rules, and Reviews. The screenshot shows TeamLineup immediately after GameDetails. Additionally, the MatchRulesSheet is missing the bottom action button shown in the design.

### User Stories

| ID | Story | Priority |
|----|-------|----------|
| **B1** | As a joined player, I want to see the team lineup immediately after match details so I know who I'm playing with | P0 |
| **B2** | As a joined player, I want the discussion/chat area prominently placed so I can communicate with teammates easily | P0 |
| **B3** | As any user, I want a clear "Got it" button at the bottom of the rules sheet so I can dismiss it intuitively | P0 |

### Scope & Boundaries

**IN SCOPE:**
- Reorder joined state sections: GameDetails → TeamLineup → Chat/Discussion → Location → View Rules → Leave/Host actions
- Add green CTA button at bottom of MatchRulesSheet ("Got It" / close action)
- Keep pre-join state unchanged

**OUT OF SCOPE:**
- Pre-join state layout changes
- New sections or features on match detail
- Animation changes

### Success Criteria
- Joined state sections are in the specified order
- MatchRulesSheet has a green CTA button at bottom that closes the sheet
- Pre-join state unchanged and functional
- `npm run build` passes with zero errors

---

## Open Questions for Gate 2

1. Should the `discussions` endpoint combine match chats AND personal conversations in one unified list, or serve them separately?
   - **Decision: Unified list** — one `GET /users/me/discussions` returns both, with a `type: 'match' | 'personal'` discriminator.
2. Should the `personal_messages` table use a `conversation_id` approach (many messages → one conversation) or a sender/receiver pair approach?
   - **Decision: conversation-based** — `conversations` table (participants) + `personal_messages` table (belongs to conversation). More scalable for group DMs later.
3. Should last message preview be cached on the match/conversation row, or computed via subquery?
   - **Decision: Denormalized cache** — add `last_message_at` and `last_message_preview` columns to matches (and conversations). Updated on every message send. Avoids N+1 subqueries.

## Risks
- **R1:** Adding DB columns requires migration — ensure backward compatibility
- **R2:** Unified discussion endpoint may have performance implications — add pagination
- **R3:** Personal messages foundation adds schema complexity without immediate UI payoff — keep minimal (just tables, no API endpoints for personal yet)
