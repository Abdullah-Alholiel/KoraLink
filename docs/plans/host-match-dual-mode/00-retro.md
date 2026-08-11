# Gate 0 — Retrospective: Host Match Dual Mode Cycle

Date: 2026-08-11 | Baseline: `89a06bd`

## 1. Commit Pattern Analysis

```
89a06bd feat(seed): add pitch slots for partner venue + fix now declaration (Slice 4+5)
168a9aa feat(host): add SlotPicker + wire 'Book via Us' flow (Slice 3)
20c35f0 feat(host): add ModeToggle + PublishWarningSheet for dual-mode (Slice 2)
e1152f1 feat(host): add dual-mode backend — booking_mode, pitch_slots, atomic reservation (Slice 1)
494abd7 refactor(host): extract HostMatchForm into sub-components (Slice 0)
3321a54 fix: stale Full status — defensive revert in joinMatch
07ce451 feat: Messages screen redesign
a05d3d8 fix: PlayerProfileSheet spacing
d47010e fix: pre-join team lineup — embed directly, remove duplication
b719de5 fix: host counted in spots_filled — card + detail show 1/22 not 0/22
e74e919 feat: match lifecycle, dead buttons, public profiles
d9d5e5c fix: standardize team lineup format, fix max_players, fix duplicate nav
090d605 feat(lineup): two-team auto-assignment, clickable profiles, count fix
d0e62f7 fix: 8 bug fixes — discussions, spots, UI, clickable cards, team lineup
bab5bf2 feat(pom): Player of the Match voting, results, and profile trophy
ab7681f fix(play): z-index overflow, login redirect, discussions filter, calendar, search
8b0d39a fix(matches): correct uuid→text cast for is_joined subquery
a7e351c fix: review — useMatch reactive currentUserId, export buildComments, sw precache
d5f9ef1 fix: feed-chat-access — BOOL_OR replaces EXISTS, AuthBootstrap cold-load
8acc848 fix: match-state-propagation — state-aware cards, sheets, EXISTS subquery
```

- **feat:** 8 | **fix:** 11 | **refactor:** 1
- **fix:feat ratio:** 1.38:1 (under 1.5 threshold — acceptable)
- **Observation:** Fix volume concentrated in early cycles (state propagation, feed access, auth bootstrap). Recent host-match cycle has zero fix commits — quality is trending up.

## 2. Full-Stack Connectivity Audit

### 2.1 Store → Page
| Check | Result |
|-------|--------|
| AuthBootstrap populates Zustand on cold load | ✅ `AuthBootstrap` in root layout |
| `currentUserId` included in `queryKey` | ✅ `useMatch(id, currentUserId)` |
| `login()` called after OTP verify | ✅ Verified in prior cycle |

### 2.2 Hook → API
| Check | Result |
|-------|--------|
| `useCreateMatch` sends correct payload | ✅ booking_mode, booking_slot_id |
| `usePitchSlots` fetches `/pitches/:id/slots` | ✅ |
| Hooks invalidate queries on mutation success | ✅ |

### 2.3 Page → User
| Check | Result |
|-------|--------|
| MatchCard has href to detail | ✅ `<Link href={...}>` wraps entire card |
| ModeToggle fires onModeChange | ✅ |
| Publish button requires pitch+date+time | ✅ `canPublish` guard |
| **LocationMap "View on Map" button** | 🔴 **DEAD** — `<button>` with no `onClick` |
| Wallet top-up modal z-index | 🔴 **z-50** — renders behind BottomNav |

### 2.4 Database → API
| Check | Result |
|-------|--------|
| Mutations return `this.findOne(id)` | ✅ All 6 (join, leave, create, start, complete, cancel) |
| spots_filled counts host | ✅ `COUNT(mp.id)::int` — no filter |
| format uses pitch.size | ✅ `row.pitch_size` / `detail.pitch?.size` |
| max_players formula | ✅ `parseInt(format.split('v')[0]) * 2` |
| No ::uuid casts in SQL | ✅ All casts use `::text` |
| pitch_slots seeded | ✅ 56 slots for partner venue |

## 3. Findings

### 🔴 CRITICAL (2)

| # | Issue | Location | Impact | Fix |
|---|-------|----------|--------|-----|
| C1 | **Dead UI: "View on Map" button** | `LocationMap.tsx:26` | Button renders but does nothing when clicked. Used in match detail page at 2 locations (lines 253, 393). | Add `onClick` that opens Google Maps with venue location coordinates/address. |
| C2 | **Wallet top-up modal z-index collision** | `wallet/page.tsx:308-309` | Backdrop + sheet at `z-50`. BottomNav is also `z-50` and renders later in DOM — backdrop is hidden behind nav. | Change to `z-[60]` (backdrop) + `z-[70]` (sheet). |

### 🟡 IMPORTANT (1)

| # | Issue | Location | Impact | Fix |
|---|-------|----------|--------|-----|
| I1 | **Audit checklist skill stale** | `koralink-audit-checklist` §5 | Says "Host excluded from filledSpots" — contradicts current code. Rule changed in `b719de5`. Misleads future audits. | Update §5 to match software-factory skill: host IS counted. |

### 🟢 CLEAN (verified)

- All 6 mutations follow contract ✅
- Zero TypeScript errors ✅
- Build 2/2 ✅
- Tests 91/91 ✅
- No API runtime errors ✅
- No TODO/FIXME markers ✅
- No duplicate MobileFrame ✅
- No ::uuid casts ✅
- i18n keys present for host form ✅

## 4. Recommendation

**Proceed to next cycle** — the codebase is in good shape. Fix the 2 critical issues (C1, C2) as a quick remediation before any new feature work, or deploy them as a small `fix:` cycle. The stale skill (I1) should be patched regardless.
