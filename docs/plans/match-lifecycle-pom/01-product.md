# Gate 1 — Product Spec: Match Lifecycle, My Games, POM Voting UX

Date: 2026-08-11 | Cycle: `match-lifecycle-pom`

## 1. Problem Statement

Three related issues discovered during user testing:

**Match Lifecycle**: A match scheduled 9–10 PM shows as "Open" at 10 PM. The match should auto-complete at its end time so:
- The play screen doesn't show past matches (✅ already)
- The match detail page shows the Completed state with POM voting
- Users can vote for Player of the Match

**My Games History**: Cancelled matches disappear from the user's match history ("My Games" / "Active Discussions"). Users need to see all their matches — including cancelled ones — in their history.

**POM Voting UX**: The voting UI is a bare inline list of names. It should be a smooth drawer sheet showing the team lineup, with a confirmation popup after selection.

## 2. User Stories

### Story A: Match Auto-Completion (P0)
> As a player, when I visit a completed match detail page, I see the match state marked as "Completed" and can vote for Player of the Match.

**Acceptance Criteria:**
- Past matches (scheduled_at + duration_mins < NOW()) appear as "Completed" on the detail page
- The PostMatchSection renders for completed matches
- All users who attended can see and vote for POM
- The feed/play screen correctly excludes past matches (unchanged)

### Story B: Cancelled Matches in History (P0)
> As a player who cancelled a match, I can still see it in my match history marked as "Cancelled" so I have a complete record.

**Acceptance Criteria:**
- Cancelled matches appear in My Games / Active Discussions
- Cancelled matches show the "Cancelled" status badge
- They are sorted below active matches but above old completed matches

### Story C: POM Voting Drawer Sheet (P1)
> As a player voting for POM, I see a drawer sheet with the team lineup (avatars + names), tap a player, and get a confirmation popup before my vote is cast.

**Acceptance Criteria:**
- Voting UI is a bottom sheet (z-[60]/z-[70]) showing the roster from both teams
- Each player shows avatar, name, and team (Home/Away)
- Tapping a player opens a confirmation modal: "Vote for [Name] as Player of the Match?"
- Confirmation has "Cancel" and "Confirm Vote" buttons
- After voting, the sheet closes and shows "✓ Voted for [Name]"
- Already-voted state prevents re-voting (existing behavior, unchanged)

## 3. Scope & Boundaries

| IN SCOPE | OUT OF SCOPE |
|----------|-------------|
| Auto-complete past Open/Full/InProgress matches | Cron/scheduled job infrastructure (use startup-time bulk update + query-time virtual status) |
| Show cancelled matches in My Games | Cancelled match card redesign |
| POM voting bottom sheet with confirmation | Changing voting rules (window, eligibility) |
| Backend: remove Cancelled filter from getMyMatches | New analytics/tracking |
| i18n for new UI strings | Push notifications for match completion |

## 4. Success Criteria

- [ ] Past matches show "Completed" status on detail page with POM section
- [ ] Cancelled matches visible in My Games with "Cancelled" badge
- [ ] POM voting is a bottom sheet with team lineup + confirmation popup
- [ ] Build: `turbo run build` — zero errors
- [ ] Tests: `npx vitest run` — all passing
- [ ] No regression in match card feed, play screen, or existing POM logic

## 5. Open Questions for Gate 2

1. **Auto-complete strategy**: Query-time virtual status (no DB mutation, just treat `scheduled_at + duration_mins < NOW()` as Completed) vs. startup job (update all past matches on boot)?
   - **Recommendation**: Both. Query-time is immediate and safe. Startup job cleans up DB state. 

2. **Cancelled matches ordering**: Where do cancelled matches sort relative to completed?
   - **Recommendation**: After active matches, before old completed matches.

3. **POM sheet**: Show full roster or only eligible candidates (not self, not no-show)?
   - **Recommendation**: Show eligible candidates only (not voter, not no-shows) — same as current list.

## 6. Risks

| Risk | Mitigation |
|------|-----------|
| Query-time status change impacts feed (shows past in play screen) | `findNearby` already has `scheduled_at >= NOW()` filter — unchanged |
| Auto-complete at startup misses matches completed between restarts | Query-time virtual status handles this |
| POM drawer sheet increases complexity | Reuse existing TeamLineup component; sheet is standard pattern |
