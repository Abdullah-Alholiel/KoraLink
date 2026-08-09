# Gate 1 — Product Spec: Feed Visibility & Chat Access Remediation

**Feature slug:** `feed-chat-access-fix`  
**Date:** 2026-08-09  
**Input:** Gate 0 Retrospective ([00-retrospective.md](./00-retrospective.md))

---

## 1. Problem Statement

### 1.1 Empty Play Feed (Regression)

The Play main screen — the primary discovery feed for nearby matches — is completely empty. No match cards render. The root cause identified in Gate 0 is the `EXISTS` subquery added to `findNearby`'s raw SQL in Cycle 7 (`matches.service.ts:118-121`). The Drizzle `sql` template with `::uuid` type cast inside a SELECT-list subquery, executed via `db.execute()`, produces a query that PostgreSQL silently rejects or returns zero rows.

**User impact:** The app's core value proposition — discovering nearby matches to join — is broken. Users see an empty screen with "No matches yet" even when matches exist.

### 1.2 Chat Access Blocked (Pre-existing, exposed by Cycle 7)

Two related failures block chat access:

**Messaging list (messages page):** Every match card unconditionally shows the label "Join Chat" — even for matches the user has already joined. There is no conditional logic checking `match.isJoined`. The link navigates to the match detail page rather than a chat room.

**Match detail page:** The `isJoined` computation depends on `currentUserId` from Zustand:
```typescript
const isJoined = currentUserId && match
    ? match.roster.some((p) => p.userId === currentUserId)
    : false;
```
On cold page load (user navigates directly to `/match/:id` with a valid cookie but no prior Zustand state), `currentUserId` is `undefined`, causing `isJoined` to be `false`. This hides all joined-state UI — the messages icon shows a Share2 icon instead of MessageSquare, and clicking does nothing.

**User impact:** A user who has joined a match cannot access the match chat. The entry point is either hidden (detail page cold load) or mislabeled (messages page "Join Chat" when already joined).

---

## 2. User Stories

### P0 — Critical (Ship-stopper)

| ID | Story | Priority | Why P0 |
|----|-------|----------|--------|
| **US-1** | As a player, I want to see nearby open matches on the Play screen so I can find games to join. | P0 | Core value prop — discovery feed is the app's homepage |
| **US-2** | As an authenticated user navigating directly to a match detail page, I want to see my correct join state (Joined/Host) so I can access match features appropriate to my role. | P0 | Cold-load breaks isJoined → hides chat, leave, cancel, and joined content |
| **US-3** | As a player who has joined a match, I want to see a clear entry point to the match chat from the match detail page, so I can communicate with other players. | P0 | Chat is a core engagement feature; currently inaccessible for joined users on cold load |

### P1 — Important (Blocks core flow)

| ID | Story | Priority | Why P1 |
|----|-------|----------|--------|
| **US-4** | As a player viewing the Messages list, I want to see a context-aware button label ("Open Chat" when I'm joined, "Join Match" when I'm not) so the label accurately reflects my relationship to the match. | P1 | Misleading label confuses users; they think they haven't joined when they have |
| **US-5** | As a player who has joined multiple matches, I want to open a specific match's chat from the Messages list, so I can quickly jump to the right conversation. | P1 | Current link navigates to match detail, not chat — adds unnecessary navigation hop |
| **US-6** | As a player, I want my join state to survive page refresh on the Play feed, so cards show the correct "Joined" / "Your Match" badges after I reload. | P1 | Feed `is_joined` comes from server EXISTS subquery, but the SQL regression (US-1) broke this entirely |

### P2 — Nice to have (Polish)

| ID | Story | Priority | Why P2 |
|----|-------|----------|--------|
| **US-7** | As a player, I want a loading skeleton on the Play feed that matches the final card layout exactly, so transitions feel seamless. | P2 | UX polish; the skeleton exists but layout drift between loading and populated states is noticeable |
| **US-8** | As a player returning to the app, I want my identity restored automatically from the cookie without requiring a full OTP re-login, so the app feels instant. | P2 | Zustand cold-load issue; solved by US-2 but the broader identity restoration pattern is worth documenting |

---

## 3. Scope & Boundaries

### IN SCOPE — this cycle fixes

1. **Fix the Play feed SQL** — make `findNearby` return matches correctly. Either:
   - Replace the raw `db.execute(sql`...`)` with Drizzle's query builder (preferred, avoids raw SQL edge cases), OR
   - Restructure the `EXISTS` subquery syntax to work with Drizzle's `sql` template

2. **Fix cold-load `isJoined` on match detail** — ensure `currentUserId` is always available when a user navigates directly to a match detail page. This means populating Zustand from the cookie on any authenticated page visit.

3. **Add conditional "Open Chat" / "Join Chat" label** to the messages page — check `match.isJoined` to determine which label to show.

4. **Fix the messages page navigation target** — when `isJoined` is true, clicking the chat entry should navigate to a match-specific chat view, not the generic match detail page.

5. **Pass `currentUserId` to `adaptMatchList` in `useMatches`** — for consistency and to properly set `isUserHost` on feed Match objects.

### OUT OF SCOPE — not in this cycle

- Building a full match chat UI (chat room component) — this cycle fixes ACCESS to chat, not the chat experience itself
- Real-time WebSocket chat via the gateway — REST chat history endpoint is sufficient for P0
- Fixing the Play feed `is_joined` staleness window (React Query refetch handles this)
- Adding Sentry/Pino/PostHog observability (deferred to next cycle's Slice 3 per factory rules)
- Refactoring `adaptNearbyMatch` to remove `roster: []` hardcode (feed doesn't need roster; `is_joined` from server is sufficient)

---

## 4. Success Criteria (Measurable & Verifiable)

Each criterion maps to a user story and must be verifiable in the browser (non-negotiable).

| Criterion | Maps To | How to Verify |
|-----------|---------|---------------|
| **SC-1** | US-1 | Navigate to Play screen while authenticated. At least one match card renders with title, price, spots, and correct button state. |
| **SC-2** | US-2 | Open a match detail page URL directly in a new tab (cold load). The page must show the correct join state: Joined badge visible, MessageSquare icon in hero, Leave Match / Cancel Match buttons present. |
| **SC-3** | US-3 | On a match detail page where user is joined, click the message icon. It must navigate to a chat view (or open chat inline) — not a dead no-op. |
| **SC-4** | US-4 | Open the Messages list. For matches the user has joined, the button/link must say "Open Chat" (or equivalent, locale-aware). For matches the user hasn't joined, it must say "Join Match." |
| **SC-5** | US-5 | From the Messages list, click "Open Chat" on a joined match. It must navigate to that match's chat, not the generic match detail page. |
| **SC-6** | US-6 | On the Play feed after page refresh, cards must show the correct button state: "Joined ✓" badge for matches the user joined, "👑 Your Match" for hosted matches, "Join Match" for others. |

**Hard gates:**
- `npm run build` → zero errors
- `npx vitest run` → all existing 85 tests pass + new tests added
- Manual browser verification of SC-1 through SC-6

---

## 5. UX Flow: Chat Access — Locked → Unlocked

### 5.1 Entry Points

There are two entry points to the match chat:

```
┌─────────────────────────────────────────────────────────────┐
│                  MATCH DETAIL PAGE                           │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Hero: stadium background with message icon (top-r)  │   │
│  │                                                      │   │
│  │  [NOT JOINED]:  Share2 icon  → tap does nothing      │   │
│  │  [JOINED]:      MessageSquare → tap opens chat       │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Joined State Content (below hero)                   │   │
│  │  • Game Details (with hasJoined=true)                │   │
│  │  • Location / Map                                     │   │
│  │  • Team Lineup                                        │   │
│  │  • Leave Match / Cancel Match buttons                 │   │
│  │  • WhatsApp Invite CTA (sticky bottom)                │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                  MESSAGES LIST PAGE                          │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Match Card (from useMyMatches)                      │   │
│  │  • Venue name / title                                 │   │
│  │  • Status badge (Open/Full/InProgress)               │   │
│  │  • Date • Time • Spots                                │   │
│  │  • Host name • Format                                  │   │
│  │                                                      │   │
│  │  [isJoined=true]:  "Open Chat"  → match chat         │   │
│  │  [isJoined=false]: "Join Match" → match detail       │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### 5.2 State Transition: Locked → Unlocked

```
User visits match detail page (cold load, valid cookie)
  │
  ├─ Zustand user = null
  │   isJoined = false  (guard: currentUserId && match → false)
  │   isUserHost = false
  │   → Hero: Share2 icon (no-op)
  │   → Content: pre-join view (organizer, details, rules, Join button)
  │   → Chat: INACCESSIBLE  ❌
  │
  ▼ AFTER FIX:
  │
  │   Layout/Provider calls GET /users/me → populates Zustand via login()
  │   OR: useMatch hook's onSuccess populates Zustand
  │
  ├─ Zustand user = { id: "uuid-...", ... }
  │   isJoined = match.roster.some(p => p.userId === currentUserId)
  │     → true (user is in roster)
  │   isUserHost = match.hostId === currentUserId
  │     → true/false
  │   → Hero: MessageSquare icon (navigates to chat)
  │   → Content: joined-state view (GameDetails, Location, TeamLineup, Leave/Cancel)
  │   → Chat: ACCESSIBLE ✅
```

### 5.3 Chat Navigation Target

**Decision for this cycle:** Clicking the message icon on the match detail page, or clicking "Open Chat" on the messages list, navigates to the match detail page with `?chat=open` query parameter. The match detail page, when in joined state and `chat=open` is present, scrolls to / opens an inline chat section.

**Why not a separate chat page?** Creating a full chat room UI is OUT OF SCOPE. The `?chat=open` pattern is a minimal bridge that unlocks the flow. A proper chat experience is deferred to a future cycle.

**Alternatively (simpler, approved if Gate 2 determines it's less risky):** Clicking the message icon opens a `ChatSheet` bottom sheet component that fetches and displays match messages via `GET /matches/:id/messages`. This keeps the user on the match detail page and provides immediate chat access with zero navigation.

**Gate 2 decision point:** Sheet vs. inline section vs. dedicated chat route.

---

## 6. UX Flow: Play Feed — Expected States

### 6.1 Card Button States (already implemented in MatchCard, broken by SQL regression)

```
┌────────────────┬──────────────────┬─────────────────────────────────┐
│ Condition      │ Button Label     │ Style                           │
├────────────────┼──────────────────┼─────────────────────────────────┤
│ Completed /    │ "View Details"   │ Gray bg, gray text, rounded     │
│ Cancelled      │                  │                                 │
├────────────────┼──────────────────┼─────────────────────────────────┤
│ isUserHost     │ "Your Match"     │ Amber bg, amber text+border     │
│                │                  │ + 👑 badge inline               │
├────────────────┼──────────────────┼─────────────────────────────────┤
│ isJoined       │ "View"           │ Green/10 bg, green text+border  │
│                │                  │ + ✓ Joined badge inline         │
├────────────────┼──────────────────┼─────────────────────────────────┤
│ Default        │ "Join Match"     │ Green bg, white text, rounded   │
│ (not joined)   │                  │                                 │
└────────────────┴──────────────────┴─────────────────────────────────┘
```

### 6.2 Feed Content States

| State | Visual | When |
|-------|--------|------|
| **Loading** | 3 skeleton cards (gray pulse) | Initial fetch, no cached data |
| **Populated** | MatchCard list with correct button states | API returns matches |
| **Empty** | Trophy icon + "No matches yet" + "Host a Match" CTA | API returns `[]` |
| **Error** | AlertTriangle icon + "Something went wrong" + "Try Again" | API 500/network error |
| **Offline** | Amber banner "You're offline — showing cached data" | Network error with cached data |

---

## 7. Open Questions for Gate 2

These questions MUST be resolved in Gate 2 (Architecture) before any code is written.

| ID | Question | Why it matters |
|----|----------|----------------|
| **Q1** | Drizzle query builder vs. raw SQL for `findNearby` — should we migrate the entire query to Drizzle's `db.select()` pattern, or fix the raw `EXISTS` syntax? | Drizzle query builder avoids raw SQL edge cases but may not support PostGIS functions (`ST_DWithin`, `ST_Distance`) natively |
| **Q2** | Chat entry point UX — inline `ChatSheet` bottom sheet, scroll-to section with `?chat=open`, or dedicated `/match/:id/chat` route? | Determines component architecture, navigation patterns, and what we build |
| **Q3** | Zustand population strategy for cold load — `useUserProfile()` in root layout, per-page `useEffect`, or a provider component? | Affects SSR/hydration behavior and whether we need a loading gate |
| **Q4** | Should `adaptMatchDetail` set `isJoined` and `isUserHost` on the Match object (instead of computing inline on the page)? | Consistency: MatchCard already reads `match.isJoined` / `match.isUserHost`; detail page computes manually — should unify |
| **Q5** | Should `useMatches` hook pass `currentUserId` by reading from Zustand `getState()`, or should the caller pass it as a parameter? | Hook purity vs. convenience; `getState()` is non-reactive but sufficient for one-time adapter calls |
| **Q6** | Should the messages page continue to use `adaptMatchList` (which produces `Match[]` with `roster: []`), or should it use `adaptMatchDetail` (which has full roster)? | `roster: []` means `isJoined` depends solely on `match.isJoined` from API, not on roster comparison — this is actually correct behavior for the messages page |

---

## 8. Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| **R1:** Drizzle query builder doesn't support PostGIS `ST_DWithin`/`ST_Distance` natively, forcing us to keep raw SQL | Medium | High (blocks feed fix) | Keep raw SQL for PostGIS parts, use query builder for the rest; or use `sql` fragments inside query builder |
| **R2:** Zustand population on cold load causes hydration mismatch (SSR renders null user, client immediately re-renders with user) | Medium | Medium (layout shift, console warnings) | Use `suppressHydrationWarning` on user-dependent elements; gate rendering behind `isHydrated` flag |
| **R3:** `GET /users/me` called on every page load to populate Zustand adds latency to first render | Low | Low (cached by React Query, <100ms typical) | Set `staleTime: 60_000` on the profile query; use optimistic Zustand hydration from persisted localStorage |
| **R4:** Fixing the SQL breaks the `is_joined` computation for some edge case (e.g., PostgreSQL version differences in EXISTS handling) | Low | High (regression on top of regression) | Test with actual PostgreSQL 16 container; add integration test for `findNearby` |
| **R5:** ChatSheet bottom sheet approach requires WebSocket or polling for live messages; REST-only is acceptable for P0 but limits real-time feel | Medium | Low (P0 scope is access, not real-time) | Document REST-only as intentional for this cycle; real-time deferred |

---

**⏸️ STOP — 2 P0 stories, 3 P1 stories, 2 P2 stories. 6 success criteria, 6 open questions. Gate 1 ready for review.**
