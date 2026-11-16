# Run #132 Cycle — Lobby Chat Backfill (P2-196) · Guard-Parity (P2-202) · PWA Review Fixes

## 00-retro.md — Gate 0 (autonomous mode)

**Baseline:** 3e9d59a (PR #129, run #131) → HEAD c867a19 (docs).

**Recent commit pattern (last 10):** fix:feat ratio ≈ 1:3 (63a0b5e fix / 8cf6746 feat /
3e9d59a fix / 7da2b0c+e3aadab-era docs) — healthy, no reactive fix loop.

**Area audit (chat/realtime — what P2-196 touches):**
- `apps/api/src/modules/gateway/app.gateway.ts` — join-lobby :293 membership-gated (P0-1),
  send-message :343 with clientMessageId idempotency, fan-out `new-message` :462 to
  `match:<id>` room. WS handlers carry the same moderation gate as REST (P1-48). No gaps.
- `apps/api/src/modules/matches/matches.service.ts` `getMessages` :2596 — REST history
  with `before` keyset (P1-3, run #65): anchor-row validation (unknown/cross-match → 404),
  limit clamp [1,100], DESC-probe→ASC window. **No `after` direction** — a reconnecting
  client cannot fetch what it missed; this is exactly the P2-196 gap.
- `apps/player-pwa/src/hooks/useMessages.ts` `useMatchChat` :165 — REST history probe
  (PAGE+1 hasMore signal), `loadOlder` keyset walk, optimistic send + reconcile by
  client_message_id, shared-socket subscribe at :287. On socket **reconnect** (`connect`
  fires again after a drop), the room re-joins but **no fetch fills the silent gap** —
  messages sent while away appear only after a manual reopen. Confirms the board row.
- Tech debt noted: `RescheduleSheet.tsx:64/:73` hardcodes `ar-SA` (Hijri) — Reviewer A
  run #132 IMPORTANT (P2-189 follow-through miss); verify-page countdown renders Western
  digits in AR (Reviewer B); match/[id] icon-only share controls have no aria-label
  (Reviewer B). All three → review-fix batch item this run.
- Guard-parity debt: `admin/venues.service.ts` update :189 and `admin/pitches.service.ts`
  update :130 run unguarded UPDATE → 0-row no-op is silently audited as a change.
  Disputes/reports got the predicated-update pattern (P2-191/192); venues/pitches were
  left out (no version column, no state machine → the parity needed is 0-row detection
  only). → P2-202.

**DECISIONS.md consulted:** no design/UX decision in this cycle contradicts the ledger
(no drawer/menu/RTL-layout changes; the RTL arrow rule is *complied with*, not changed).

**Full-stack connectivity (spot):** store→page n/a; hook→API: useMatchChat targets
`/matches/:id/messages` (matches.controller :170 — correct, authenticated, members-only);
page→user: ChatSheet wired from match detail :1099 + DiscussionCard; DB→API: match_messages
id/created_at composite keyset already indexed (P1-3 migration).

**ADMIN STATE CHECK:** clean tree in apps/admin + partner/admin API modules (0 dirty
files); last admin commit ebd9fd4 (P2-192); service active; dashboard routes unchanged.
No hold. P2-202 targets admin API modules → allowed.

**Verdict:** proceed to Gate 1/2/3 (compact below). Items: P2-196 (user-visible pick),
P2-202 (hardening), review-fix batch (PWA lane, reviewer findings).

## 01-program-design.md — Gates 1-3 compact

### Item 1 — P2-196 lobby backfill + "new while away" marker

**Problem:** on socket reconnect (network drop, background tab), lobby chat shows a silent
gap — messages sent while away render only after reopening the sheet, with no marker.

**User story:** as a player in a match lobby, when my connection drops and recovers, I
want the messages I missed to load automatically with a "new while you were away" divider,
so I never unknowingly skip lobby chatter.

**Scope:** IN — API `after` keyset cursor on GET /matches/:id/messages; hook backfill on
socket reconnect; inline divider marker (EN+AR). OUT — DM conversations (already has
P2-188 retry), push notifications, read-watermark changes, server-side presence.

**API contract (Gate 3):**
- `getMessages(matchId, viewerId?, opts: { before?, after?, limit? })`
- `after` mirrors `before` exactly: anchor row read; unknown or cross-match cursor →
  `NotFoundException('Unknown message cursor.')`; keyset **strictly newer** in
  (created_at, id); ASC order; same limit clamp [1,100]; bare-array response unchanged.
- Both cursors at once → `BadRequestException('Use either before or after, not both.')`
  (404-anchor semantics stay single-direction; dual-cursor windows are out of scope).
- Controller: `@Query('after') after?: string` passed through.
- JSON shape unchanged (MatchMessage[] with user relation) — zero frontend type drift.

**PWA contract:**
- `useMatchChat` gains: on `connect` event, if we already hold ≥1 server message, fetch
  `/matches/:id/messages?after=<lastServerMessageId>&limit=100` and `reconcile()` each
  returned message (dedupe by server id is already inside reconcile). Skipped on first
  connect (initial REST history probe already covers it) — only when
  `hadServerMessagesRef.current` is true. Short/empty page → nothing to mark.
- `missedCount` state: number of genuinely-new messages merged by a reconnect backfill
  (ids not previously seen). Exposed from the hook; ChatSheet renders a divider chip
  above the first backfilled message: `messages.newWhileAway` ("N new while you were
  away" / "‏N جديدة أثناء غيابك"), cleared when the user sends a message or taps the chip.
  (Positioning: marker rendered once, above the first missed message in the merged list.)
- i18n keys (BOTH locales): `messages.newWhileAway` = "New while you were away: {count}"
  EN / "{count} جديدة أثناء غيابك" AR. Parity guard: en=ar key counts stay equal.

**Contract checklist:** mutation contract n/a (read-only endpoint); frontend types
accept the exact JSON (unchanged shape); adapter n/a (hook consumes fetcher directly,
established pattern); i18n keys added to BOTH locales before build.

**Tests:** extend `matches.chat-pagination.spec.ts` (after pages strictly newer; unknown
cursor 404; cross-match cursor 404; both-cursors 400; limit clamp with after). PWA: hook
test for reconnect backfill (mock rt + fetcher) + ChatSheet divider render test.

### Item 2 — P2-202 venues/pitches guard-parity

**Problem:** `admin/venues.service.ts:189` + `admin/pitches.service.ts:130` UPDATE with no
rowcount check — an id that vanished between `before`-read and UPDATE yields a silent
no-op that still lands in the audit log as a change.

**Fix:** `.returning({ id: ... })` on both updates; empty result → `NotFoundException`
(immediate, before audit.log). No version column / no state machine on these tables —
0-row detection IS the parity (P2-191 predicated-update pattern, reduced form).

**Tests:** extend/extend-adjacent admin service specs: update on missing id → 404 and
audit.log NOT called.

### Item 3 — PWA review-fix batch (Reviewer A+B run #132 findings)

1. RescheduleSheet: `ar-SA`→`resolveDateLocale(locale)` at :64/:73 (Hijri→Gregorian parity).
2. verify/page.tsx:446 countdown → `formatCount(resendCountdown, locale)`.
3. match/[id]/page.tsx: aria-labels on icon-only share controls (WhatsApp :731 + hero
   share :323) with new i18n keys `matchDetail.whatsAppShareAria` / `matchDetail.shareAria`
   in BOTH locales.

## 00-status.md

| Gate | Name | Status | Approved | Artifact |
|------|------|--------|----------|----------|
| 0 | Retrospective | ✅ DONE (autonomous) | cron | this file |
| 1-3 | Compact program design | ✅ DONE (autonomous) | cron | this file |
| 4 | Vertical slices | IN PROGRESS | — | PRs this run |
