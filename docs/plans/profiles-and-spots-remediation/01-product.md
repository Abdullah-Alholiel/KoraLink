# Gate 1 — Product Spec: Profiles & Spots Remediation

**Feature:** `profiles-and-spots-remediation`  
**Date:** 2026-08-09  
**Input:** Gate 0 Retrospective ([00-retro.md](./00-retro.md))

---

## 1. Problem Statement

The KoraLink PWA has a **data accuracy gap** between what the backend returns and what the frontend displays. Users see:

- ❌ **Stale roster data** after joining/leaving a match (API returns bare rows, not populated objects)
- ❌ **Missing venue details** on club pages (`environment` field silently absent on pitches)
- ❌ **"My Games" goes to the discovery feed** instead of the user's actual match history
- ❌ **Spots count ambiguity** — feed cards show "1/10 spots" for brand-new matches (host is counted)

The backend mutation endpoints violate the API Contract Rule — they return bare DB rows or plain `{ message }` objects instead of the fully populated resource. This forces the frontend to double-fetch or display stale data.

---

## 2. User Stories

### Epic 1: Accurate Match State After Actions

| ID | Story | Priority |
|----|-------|----------|
| US-1 | As a player, when I join a match, I immediately see the updated roster (my name appears) without refreshing the page | P0 |
| US-2 | As a player, when I leave a match, my name disappears from the roster immediately | P0 |
| US-3 | As a host, when I start/completes/cancel a match, the match status updates immediately in the UI | P1 |
| US-4 | As a player, the spots count on match cards is accurate and intuitive (doesn't count the host as a "filled spot") | P0 |

### Epic 2: Profile Shows My Real Activity

| ID | Story | Priority |
|----|-------|----------|
| US-5 | As a player, "My Games" on my profile shows MY actual matches (not the discovery feed) | P1 |
| US-6 | As a player, I can see my active matches and match history from my profile | P1 |
| US-7 | As a player, my profile stats (games played, rating, karma) are accurate and reflect real activity | P1 |

### Epic 3: Venue Detail Accuracy

| ID | Story | Priority |
|----|-------|----------|
| US-8 | As a player, when I view a club/venue, I see all pitch attributes including surface type and environment | P2 |

---

## 3. Scope & Boundaries

### IN SCOPE (this cycle)
1. Fix all mutation endpoints to return `this.findOne(id)` — full populated match with relations
2. Resolve `spots_filled` ambiguity: exclude host from count, or clarify product intent
3. Wire "My Games" to `GET /users/matches` endpoint (already exists in backend)
4. Add `environment` column to venue detail pitch query
5. Ensure match detail page re-renders roster correctly after join/leave mutations

### OUT OF SCOPE (future cycles)
- Real-time WebSocket roster updates (Socket.IO already exists, needs roster events)
- Push notification for match status changes
- PostHog/Sentry/Pino instrumentation (will be added per observability mandate in Slice 3)
- Profile edit form
- Match history pagination

---

## 4. Success Criteria

| # | Criterion | Measurement |
|---|-----------|-------------|
| SC-1 | After `POST /matches/:id/join`, the response includes full roster with player names | API response inspection |
| SC-2 | After `DELETE /matches/:id/leave`, the response includes updated match with remaining roster | API response inspection |
| SC-3 | `spots_filled` on feed cards equals actual non-host player count | UI visually verified |
| SC-4 | "My Games" on profile navigates to user's match list (not feed) | UI navigation verified |
| SC-5 | `turbo run build` passes with zero errors | Terminal output |
| SC-6 | All existing tests pass (85/85) | `npx vitest run` output |
| SC-7 | Club detail page shows environment field on pitches | UI visually verified |

---

## 5. Open Questions (Gate 1 → Gate 2)

1. **Q1: `max_players` semantics** — Does `max_players = 10` mean 10 players total (host + 9) or 10 additional players (host + 10)?  
   **Recommendation:** 10 total (host + 9). This is the current implementation behavior. We'll standardize on this and exclude the host from `spots_filled` in the feed display.

2. **Q2: "My Games" page design** — Should it be a dedicated page or a section on the profile?  
   **Recommendation:** A new route `/(main)/my-games/page.tsx` using `GET /users/matches` endpoint. This keeps profile clean and gives room for filtering (active vs history tabs).

3. **Q3: Match cards in feed vs detail** — Should feed cards show the roster avatar stack (like the detail page does)?  
   **Recommendation:** Yes — add a minimal roster preview (first 3 avatars + "+N" count) to `MatchCard`. This is a quick win that improves the feed UX significantly.

---

## 6. User Flows

### Flow A: Join Match → See Updated Roster
```
1. User taps "Join Match" on match detail page
2. Payment sheet opens → user confirms payment
3. POST /matches/:id/join → backend returns full match with updated roster
4. React Query cache is updated → UI re-renders with user in roster
5. "Joined" badge appears, spots count updates
```

### Flow B: Profile → My Games
```
1. User taps "My Games" on profile page
2. Navigates to /my-games
3. GET /users/matches returns user's joined matches
4. User sees their active matches (Open/Full/InProgress) and past matches (Completed/Cancelled)
5. Tapping a match navigates to match detail
```

---

## 7. Risks

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| `max_players` semantic change breaks existing matches | Medium | Gate 3 contracts will define exact behavior; backward-compatible approach |
| `spots_filled` change breaks frontend math | Low | `spots_filled` is only used in `MatchCard` and `MatchDetailPage` — well-scoped |
| New `/my-games` route requires new i18n keys | Low | ~10 new keys per language — manageable |

---

**⏸️ STOP — Waiting for Gate 1 approval. Proceed to Gate 2 only after explicit user confirmation.**
