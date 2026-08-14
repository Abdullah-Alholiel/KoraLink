# Gate 4: Vertical Slices — Match Lifecycle & Real-Time Sync

## Tracer Bullets & Slices
1. **Slice 1: Gateway Broadcast Methods**: Add event emitters to `MatchesGateway` and inject into `MatchesService`.
2. **Slice 2: Match Service Event Dispatching**: Trigger socket events inside `updateStatus`, `joinMatch`, `leaveMatch`, `votePom`, and `markNoShow`.
3. **Slice 3: PWA Real-time Query Sync**: Hook `useMatch` / `useMatchChat` to update React Query cache on WebSocket events.
4. **Slice 4: Verification & Build**: Verify build passes with zero errors (`turbo run build`).
