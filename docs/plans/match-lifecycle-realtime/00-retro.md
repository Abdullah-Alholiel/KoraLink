# Gate 0: Retrospective — Match Lifecycle & Real-Time Sync

## 1. Overview
Reviewing current match state management across `apps/api` and `apps/player-pwa`.

## 2. Identified Tech Debt & Gaps
1. **Stale Match Statuses**: Frontend relies on 30s React Query polling or static state. When a host clicks "Start Match", "Complete Match", or a player joins/leaves, other attendees in the room don't see instant roster or status transitions.
2. **Missing Host Action Gateways**: `matches.gateway.ts` handles lobby join/leave, but doesn't emit real-time socket events for state transitions (`match:status_changed`, `match:roster_updated`, `match:pom_started`, `match:pom_updated`).
3. **No-Show Tracking**: Host controls allowed marking no-shows only locally or without immediate ledger/penalty recording or socket feedback.

## 3. Guiding Principles
- All match state changes must be broadcast over `/lobby` WebSocket gateway.
- Frontend MUST react immediately to socket events by updating local Query Cache / state without requiring full page reloads.
