# Gate 2: Architecture — Match Lifecycle & Real-Time Sync

## 1. Gateway & Service Integration
- **`MatchesGateway` (`apps/api/src/modules/gateway/matches.gateway.ts`)**:
  - Exposes `broadcastMatchStatusChange(matchId: string, status: string)`
  - Exposes `broadcastRosterUpdate(matchId: string, roster: RosterPlayer[])`
  - Exposes `broadcastPomVoteUpdate(matchId: string, pomData: unknown)`
- **`MatchesService` (`apps/api/src/modules/matches/matches.service.ts`)**:
  - Injects `MatchesGateway` to emit websocket events after mutating database state.

## 2. Frontend Real-Time Adapter
- **`useMatchSocket` / `useMatch` Hook (`apps/player-pwa/src/hooks/useMatches.ts`)**:
  - Connects to Socket.IO `/lobby` namespace when viewing a match page (`/match/[id]`).
  - Joins room `match_<id>`.
  - Subscribes to events `match:status_changed`, `match:roster_updated`, `match:pom_updated`.
  - Updates TanStack Query Cache key `['matches', id]` upon receiving socket events.
