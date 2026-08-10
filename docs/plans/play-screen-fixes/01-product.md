# Gate 1 — Product Spec: Play Screen Fixes & Player of the Match

**Date:** 2026-08-10  
**Status:** ⏸️ PENDING APPROVAL

---

## Problem Statement

Five issues reported by Abdullah after testing the PWA on his laptop over Tailscale:

1. The "View Match Rules" bottom sheet is visually clipped — its content disappears behind the BottomNav and Play FAB, making the lower rules unreadable.
2. After login, the app lands on the Feed screen instead of the Play screen.
3. The Messages screen ("Active Discussions") shows too many matches — all historical matches appear, not just today's 2 games.
4. The calendar on the Play screen is broken: Aug 15 matches show on "today" (Aug 10), clicking other dates shows nothing, clicking back on "today" also shows nothing.
5. No post-match functionality exists — no Player of the Match voting, no trophy display.

---

## Cycle A — Bug Fixes (Issues 1-4)

### US-A1: Z-Index Overflow Fix (P0)

**As a** player viewing match details,  
**I want** bottom sheets (rules, chat, lineup, payment) to always render above the bottom nav,  
**So that** no content is ever hidden behind the navigation bar.

**Acceptance Criteria:**
- MatchRulesSheet renders above BottomNav (backdrop z-[60], sheet z-[70])
- All bottom sheets in the app audited and standardized to z-[60]/z-[70]
- No bottom sheet content is clipped or hidden behind any nav element

### US-A2: Post-Login Redirect to Play (P0)

**As a** returning player logging in,  
**I want** to land directly on the Play screen after authentication,  
**So that** I can immediately discover and join games.

**Acceptance Criteria:**
- After OTP verify (returning user): redirect to `/play`
- After DevLoginBar click: redirect to `/play`
- After complete-profile (new user): redirect to `/play`
- Feed is still accessible via the Feed nav tab

### US-A3: Active Discussions Filter (P1)

**As a** player checking my messages,  
**I want** to see only relevant match discussions,  
**So that** I'm not overwhelmed by stale completed/cancelled matches.

**Acceptance Criteria:**
- Open, Full, and InProgress matches show as active discussions (normal card)
- Completed matches show as faded/read-only with a "Completed" badge
- Cancelled matches are hidden entirely
- Sorting: upcoming matches first (by scheduled_at ASC), then completed (by scheduled_at DESC)

### US-A4: Calendar Date Filtering Fix (P0)

**As a** player using the Play screen calendar,  
**I want** the date picker to correctly filter matches by the selected date,  
**So that** I see only matches happening on the day I selected.

**Acceptance Criteria:**
- On initial load, today's date is selected and the API filters by today's date
- Clicking a future date filters matches to that date
- If no matches exist on a date, show the empty state
- Clicking back on "TODAY" after another date correctly shows today's matches
- Matches are never mislabeled as "today" when they're on a different date
- The date sent to the API is always in YYYY-MM-DD format using the user's local date (not UTC)

### US-A5: Search Bar Wiring (P1 — discovered during audit)

**As a** player searching for matches,  
**I want** the Play screen search bar to actually filter matches by title or venue,  
**So that** I can find specific games.

**Note:** The search bar exists in `play/page.tsx` but the `searchQuery` state is never passed to the API or used for client-side filtering. This is a dead UI element (per koralink-ui-standards pitfall pattern).

**Acceptance Criteria:**
- Search filters matches client-side by title, venue name, or city
- Clearing search restores the full list
- Search is resilient to empty results

---

## Cycle B — Player of the Match Feature (Issue 5)

### US-B1: Player of the Match Voting (P0)

**As a** player who just finished a match,  
**I want** to vote for the best player in the game,  
**So that** the standout performer gets recognized.

**Acceptance Criteria:**
- After a match is marked Completed, all players who attended (didn't no-show) can vote
- Voting opens immediately upon match completion
- Voting closes 24 hours after match completion
- A player can vote for exactly one other player (cannot vote for themselves)
- A player can change their vote within the 24-hour window
- Each player sees a list of eligible players (teammates who attended, excluding themselves)
- The current vote count is NOT shown during the voting window (prevents bandwagon effect)
- After the 24-hour window closes, the player with the most votes is declared "Player of the Match"
- Ties: if two or more players tie for most votes, no POM is awarded for that match

### US-B2: Player of the Match Result Notification (P1)

**As a** player,  
**I want** to know who won Player of the Match after voting closes,  
**So that** I can celebrate the standout performer.

**Acceptance Criteria:**
- After the 24h window closes, all participants see the POM result on the match detail page
- The winner is shown with a trophy icon and vote count
- The match detail page shows a "Player of the Match" section with the winner's avatar, name, and a crown/trophy badge
- If no POM was awarded (tie or no votes), show a graceful "No winner this time" state

### US-B3: Trophy Display in Profile (P0)

**As a** player,  
**I want** my Player of the Match trophies displayed on my profile,  
**So that** my achievements are visible to others.

**Acceptance Criteria:**
- Profile shows a "Player of the Match" count (e.g., 🏆 ×3)
- A trophy section lists recent POM awards with match title and date
- Empty state: "No trophies yet — keep playing!" (for new users)
- Trophy count is included in the `GET /users/me` response

### US-B4: Post-Match Screen Flow (P1)

**As a** player opening a completed match,  
**I want** a clear post-match experience,  
**So that** I can vote and see results without confusion.

**Acceptance Criteria:**
- Completed match detail page shows a "Match Completed" banner
- If voting is open: shows voting UI ("Vote for Player of the Match")
- If user already voted: shows "You voted for [Name]" with option to change
- If voting closed: shows POM result section
- If user was a no-show: voting UI is disabled with explanation

---

## Scope & Boundaries

### IN SCOPE (Cycle A)
- Fix MatchRulesSheet + ChatSheet z-index
- Fix post-login redirect to /play
- Add status filter to Active Discussions
- Fix calendar date filtering consistency
- Wire Play screen search bar

### IN SCOPE (Cycle B)
- `match_votes` table (match_id, voter_id, candidate_id, created_at)
- `player_of_match` view/column on matches table (or separate awards table)
- `POST /matches/:id/vote` endpoint
- `GET /matches/:id/pom-result` endpoint
- Profile `pom_count` field in `GET /users/me`
- Voting UI component on match detail page
- Trophy display section in profile page
- Post-match status banners on match detail

### OUT OF SCOPE
- Push notifications for voting reminders (future)
- POM leaderboard/leaderboard page (future)
- POM animation/celebration overlay (future)
- Changing the existing match lifecycle (Open→Full→InProgress→Completed)

---

## Success Criteria

| Criterion | Measurable |
|-----------|------------|
| No bottom sheet content hidden behind nav | Visual test on all sheets |
| Login always lands on /play | E2E test all 3 auth flows |
| Active Discussions only shows relevant matches | API test: Cancelled excluded, Completed faded |
| Calendar correctly filters by date | E2E: click today → see today's matches; click future → see that date's matches |
| Player of the Match voting works end-to-end | E2E: complete match → vote → wait → see result |
| Trophy shows in profile | Profile shows POM count after winning |
| Build passes | `turbo run build` zero errors |
| Tests pass | `npx vitest run` all green |

---

## Risks

| Risk | Mitigation |
|------|------------|
| Date timezone issues (UTC vs local) | Use local date for YYYY-MM-DD, not UTC |
| Voting table migration conflicts | Generate clean Drizzle migration, test on dev DB |
| POM tie-breaking edge cases | Document: ties = no POM awarded |
| Search performance on large lists | Client-side filter is fine for ≤50 matches; API search later if needed |
| Completed matches showing in Play feed | The Play feed already filters `status = 'Open'` — completed won't show there |

---

## Open Questions (Resolved)

1. ✅ **Voting window:** Opens immediately after match completes, closes 24h later.
2. ✅ **Active Discussions:** Completed = read-only/faded with badge. Cancelled = hidden.
3. **Profile trophy display:** Simple count badge + recent awards list (defaulting to standard pattern).

---

## Execution Order

**Cycle A first (Bugs), then Cycle B (Feature).**  
Bug fixes are fast and high-impact — they fix the app the user is testing right now. Player of the Match is a full feature that needs migration + new endpoints + new UI.
