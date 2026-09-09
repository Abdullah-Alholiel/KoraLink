# Gate 0 — Retrospective: User→User Messaging (Profile → Message → 1:1 DM)

Cycle: 2026-09-09 · Baseline: `eea7e96` (staging) · Auditor: Lead Agent

## 1. Environment snapshot

- Branch `staging`, HEAD `eea7e96`. gh auth ✓ (Abdullah-Alholiel). Node v22.23.2, npm 12.0.2.
- Pre-existing tree drift (NOT mine, left untouched): `docs/plans/player-host-responsibility/{02,03}` modified, untracked `.local/`, `scripts/verify-pr16-overflow-flow.mjs`. Committed via explicit paths only.

## 2. What already exists (audit result)

The DM stack is **already built end-to-end** from earlier cycles — this cycle closes the remaining gaps:

| Layer | Artifact | Status |
|---|---|---|
| Schema | `conversations`, `conversation_participants` (pair-unique idx? → no, see F-1), `personal_messages` + `client_message_id` unique partial index, both relations directions | ✅ |
| API | `conversations.controller` (POST find-or-create, GET list, GET/POST messages) | ✅ |
| Service | `findOrCreateDirect` (self-403, find-then-insert), `listForUser` (LATERAL last msg + unread), `listMessages` (paginated, DESC+reverse), `sendMessage` (SELECT-before-INSERT idempotency + unique-index race recovery + skip side effects), `markRead`, `assertParticipant` (403) | ✅ |
| WS | `join-conversation` / `send-dm` / `leave-conversation` with `isParticipant` gate + `markRead` on join + rate-limit service; `server.to(room)` echo includes sender | ✅ |
| Activity/Push | `messaged` verb; offline web-push, `chat` category mute gate (P0-5) | ✅ |
| PWA list | `(main)/messages/page.tsx` — Direct Messages section (avatar/initial, name, last msg, unread) + grouped match discussions | ✅ |
| PWA chat | `[locale]/messages/[id]/page.tsx` — history, optimistic send, per-message `sending/failed` + retry, report overflow, markRead via join | ✅ |
| Hooks | `useConversations` (optimistic + reconcile + REST fallback), `useMessages.useDiscussions` | ✅ |
| Badge | `BadgeHydrator` sums unread → `setMessagesBadge` → BottomNav badge | ✅ |

## 3. Findings

### CRITICAL

- **C-1 · Missing entry point (the actual ask).** `PlayerProfileSheet` (the only public user
  profile surface, used from match roster) renders Follow + Report but **no Message
  action**. A user cannot start a 1:1 conversation from a profile. Dead-end violates the
  "dead interactive elements" audit rule in reverse: the *feature* exists but is
  unreachable.
- **C-2 · Find-or-create race → duplicate conversations.** `findOrCreateDirect` is
  SELECT-then-INSERT with **no pair-level unique constraint** on
  `conversation_participants`. A double-tap on the new Message button (or two tabs)
  creates TWO 1:1 conversations for the same pair; `listForUser` then shows the same
  person twice. Adding the button makes this race reachable from the UI for the first
  time — must fix in the same cycle.

### IMPORTANT

- **I-1 · Observability absent on conversations module.** No Sentry capture /
  PostHog event on conversation create / message send failure paths (AGENTS.md §4
  mandate for new features; module predates the standard). Add minimal, env-gated.
- **I-2 · `getMyDiscussions` does not UNION personal conversations.** The unified
  discussions endpoint (skill reference designed exactly for this) still only returns
  match chats; the messages page compensates by rendering two sections. In-scope fix
  keeps the page contract (`Discussion[]`) intact.

### MINOR

- **M-1 · DM list rows lack time + avatar handling parity with DiscussionCard.** The
  hand-rolled rows in `(main)/messages/page.tsx` don't show relative time and don't
  render `avatarUrl` (initial-letter only). Cosmetic standardization.
- **M-2 · No automated coverage** for conversations hooks/components (no test files).
  Add colocated tests for the new button + hook; do not block on backfilling the
  whole module.

## 4. User-story cascade

- C-1 → "click a user profile → click message → chat opens" is impossible today; the
  Messages tab shows only conversations created by... nothing (no UI entry).
- C-2 → after shipping C-1, double-tap produces ghost conversations; user confusion,
  split history. Ship both or neither.

## 5. Fix:feat ratio & prior-cycle debt

`git log --oneline -15`: mostly `feat`/`docs` + targeted `fix` commits; run #46
release verified (16dc206 prod). No reactive fix loop. Proceed to Gate 1: **YES**.
