# Run #5 Cycle — POTM Realtime Namespace Fix — Gates 1-3 (compact)

## Gate 1 — Product Spec

**Problem:** On the match-detail page, the POTM `pom-decided` realtime event never arrives. The
component connects to the wrong Socket.IO namespace (`/api/v1/lobby` instead of `/lobby`), so the
handshake is rejected and the "winner decided" toast silently never fires. Every other realtime
call site uses the correct helper.

**User story (P1):** As a player viewing a finished match's detail page while POTM voting closes,
I want to see the winner toast the moment it is decided, without manually refreshing.

**Scope:** Replace the raw `io()` call in `PostMatchSection.tsx` with `createLobbySocket()`.
Add a regression test. No backend, schema, adapter, or i18n change (no new user-facing strings —
the `pomDecided` i18n key already exists and is reused).

**Out of scope:** Payment, chat, notifications preferences, settlement math (separate board items).

**Success criteria:** `createLobbySocket()` called on the origin `/lobby` namespace (regression
test asserts URL is `…:3001/lobby`, no `/api/v1`). Build + vitest + type-check green.

## Gate 2 — Architecture

**Data flow (realtime POTM):**
`matches.scheduler.ts` POTM finalize → `RealtimeService.emitPomDecided(room, winner)` →
gateway `/lobby` namespace → `PostMatchSection` socket `pom-decided` handler → invalidate `['pom', matchId]`
→ toast.

**Files changed:**
| File | Change |
|------|--------|
| `apps/player-pwa/src/components/matches/PostMatchSection.tsx` | Swap raw `io()` → `createLobbySocket()`; drop now-unused `io`/`Socket`/`env` imports |
| `apps/player-pwa/test/components/PostMatchSection.test.tsx` | NEW regression test (socket URL = origin `/lobby`) |

## Gate 3 — Program Design (contract)

**TS signature (unchanged public contract):** `PostMatchSection({ matchId, currentUserId, format })`
props identical; `pom-decided` payload shape `{ winner: { fullName: string } }` unchanged.

**The one behavioral contract under test:** the Socket.IO client URL must be
`${origin}/lobby` (never `${origin}/api/v1/lobby`). This is the *only* assertion the regression
test makes.

**i18n:** no new keys (`pomDecided` reused).

### Contract verification checklist

- [x] No mutation endpoint touched — findOne-outside-tx contract unaffected.
- [x] Frontend type (`pom-decided` payload) unchanged; no adapter involved.
- [x] No new user-facing string → no i18n key delta (ar/en parity preserved).
- [x] Socket URL contract pinned by regression test + existing `socket.test.ts` helper tests.
