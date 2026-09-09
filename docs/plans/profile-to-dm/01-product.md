# Gate 1 — Product Spec: User→User Messaging (Profile → Message)

## Problem statement

Players cannot message each other. The entire 1:1 messaging stack exists (conversations
API, WebSocket delivery, Messages tab, chat screen) but there is no way to *start* a
conversation: tapping a player's profile shows Follow and Report, no Message action.
Messaging is a dead feature until the entry point exists.

## User stories

- **P0 · US-1** — As a player, on another player's profile I tap **"Message"** and land in
  a 1:1 conversation with them (existing conversation reopens; new one created once).
- **P0 · US-2** — As a player, my conversation appears in Messages with the person's
  name/avatar, last message preview and unread count; tapping it opens the chat.
- **P0 · US-3** — As a player, my messages deliver in real time; if offline the message
  shows "failed · tap to retry" and retry never duplicates (idempotent).
- **P1 · US-4** — As a player, I get a push notification when a DM arrives while the app
  is closed, and the Messages tab badge shows my total unread. *(already built — verify
  only)*
- **P1 · US-5** — As a player, my DM list shows recent personal chats and match chats in
  one screen, personal chats on top when most recent. *(standardization: include personal
  conversations in the unified discussions feed)*
- **P2 · US-6** — As a player I cannot message myself; the Message action never renders on
  my own profile.

## Scope

**IN:** Message button on PlayerProfileSheet (hidden on own profile); find-or-create
dedupe (pair-level uniqueness + migration); PostHog/Sentry instrumentation; personal
conversations merged into `GET /users/me/discussions`; DM row polish (relative time);
colocated tests; EN+AR i18n.

**OUT:** blocking/report-based DM permission rules; group chats; media attachments;
message deletion/edit; typing indicators; read receipts in UI (data exists,
rendering descoped); admin console DM moderation.

## Success criteria

1. From match roster → tap player → tap Message → chat opens with that user (≤2 taps).
2. Back on Messages tab: conversation listed once with correct preview; double-tap on
   Message creates exactly one conversation (E2E probe: two rapid POSTs → same id).
3. Sending works on staging PWA↔API (real browser, two seeded users, WS echo verified).
4. Offline send → failed state + retry succeeds; retry idempotency proven (same
   client_message_id → one row).
5. `npx turbo run build` + `npx vitest run` green; i18n parity EN=AR for all new keys.
6. PostHog receives `dm_started` (create) and `dm_message_sent` (send) events on staging.

## Open questions → resolved by convention

- Blocking abusive users? Out of scope; Report already exists on the profile sheet.
- Where else to surface Message (leaderboards, feed)? Only PlayerProfileSheet this cycle
  (the single existing public-profile surface); extend later when more surfaces exist.

## Risks

- Migration on staging DB must be gap-guarded (deploy script handles; 0039 next).
- WS + REST parity already proven by existing module; no new wire shapes beyond the
  discussions union (discriminated on `type` already).
