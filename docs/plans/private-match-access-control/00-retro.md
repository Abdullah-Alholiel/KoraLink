# Cycle: private-match-access-control — Gate 0 Retrospective

**Run:** factory #1 (2026-08-26) · **Board item:** P0-1 · **Status:** autonomous mode, no approval pauses

## What this cycle touches

`apps/api/src/modules/matches/matches.service.ts`, `matches.controller.ts`;
`apps/player-pwa/src/app/[locale]/match/[id]/page.tsx`, i18n `ar.json`/`en.json`.

## Audit of the area (evidence)

1. **Security model is inconsistent across layers** — the WS layer enforces membership on every
   chat path, the REST layer enforces it on writes but NOT reads:
   - WS `join-lobby` membership check ✅ (app.gateway.ts:154-165)
   - WS/REST `sendMessage` membership check ✅ (matches.service.ts:806-830)
   - REST `GET /matches/:id/messages` — **NO check** (matches.controller.ts:149-153 → service
     `getMessages(matchId)` takes no userId, matches.service.ts:781)
   - REST `GET /matches/:id` — **NO check**, and returns the full `messages` relation inline
     (matches.service.ts:322-378; relation at :356-368) → any authenticated user reads any
     match's entire chat, public or private.
2. **Private-match product model** (create-match.dto.ts:68): "private matches are only
   accessible via the invite link" — i.e. **unlisted**: detail view + join by ID for link
   holders is BY DESIGN (there is no token; `joinMatch` takes only the matchId).
   → Metadata access for link holders is not the leak; **chat is**.
3. `findOne` has 7 internal post-mutation callers (matches.service.ts:483,559,718,942,1001,
   1102,1249) + `GET /:id/calendar` (matches.controller.ts:64) — signature change must be
   backward-compatible (optional viewer param).
4. PWA: `useMatchMessages` hook (useMatches.ts:142-152) feeds ChatSheet; ChatSheet renders
   error state (ChatSheet.tsx:169-175) — a 403 renders gracefully. The mid-page discussion
   card opens ChatSheet with **no membership gate** (page.tsx:425-432) while the header
   button gates on `isJoined` (page.tsx:277-286).
5. `adaptMatchDetail` already tolerates `messages: []` (`detail.messages ?? []`,
   api-adapter.ts:380) → stripping chat server-side for non-members cannot crash the client.
6. Recent commits in this area: `b719de5` (spots counting), `23d8c61` (socket namespace),
   `19d610c` (HTTPS cutover). No in-flight conflicts; tree clean apart from sibling
   graphify-out edits (never staged).

## fix:feat ratio check

Last 8 commits: 4 feat / 3 fix / 1 docs — healthy (< 1.5:1).

## Verdict

Proceed to Gates 1-3 (see `01-program-design.md`). Scope: enforce members-only chat on REST
reads (align REST to WS), keep invite-link detail access, gate the PWA discussion card.
