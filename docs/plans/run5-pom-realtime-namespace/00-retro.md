# Run #5 Cycle — POTM Realtime Namespace Fix — Gate 0 Retrospective

**Cycle dir:** `docs/plans/run5-pom-realtime-namespace/`
**Baseline commit:** `b5e2618` (graphify refresh, run #4)
**Date:** 2026-08-27T14:4xZ

## What this cycle touches

`apps/player-pwa/src/components/matches/PostMatchSection.tsx` — the POTM (Player of the
Match) section on the match-detail page. Its realtime `pom-decided` listener connects a
Socket.IO client with a raw `io()` call instead of the shared `createLobbySocket()` helper.

## Audit of the exact area

- `src/lib/socket.ts` (the canonical helper) documents the bug verbatim in its header comment
  (lines 11-20): *"socket.io treats the URL pathname as the namespace while engine.io always
  connects to `<origin>/socket.io`. Appending `/lobby` to a pathful base (`…:3001/api/v1`)
  therefore targets the nonexistent namespace `/api/v1/lobby` — the gateway rejects the
  handshake with 'Invalid namespace' and realtime silently dies."* Proven live 2026-08-26 via
  `scripts/ws-namespace-probe.mjs`.
- `socketBaseUrl()` (socket.ts:25-32) strips the path from `NEXT_PUBLIC_API_URL` (falls back to
  `http://localhost:3001`); `createLobbySocket()` (socket.ts:44-59) connects to
  `${socketBaseUrl()}/lobby` and is the single source of truth for the option block.
- 5 of 6 call sites already use `createLobbySocket()`: `NotificationProvider.tsx:53`,
  `useMessages.ts:155`, `useMatches.ts:108`, `useConversations.ts:181`, `socket.ts:50`.
- **The 6th call site — `PostMatchSection.tsx:44-50` — is the outlier**: it does
  `io(\`${env.NEXT_PUBLIC_API_URL ?? ''}/lobby\`, { path: '/socket.io', ... })`. With the
  default/pathful base (`http://localhost:3001/api/v1`, confirmed in `env.mjs:12` default and
  the deployed `.env.local`), this resolves to namespace `/api/v1/lobby` → handshake rejected →
  `pom-decided` winner toast never arrives while a user is viewing the match detail page.

## fix:feat ratio

Last 15 commits are feature/docs/fix mixed; no reactive fix loop. Single-target change this cycle.

## Findings → user story cascade

- **P1 (broken user flow):** POTM winner realtime toast silently dead for all users on the
  match-detail page. The REST fallback (`usePomResult`) still renders the winner on refetch, but
  the *push* notification of a decided winner while viewing never fires. User impact: players
  staring at a "voting open" card don't see the winner the moment voting closes.

## Classification

- **IMPORTANT** — realtime silently dead in default config (not data-loss/security, so P1 not P0).

## Proceed

Yes — clean, one-line fix + regression test, no backend/schema/i18n churn.
