# Gate 0 — Retrospective: Comprehensive App Audit Cycle

**Date:** 2026-08-11
**Baseline:** `d9d5e5c` (fix: standardize team lineup format, fix max_players, fix duplicate nav)
**Status:** ⏸️ PENDING APPROVAL

---

## Full-Stack Connectivity Audit Results

### CRITICAL — Dead UI / Missing Functionality

| # | Issue | Location | Severity |
|---|-------|----------|----------|
| C1 | **Host cannot start or complete matches from PWA** | Match detail page has NO start/complete buttons. API endpoints exist (`POST /matches/:id/start`, `POST /matches/:id/complete`) but no frontend hooks or UI. The entire match lifecycle (Open → Full → InProgress → Completed → POM voting) is broken at the UI level. | CRITICAL |
| C2 | **"View Profile" on organizer shows YOUR profile, not theirs** | Match detail line 341: `onClick={() => router.push('/${locale}/personal-info')}` — navigates to the logged-in user's own profile page instead of showing the organizer's profile. | CRITICAL |
| C3 | **Pre-join TeamLineupSheet has NO roster data** | `TeamLineupSheet` still uses the old `<TeamLineup format={format} />` with no roster or hostId props. Pre-join users see empty teams with no host shown. | CRITICAL |
| C4 | **ChatSheet send is permanently disabled** | ChatSheet lines 147-154: input and send button are `disabled` with `comingSoon` tooltip. The WebSocket gateway exists but the send functionality was never wired. | IMPORTANT |

### IMPORTANT — Missing Hooks / Wired Actions

| # | Issue | Location |
|---|-------|----------|
| I1 | **No `useStartMatch` / `useCompleteMatch` hooks** | `useMatchActions.ts` only has `useJoinMatch`, `useLeaveMatch`, `useCancelMatch`. Missing start + complete. |
| I2 | **No `GET /users/:id` endpoint** | API has no way to fetch another user's public profile by ID. PlayerProfileSheet shows placeholder "—" stats. |
| I3 | **Notification bell buttons are dead** | Play page line 51, Feed page line 31: `<button>` with Bell icon, no `onClick`. No notifications page exists. |
| I4 | **Messages search button is dead** | Messages page line 31-32: Search icon button with no handler. |
| I5 | **"View All Comments" button is dead** | Match detail line 455: button with no onClick. |
| I6 | **Profile dead MenuItems** | Contact Support, Privacy Policy, Terms of Service — all rendered but have no onClick/href. |

### MINOR — UI Polish

| # | Issue |
|---|-------|
| M1 | Feed page uses hardcoded English "FULL" badge instead of i18n key |
| M2 | TeamLineupSheet hardcodes "Team Lineup" title instead of i18n |
| M3 | Clubs detail page is standalone (not under `(main)`) — correctly has own MobileFrame+BottomNav, but the "Host a Match Here" button doesn't pre-select the venue in the HostMatchForm |

---

## Recommended Cycle Structure

### Slice 1: Match Lifecycle Controls (C1 + I1)
- Add `useStartMatch` and `useCompleteMatch` hooks
- Add Start/Complete buttons to match detail page (host only, status-gated)
- This unblocks the POM voting flow (requires Completed status)

### Slice 2: Fix Organizer Profile + Pre-join Lineup (C2 + C3)
- Fix "View Profile" to show organizer's profile via PlayerProfileSheet
- Fix TeamLineupSheet to accept roster + hostId props
- Pass roster data from the pre-join section

### Slice 3: Wire Dead Buttons (I3-I6)
- Remove notification bells (no notifications system exists yet)
- Wire Messages search to filter discussions client-side
- Wire "View All Comments" to open ChatSheet
- Wire dead profile MenuItems (Contact Support → mailto, Privacy/Terms → placeholder)

### Slice 4: Chat Send + Public Profile API (C4 + I2)
- Add `GET /users/:id` endpoint for public profile data
- Wire ChatSheet send to WebSocket or REST API
- Wire PlayerProfileSheet to fetch real stats from API
