# Gate 1: Product Spec — Match Lifecycle & Real-Time Sync

## 1. User Stories & Scope
- **Host Controls**: Host can transition match status (`Open` → `InProgress` → `Completed` or `Cancelled`) with instant UI feedback.
- **Roster Real-Time Sync**: When any user joins or leaves a match, all viewers on `/match/[id]` see the spot count and roster change in <500ms via WebSocket.
- **No-Show & Attendance Marking**: Host can flag absent players during/after `InProgress` status.
- **Player of the Match (POTM) Voting**: Real-time broadcast of live votes and winner declaration.

## 2. Success Criteria
1. WebSockets emit `match:status_changed`, `match:roster_updated`, and `match:pom_updated` to all clients connected to room `match_<id>`.
2. Frontend `useMatch` automatically updates cache when socket events arrive.
3. Zero page refreshes required during match execution.
4. `turbo run build` green with zero errors.
