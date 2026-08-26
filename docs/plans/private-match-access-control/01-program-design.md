# Cycle: private-match-access-control — Program Design (Gates 1-3 compact)

**Run:** factory #1 · **Board item:** P0-1 · Autonomous mode — Gate 3 checklist executed below.

## Problem

Any authenticated user can read any match's entire chat history (public or private) via
`GET /matches/:id/messages` and via the `messages` relation embedded in `GET /matches/:id`.
The WS layer already enforces membership on every chat path — REST reads must match.

## User story

As a player in a match lobby, my chat must be readable only by match members (the same rule
the realtime layer already enforces). As an invite-link holder, I can still view a private
match's details and join it.

## Scope

**IN:** members-only chat on REST reads (`findOne` viewer-scoped message stripping,
`getMessages` membership check); `GET /:id/calendar` visibility scoping (soft: keep working
for link holders — it leaks only date/title/venue, which the invite link already discloses;
hardening deferred); PWA membership-gates the discussion card + comments preview;
i18n keys; jest unit specs for the new service logic.

**OUT (recorded, not built):** invite tokens (product change, needs Abdullah), full ACL on
match metadata, chat pagination (P1-3), payment provider (P0-2), 401 vs 403 e2e suite.

## Architecture delta

```
Controller GET /matches/:id           ── now passes @CurrentUser().sub as viewer
Controller GET /matches/:id/messages  ── now passes @CurrentUser().sub as viewer
MatchesService.findOne(id, viewer?)   ── NEW optional param; internal callers unchanged
MatchesService.getMessages(id, viewer)── viewer required from controller path
PWA match page                        ── discussion card + preview gated on isJoined
```

Service internals: `findOne` loads the row (existing query), then if `viewer` provided and
viewer is NOT a member → `match.messages = []` before returning. `getMessages` runs the same
membership probe (one indexed `match_players` lookup) and throws `ForbiddenException` if not
a member. No schema change, no migration.

## Gate 3 — Exact contracts

### `GET /matches/:id` — response shapes (unchanged envelope; only `messages` varies)

Member/host viewer (or internal call):
```json
{ "id": "…", "title": "…", "visibility": "public", "status": "Open", "players": [ … ],
  "messages": [ { "id": "…", "match_id": "…", "user_id": "…", "content": "…",
    "created_at": "2026-08-26T12:00:00.000Z", "user": { "id": "…", "full_name": "…", "avatar_url": null } } ],
  "host": { … }, "pitch": { … } }
```

Non-member viewer (public OR private match):
```json
{ "id": "…", "title": "…", "visibility": "public", "status": "open", "players": [ … ],
  "messages": [], "host": { … }, "pitch": { … } }
```

### `GET /matches/:id/messages`

Member: `200` → array (same element shape as above), newest last.
Non-member: `403` → `{ "message": "You are not a member of this match.", "error": "Forbidden", "statusCode": 403 }`

### TypeScript signatures

```ts
// matches.service.ts
async findOne(matchId: string, viewerId?: string): Promise<MatchDetailRow>
async getMessages(matchId: string, viewerId?: string): Promise<MatchMessageRow[]>
```

### PWA changes

`match/[id]/page.tsx`: discussion card (line ~425) — render only when `isJoined`; comments
preview section — same gate. i18n keys added to both `ar.json` and `en.json`:

```json
"matchDetail": { "joinToChat": "Join the match to see and send messages." }
```
ar: `"انضم إلى المباراة لرؤية الرسائل وإرسالها."`

## Gate 3 contract verification checklist (explicit)

- [x] Every mutation endpoint returns a fully populated object with relations — **no
      mutations touched**; join/leave/start/complete/cancel already compliant (retro §1).
- [x] Frontend types (`MatchDetailApi`) can accept the exact JSON the backend produces —
      backend only **removes** optional `messages` content (→ `[]`); adapter has
      `detail.messages ?? []` (api-adapter.ts:380) + `buildComments([])` → `[]`. ✅
- [x] Adapter functions exist for every consumed shape — no new shapes; `useMatchMessages`
      consumes `MatchMessageApi[]` unchanged.
- [x] No field silently undefined — `messages` becomes `[]`, never undefined; every other
      field identical.
- [x] i18n keys exist in BOTH languages — `matchDetail.joinToChat` added to ar.json + en.json
      (verified after edit via key-count parity check).
- [x] Internal `findOne` callers unaffected — 7 call sites pass no viewer → full detail,
      unchanged behavior.
- [x] WS paths already compliant — no gateway changes needed.
