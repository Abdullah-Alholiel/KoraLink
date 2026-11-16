# P1-53 User-to-user block — Program Design (Gates 1–3 compact, run #100)

## Problem (Gate 1)
A player can REPORT a harassing co-player (P1-31) but cannot BLOCK them: messages keep arriving,
rosters keep pairing them. Harassment vector in a social sports product with DMs + match chat.

## User stories
- P0: As a player, I can block a user from their profile sheet → they can't DM me and can't see
  my profile; existing conversations stop accepting new messages from them.
- P0: As a blocked player, I get a clear localized error when I try to DM the blocker.
- P1: As a player, I can see + unblock my blocked list (profile section, v1.1 — parked).
- OUT OF SCOPE v1: match-roster filtering (blocked pairs can still share a match roster — owner
  call later), mute (softer variant, parked), block shortcut inside ReportSheet (v1.1).

## Architecture (Gate 2)
- New table `user_blocks` (blocker_id, blocked_id, created_at; PK (blocker_id, blocked_id);
  both varchar(36) FK→users ON DELETE CASCADE). Migration 0045_user_blocks.sql (hand-written,
  journal-appended, run-#39 convention).
- API module: `apps/api/src/modules/users/` (blocks live next to user domain):
  - `POST /users/me/blocks` { blockedId } → 201 BlockDto
  - `DELETE /users/me/blocks/:blockedId` → 200 { blocked: false }
  - `GET /users/me/blocks` → BlockDto[] (v1.1 UI; endpoint ships now, cheap)
  - `GET /users/me/blocks/status/:userId` → { blocked: boolean } (profile-sheet state)
- Enforcement (v1 core): `conversations.service.ts` sendMessage + `matches.service.ts`
  sendDm-equivalent path throw 403 `BLOCKED_BY_RECIPIENT` when recipient blocks sender (or vice
  versa — mutual silence). getPublicProfile 404s soft-deleted only (unchanged); blocked-profile
  hiding = v1.1 (needs careful roster implications).

## Contracts (Gate 3 — exact shapes)
```json
// POST /api/v1/users/me/blocks  body {"blockedId":"<uuid36>"}
201 {"blockedId":"…36…","createdAt":"2026-10-04T01:30:00.000Z"}
// DELETE /api/v1/users/me/blocks/:blockedId
200 {"blocked":false}
// GET /api/v1/users/me/blocks
200 [{"blockedId":"…","createdAt":"…"}]
// GET /api/v1/users/me/blocks/status/:userId
200 {"blocked":true}
// DM from blocked sender → 403 {"message":"You can no longer message this user.","error":"BLOCKED_BY_RECIPIENT"}
```
- TS: `blocks.service.ts` methods return typed DTOs (no bare rows).
- i18n keys (EN+AR, both locales, parity asserted): `profile.blockUser`, `profile.unblockUser`,
  `profile.blocked`, `blocks.title`, `blocks.empty` (v1.1), `errors.blockedByRecipient`,
  `errors.blockFailed`, `errors.unblockFailed`, toast `blocks.blockSuccess` / `blocks.unblockSuccess`.
- Frontend hook: `useBlocks.ts` — useBlockStatus(userId) {blocked, isLoading}, useBlockUser(),
  useUnblockUser() mutations with localized onError toasts (error-message standard: what/why/next).

## Contract verification checklist (Gate 3)
- [x] Mutations return fully-shaped DTOs (block returns BlockDto; unblock explicit {blocked:false})
- [x] Frontend types accept exact JSON (BlockStatusApi / BlockDto in useBlocks.ts)
- [x] Adapters: none needed (snake→camel handled in service response mapping, single shape)
- [x] No silently-undefined fields (status endpoint always returns {blocked: boolean})
- [x] i18n keys listed for every user-facing string, both languages
- [x] 403 machine code BLOCKED_BY_RECIPIENT rides PWA classifyError code-first path (P1-47 pattern)

## Slice plan (Gate 4)
1. Lane (zeroshot): DB migration 0045 + schema table + blocks.service + blocks.controller +
   sendMessage enforcement + jest suite (~8 cases: block/unblock/status/dedup/self-block 400/
   missing-user 404/blocked-DM 403/mutual-block). Lane delivers UNCOMMITTED diff; parent commits.
2. Parent: PWA half — useBlocks.ts hooks + PlayerProfileSheet Block/Unblock action (with the
   Reviewer-A aria-label minor fixed in the same file) + i18n 8 keys ×2 + vitest cases.
3. Parent: ChatSheet history-load error state (Reviewer A IMPORTANT — separate tiny commit).
4. PR flow: lane branch → PR → 4 bot checks → triage PR-Agent → squash. PWA half rides same
   branch after lane lands (or second PR if timing splits).
