# Gate 0 — Retrospective: Play Screen Fixes & Post-Match Features

**Date:** 2026-08-10  
**Baseline commit:** `8b0d39a` (fix(matches): correct uuid→text cast for is_joined subquery)  
**Status:** ⏸️ PENDING APPROVAL

---

## 1. Commit History (last 15)

```
8b0d39a fix(matches): correct uuid→text cast for is_joined subquery
a7e351c (previous feature work)
```

**Fix:feat ratio:** Low — the most recent fix was a legitimate production bug (type mismatch). No reactive fix loop detected.

---

## 2. The Five Reported Issues — Root Cause Analysis

### ISSUE 1: MatchRulesSheet overflowing behind BottomNav (CRITICAL — UI)

**Symptom:** "View Match Rules" bottom sheet content is hidden behind the bottom nav bar and play FAB.

**Root Cause:** `MatchRulesSheet.tsx` uses `z-50` for both the backdrop and the sheet. `BottomNav.tsx` also uses `z-50`. When the sheet opens from the match detail page (which renders inside `MobileFrame` + `BottomNav`), the BottomNav's `z-50` competes with the sheet's `z-50`, and the BottomNav wins paint order because it's rendered later in the DOM (it's a sibling after `<main>` in the layout).

**Evidence:**
- `MatchRulesSheet.tsx` line 28: `<div className="fixed inset-0 bg-black/50 z-50" />`
- `MatchRulesSheet.tsx` line 31: `<div className="fixed bottom-0 inset-x-0 z-50 bg-white rounded-t-3xl ...`
- `BottomNav.tsx` line 45: `relative z-50`
- `PaymentSheet.tsx` and `TeamLineupSheet.tsx` already use `z-[60]`/`z-[70]` — the pattern is established but `MatchRulesSheet` was never updated.

**Fix:** Raise `MatchRulesSheet` to `z-[60]` (backdrop) and `z-[70]` (sheet), matching `PaymentSheet` and `TeamLineupSheet`. **Also audit ALL other bottom sheets** for the same issue. The ChatSheet must also be checked.

---

### ISSUE 2: Login lands on Feed, not Play (IMPORTANT — UX)

**Symptom:** After logging in, the app opens on the Feed screen (`/en`), but the user expects to land on the Play screen (`/en/play`).

**Root Cause:** Every auth success handler navigates to `/${locale}` which is the `(main)` route group's index → `page.tsx` = Community Feed. No auth flow navigates to `/play`.

**Affected files (ALL redirect to `/${locale}`):**
- `verify/page.tsx` line 91: `router.push(`/${locale}`)`
- `DevLoginBar.tsx` line 73: `router.push(`/${locale}`)`
- `complete-profile/page.tsx` line 49: `router.push(`/${locale}`)`

**Fix:** Change all three to `router.push(`/${locale}/play`)`.

---

### ISSUE 3: "Too many active discussions" (IMPORTANT — Data Logic)

**Symptom:** Messages screen shows too many "Active Discussions" even though only 2 games are today. Shows ALL joined matches ever, including past/cancelled ones.

**Root Cause:** `GET /users/me/matches` query in `users.service.ts` line 80-112 has **no status or date filter**. It returns ALL matches the user has ever joined, regardless of status (Open, Full, InProgress, Completed, Cancelled) or date (past or future).

**The query:**
```sql
WHERE my.user_id = ${userId}
-- NO status filter
-- NO date filter
```

**Fix:** Add `WHERE my.user_id = ${userId} AND m.status IN ('Open', 'Full', 'InProgress')` to only show upcoming/active matches. Completed and Cancelled matches should not appear in "Active Discussions."

---

### ISSUE 4: Calendar date filtering broken (CRITICAL — Data Flow)

**Symptom — 4 sub-bugs:**

**4a. Today shows future matches (Aug 15 matches showing on Aug 10):**
The API `findNearby` query (line 124-125) has `WHERE m.status = 'Open' AND m.scheduled_at >= NOW()`. When `date` param is null (initial load), it shows ALL upcoming matches regardless of date. The DatePicker starts with `selectedIndex = 0` (TODAY), but `selectedDate` state is `null` on mount, so no date filter is sent. The API returns all future matches, and the UI labels them "today."

**4b. Clicking other dates shows nothing:**
When a date is selected, `onDateSelect` sends `date.toISOString().split('T')[0]` (e.g., `2026-08-11`). The API filter is `AND m.scheduled_at::date = ${date}::date`. This works correctly — but if no matches exist on that date (seed data only has matches on specific dates), the empty state correctly shows. This is actually **working as designed** — the issue is that the user expects to see matches but there are none seeded on other dates.

**4c. Clicking back on "TODAY" after another date shows nothing:**
When the user clicks "TODAY" again, `onDateSelect` fires with today's date. The API filters by `scheduled_at::date = today`. But the seed data matches on Aug 15 have `scheduled_at::date != today`, so they correctly don't show. The issue is that the user saw them on initial load (when `date=null`), then they disappeared when filtering by today.

**4d. The real root cause — inconsistent filtering:**
- **Initial load (date=null):** Shows ALL upcoming matches (no date filter)
- **After clicking a date:** Shows ONLY matches on that exact date
- **After clicking TODAY:** Shows only matches scheduled for today's date

This inconsistency makes the UX confusing. The user sees matches on first load, then they "disappear" when interacting with the calendar.

**Fix:** 
1. Initialize `selectedDate` to today's date on mount (not `null`), so the initial load also filters by today.
2. The date filter should show matches for the selected date OR future dates if today has none (to avoid empty screens on quiet days).

---

### ISSUE 5: Player of the Match / Post-Match Features (NEW FEATURE — Full Design Needed)

**Symptom:** No post-match functionality exists. No player-of-the-match voting, no trophy display in profile.

**Current state:** `completeMatch()` only changes status from `InProgress → Completed`. No voting, no trophy, no post-match flow exists.

**This requires full 4-Gate design:**
- Database: new tables for votes and trophies
- API: new endpoints for voting and results
- Frontend: post-match voting UI, trophy display in profile
- Timing logic: voting opens after match completion, closes after a set window

---

## 3. Classification

| Issue | Severity | Type | Gate Scope |
|-------|----------|------|------------|
| 1. Rules sheet behind nav | CRITICAL | UI bug (z-index) | Fix in Gate 4 Slice 1 |
| 2. Login lands on Feed | IMPORTANT | UX bug (redirect) | Fix in Gate 4 Slice 1 |
| 3. Too many discussions | IMPORTANT | Data bug (missing filter) | Fix in Gate 4 Slice 2 |
| 4. Calendar filtering broken | CRITICAL | Data flow bug (state + API) | Fix in Gate 4 Slice 2 |
| 5. Player of the Match | FEATURE | Full feature | Full 4-Gate design |

---

## 4. Recommended Cycle Structure

### Cycle A: Bug Fixes (Issues 1-4) — Fast, existing codebase
- Gate 1-3: Compact specs (these are bugs, not features)
- Gate 4: 2 slices — (1) z-index + redirect fixes, (2) discussions filter + calendar fix

### Cycle B: Player of the Match (Issue 5) — Full feature
- Full 4-Gate design as a separate cycle
- Requires schema migration, new API endpoints, frontend voting flow, profile trophy

**Recommendation:** Treat as **two cycles**. Fix the 4 bugs first (fast, high-impact), then design Player of the Match properly as a feature cycle.

---

## 5. Pre-Gate Verification

```
turbo run build
  Tasks: 2 successful, 2 total
  Time: 46.591s
  ✅ PASS
```

---

## 6. Open Questions for Gate 1

1. **Calendar UX:** When no matches exist on a selected date, should we show an empty state, or show upcoming matches as "Discovering More"? (Recommendation: empty state is correct, but initial load should also filter by today to be consistent.)
2. **Active Discussions scope:** Should Completed matches show in messages with a "Completed" badge and read-only chat, or be hidden entirely? (Recommendation: hide Completed/Cancelled — only show Open/Full/InProgress.)
3. **Player of the Match timing:** What is the "strategically set" voting window? (Need user input for Gate 1 spec.)
4. **Player of the Match trigger:** Does voting open immediately after `completeMatch()`, or after a delay?
5. **Profile trophy display:** Simple badge count, or a detailed trophy room?
