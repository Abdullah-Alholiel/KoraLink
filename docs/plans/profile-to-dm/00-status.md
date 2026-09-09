# Profile → DM — Cycle Status

| Gate | Name | Status | Approved | Artifact |
|------|------|--------|----------|----------|
| 0 | Retrospective | ✅ DONE (autonomous mode) | auto | [00-retro.md](./00-retro.md) |
| 1 | Product Spec | ✅ DONE (autonomous mode) | auto | [01-product.md](./01-product.md) |
| 2 | Architecture | ✅ DONE (autonomous mode) | auto | [02-architecture.md](./02-architecture.md) |
| 3 | Program Design | ✅ DONE (autonomous mode) | auto | [03-program-design.md](./03-program-design.md) |
| 4 | Vertical Slices | 🚧 IN PROGRESS | build-gated | — |

Mode: autonomous ("fully implement... up to standard" = continue in best standard).
Hard gate per slice: `npx turbo run build` + `npx vitest run` green, conventional commit.

## Read receipts (seen state) — added 2026-09-09 after user staging test
The stack already recorded `last_read_at` server-side, but nothing advanced
it on incoming-while-open, and no client cache was told when reads happened →
stale unread dots after reading a chat.

Chain (event order):
1. `join-conversation` (existing) — advances cursor on entry.
2. `mark-read` (new, gateway, commit `f16afc9`) — emitted by
   `useConversationMessages` when a message from the OTHER user arrives while
   the thread is open, and once on unmount. Server: `isParticipant` gate →
   `markRead` → broadcast `dm-read` to `conv:<id>` room.
3. Client zero-caches both `['conversations']` (badge) and
   `['user','me','discussions']` (Messages list) via `zeroCachedUnread`,
   then invalidates to reconcile with the server.

Guard tests: `test/hooks/useConversationReadReceipts.test.tsx` (3).
