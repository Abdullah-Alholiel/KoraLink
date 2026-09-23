# Run #50 — Program Design (compact Gates 1-3)

## Problem (Gate 1)
Three PWA render paths call `new Date()`/`Date.now()` directly — violating the project's
hydration-safety convention (useNow, run #40/#49) — and the SW registration fires from a
library-injected script with no error handling, so any registration failure (old browser,
enterprise CSP) surfaces as an unhandled-rejection Sentry event instead of a silent degrade.

User stories:
- As a player, wallet transaction groups / chat date dividers / club date labels must never
  flash a wrong "Today" because my device clock disagreed with the server at hydration time.
- As an operator, a user whose browser blocks SW registration must simply not get offline
  support — never a Sentry error event.

Scope: IN — the three render paths (P2-59); SW registration hardening (P2-60) incl. vitest.
OUT — admin minors (P2-61, deferred per retro); offline content fallback (P2-57); SWR recipes.

## Architecture delta (Gate 2)
No API/DB changes. Three PWA components + one SW-mount component + next.config.mjs flag.
Pattern (identical to run #49 messages fix): component computes `nowMs = useNow() ?? 0`,
passes it into the pure grouping/formatting helpers as a parameter; helpers never touch the
clock. Pre-mount posture: `null → 0` buckets everything as "Earlier"/"older" on the very first
client render only (server HTML shows nothing — all three surfaces render data post-fetch —
so no visible flash).

## Contracts (Gate 3)
No API shapes change. TS signatures:

```ts
// wallet/page.tsx
function groupTransactionsByDay(transactions: Transaction[], t, nowMs: number): Group[]
// ChatSheet.tsx
function groupMessages(messages: MatchMessage[], t, locale: string, nowMs: number): Group[]
function getDateGroup(dateStr: string, now: Date): string   // unchanged, now fed by new Date(nowMs)
// clubs/[id]/page.tsx
function formatDateLabel(date: Date, t, locale: string, nowMs: number): string
```

ServiceWorkerUpdater (existing mount, root layout):
```ts
// NEW: owns registration (next-pwa register:false)
useEffect(() => {
  navigator.serviceWorker.register('/sw.js', { scope: '/' })
    .then((reg) => { /* updatefound wiring unchanged */ })
    .catch((err) => captureError(err, { scope: 'swRegister' })); // never unhandled
}, []);
```
i18n: none needed (no new user-facing strings — labels already localized).

## Slice B — P2-58 match-discussion unread parity (added mid-run, takeover)

### Problem
`getMyDiscussions` hardcodes `unread_count = 0` for match-type rows (users.service.ts:289) —
only personal conversations count unread. Users miss new match-chat messages. There is NO
read watermark for match chats: `last_read_at` exists only on `conversation_participants`
(schema.ts:806), and match chats have no mark-read path at all (personal has WS `mark-read`
+ `conversationsService.markRead`).

### Architecture delta
- `match_players.last_read_at timestamptz` (nullable) — per-user, per-match-EPISODE watermark
  (roster-row-scoped, so a leave→rejoin naturally restarts the watermark — mirrors the
  fee_paid_sar episode convention).
- `getMyDiscussions` match branch: `unread_count` = COUNT(match_messages mm WHERE mm.match_id =
  m.id AND mm.user_id != my.user_id AND mm.created_at > COALESCE(my.last_read_at, epoch))
  — same shape as the personal branch (:319-324). Response mapping unchanged (`unread_count`
  already flows through the snake→camel mapper at users.service.ts:364).
- `matchesService.markChatRead(userId, matchId)`: membership-checked (mirror getMessages P0-1
  guard) watermark UPDATE. Return `{ ok: true }` (void-equivalent write; no findOne contract —
  not a resource mutation with a canonical read model).
- Routes: `POST /matches/:id/messages/read` (REST fallback) + WS `mark-chat-read` handler
  (membership-checked like send-message; advances watermark; NO broadcast — read state is
  private, unlike messages).
- PWA `useMatchChat`: emits mark-read when the sheet is open (matchId flips null→id) and on
  every reconcile (new message while reading), WS-primary / REST-fallback; invalidates
  `['user','me','discussions']` so the badge clears live.

### Contracts (Gate 3)
- TS: `markChatRead(userId: string, matchId: string): Promise<{ ok: true }>`
- WS payload: `{ matchId: string }` → void ack; unauthorized/garbage → WsException (same as
  join-lobby/send-message membership checks).
- HTTP: 200 `{ ok: true }`; 403 not-a-member (getMessages contract parity); 404 unknown match
  surfaces through the membership miss.
- i18n: zero new keys (badge rendering already exists — DiscussionCard:80-83).
- Migration: hand-written `0041_match_chat_read_watermark.sql` (0030+ convention, journal-
  appended, `when` = fresh Date.now() so it sorts above the live newest 1788963406695; no
  snapshot json). Code + migration commit TOGETHER; db:migrate only after gates green.

### Gate 3 checklist
- [✓] No response-shape change — match rows gain a real unreadCount under the existing field.
- [✓] Watermark is per-episode (roster row), never `{matchId}-{userId}` derived.
- [✓] Membership enforced on BOTH new entry points (REST + WS) — no WS-bypasses-REST repeat.
- [✓] No broadcast of read state; no i18n surface; 5-UX-states unaffected.
- [✓] `COALESCE(my.last_read_at,'epoch')` — first-ever count = all others' messages (matches
      personal-branch semantics :323).

## Gate 3 contract verification checklist (slice A)
- [✓] No API endpoint/response changes — N/A (frontend-only cycle).
- [✓] Helper signatures typed explicitly above; `nowMs: number` threaded from the single
      `useNow()` call per component; helpers stay pure (no clock reads inside).
- [✓] No field silently undefined for consumers: grouping output shape unchanged
      (`{ label, items|messages }[]`).
- [✓] i18n: zero new keys — existing `wallet.today/yesterday/earlier`, `messages.today/...`,
      `clubs.today/tomorrow` reused.
- [✓] P2-60: `register: false` in next.config.mjs + guarded register in the already-mounted
      ServiceWorkerUpdater; `captureError` from ObservabilityProvider (AGENTS.md §4);
      dev builds unaffected (`disable: process.env.NODE_ENV === 'development'` keeps SW off).
