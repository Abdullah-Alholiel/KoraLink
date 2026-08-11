# Gate 0 — Retrospective: Host Match Dual Mode Feature

**Date:** 2026-08-11
**Baseline commit:** `3321a54` (latest on main)
**Feature:** Add "Book via Us" vs "Book by Yourself" dual-mode top bar to Host Match form

---

## 1. Commit Pattern Analysis

```
3321a54 fix: stale Full status — defensive revert in joinMatch
07ce451 feat: Messages screen redesign — grouped, styled, searchable
a05d3d8 fix: PlayerProfileSheet spacing — standardized bottom sheet layout
d47010e fix: pre-join team lineup — embed directly, remove duplication
b719de5 fix: host counted in spots_filled — card + detail show 1/22 not 0/22
e74e919 feat: match lifecycle, dead buttons, public profiles — audit cycle
d9d5e5c fix: standardize team lineup format, fix max_players, fix duplicate nav
090d605 feat(lineup): two-team auto-assignment, clickable profiles, count fix
d0e62f7 fix: 8 bug fixes — discussions, spots, UI, clickable cards, team lineup
bab5bf2 feat(pom): Player of the Match voting, results, and profile trophy
ab7681f fix(play): z-index overflow, login redirect, discussions filter, calendar, search
8b0d39a fix(matches): correct uuid→text cast for is_joined subquery
a7e351c fix: review — useMatch reactive currentUserId, export buildComments, sw precache
d5f9ef1 fix: feed-chat-access — BOOL_OR replaces EXISTS, AuthBootstrap cold-load, ChatSheet
8acc848 fix: match-state-propagation — state-aware cards, sheets, EXISTS subquery
f5ef8cd fix: match-flow-remediation — clickable cards, wallet transactions, live state
9ce4487 fix: match state accuracy — isJoined survives refresh + leave/cancel
1a38e61 fix: business-logic completeness — real payment, i18n, match states
569ab5b fix: interactive completeness — 8 bugs fixed across 8 files
73a2c3f fix: state-language-profile-join remediation — 7 bugs fixed
```

### Fix:Feat Ratio

- **16 fixes** vs **4 features** = **4:1 ratio**
- **CRITICAL:** Ratio exceeds the 1.5:1 threshold — we are in a reactive fix loop.
- Pattern: Features ship, then 3-4 fix commits follow to correct state propagation, contract mismatches, and dead UI.

### Key Observations

| Observation | Evidence |
|-------------|----------|
| State propagation bugs dominate | `f5ef8cd`, `9ce4487`, `d5f9ef1`, `8acc848` — all fix `isJoined`/`isUserHost` not flowing to MatchCard |
| Contract mismatches persist after fix cycles | `b719de5` reverts `spots_filled` filter — product decision reversed after shipping |
| UI polish always follows logic fixes | `a05d3d8`, `d47010e` fix spacing/duplication after feature work |
| i18n coverage was late | `1a38e61` added i18n after business logic shipped |

---

## 2. Current Host Match Form Audit

### Files Involved

| Layer | File | Key Points |
|-------|------|------------|
| **Page** | `apps/player-pwa/src/app/[locale]/host/page.tsx` | Thin wrapper — `<MobileFrame><HostMatchForm /></MobileFrame>` |
| **Component** | `apps/player-pwa/src/components/host/HostMatchForm.tsx` | 507-line monolithic component with all form logic |
| **Hook** | `apps/player-pwa/src/hooks/useMatches.ts` | `useCreateMatch()` mutation + `hostMatchSchema` Zod schema |
| **Venue Hook** | `apps/player-pwa/src/hooks/useVenues.ts` | `useVenues()` list + `useVenue(id)` detail |
| **Backend DTO** | `apps/api/src/modules/matches/dto/create-match.dto.ts` | `CreateMatchDto` — 8 fields |
| **Backend Service** | `apps/api/src/modules/matches/matches.service.ts` | `createMatch()` — validates pitch, inserts match + host player, returns `findOne(id)` |
| **i18n** | `en.json`, `ar.json` | `host.*` namespace — ~35 keys |

### What Works Well

1. ✅ Mutation return contract respected — `createMatch()` returns `this.findOne(created.id)` with all relations
2. ✅ Zod schema (`hostMatchSchema`) matches backend `CreateMatchDto` field-for-field
3. ✅ Venue picker uses bottom sheet pattern with correct z-index (`z-[60]`/`z-[70]`)
4. ✅ All 5 UX states handled (loading skeletons, empty/no results, error, populated, edge cases)
5. ✅ Form uses i18n for all strings
6. ✅ Disclaimer already warns about pitch responsibility
7. ✅ Cost calculation (host plays free, player share = pitchCost / (max_players - 1))

### What's Missing / Technical Debt

| # | Finding | Severity | Impact |
|---|---------|----------|--------|
| 1 | **No `booking_mode` field anywhere** — backend DTO + schema have no way to distinguish "Book via Us" vs "Book by Yourself" | CRITICAL | Dual-mode feature requires new DB column, DTO field, Zod field, and logic |
| 2 | **No slot/availability concept** — database has no `pitch_slots` or `availability` tables | CRITICAL | "Book via Us" mode needs to show bookable time slots per pitch |
| 3 | **Monolithic 507-line component** — all form logic in one file, no extraction of sub-components | IMPORTANT | Adding dual-mode will balloon this beyond maintainable limits. The form needs splitting into mode-specific sub-components |
| 4 | **Venue picker works off ALL venues** — `useVenues()` returns all approved venues | IMPORTANT | "Book via Us" must filter to KoraLink-partner venues only (likely via a new `is_koralink_partner` flag on venues table) |
| 5 | **No pre-publish confirmation step** — `handlePublish()` calls mutation directly | IMPORTANT | "Book by Yourself" needs a warning modal before publishing to confirm responsibility |
| 6 | **Club detail page (`clubs/[id]`) has no slot selection** — shows pitch list with "Host a Match Here" CTA only | IMPORTANT | "Book via Us" borrows from club detail but needs slots added |
| 7 | **`max_players` derived in component, not sent as-is** — form computes from format, but backend also expects `max_players` in DTO | MINOR | Already handled correctly — component computes and passes |
| 8 | **No analytics tracking** — no PostHog events for match creation flow | MINOR | AGENTS.md §4.3 mandates PostHog for all user actions |
| 9 | **Component has duplicate `Form State` section comment** (lines 49 and 60) | TRIVIAL | Code cleanliness |

---

## 3. Contract Risk Assessment for Dual-Mode Feature

### New Database Requirements

```
┌─────────────────────────────────────────┐
│  New: pitch_slots table                 │
│  - id: varchar(36)                      │
│  - pitch_id → pitches (FK)              │
│  - day_of_week: int (0=Sun, 6=Sat)     │
│  - start_time: time                     │
│  - end_time: time                       │
│  - is_booked: boolean (default false)   │
│  - created_at, updated_at               │
├─────────────────────────────────────────┤
│  New on venues table:                   │
│  - is_koralink_partner: boolean         │
│    (default false)                      │
├─────────────────────────────────────────┤
│  New on matches table:                  │
│  - booking_mode: enum                   │
│    ('koralink' | 'self')                │
│  - booking_slot_id → pitch_slots (FK,   │
│    nullable — only for koralink mode)   │
└─────────────────────────────────────────┘
```

### API Contract Changes

| Change | Current | New |
|--------|---------|-----|
| `POST /matches` body | 8 fields | + `booking_mode`, + `booking_slot_id?` |
| `GET /venues` (filter) | city filter only | + `is_koralink_partner` filter |
| `GET /pitches/:id/slots` | Does not exist | NEW — returns available slots for a pitch |
| `POST /venues/:id/slots/book` | Does not exist | NEW — books a slot (marks `is_booked`) |

### Frontend Component Split

```
Current (1 monolith):           Proposed:
HostMatchForm.tsx (507 lines)    HostMatchForm.tsx          — outer shell: mode toggle + shared layout
                                 components/host/
                                 ├── BookViaUsForm.tsx      — "Book via Us" mode
                                 ├── BookYourselfForm.tsx   — "Book by Yourself" mode
                                 ├── VenuePickerSheet.tsx   — reusable venue picker (already present inline)
                                 ├── PitchSlotPicker.tsx    — NEW: slot/time selection
                                 ├── PublishWarningSheet.tsx — NEW: confirmation/warning modal
                                 └── MatchDetailsForm.tsx   — shared fields: title, format, type, gender, date/time, duration
```

---

## 4. Most Common Pitfalls Relevant to This Feature

| Pitfall | Prevention Strategy |
|---------|-------------------|
| **Mutation returns bare row** | Already correctly handled — `createMatch` returns `findOne(id)`. Extend, don't break. |
| **Frontend Zod doesn't match backend DTO** | Add `booking_mode` + `booking_slot_id` to BOTH sides simultaneously. Gate 3 will lock this contract. |
| **i18n keys missing in one language** | Gate 3 will enumerate every new key. Both `ar.json` and `en.json` updated before slice 1. |
| **Z-index conflicts with BottomNav** | Bottom sheets already use `z-[60]`/`z-[70]`. Warning modal will follow same pattern. |
| **Dead UI — toggle without handler** | Mode toggle buttons MUST have `onClick` handlers that swap form mode. |
| **`spots_filled` counting host** | Already correct — host counts as a spot. Don't regress. |
| **`max_players` from `parseInt(format.charAt(0))*2`** | Already fixed — uses `parseInt(format.split('v')[0])*2`. |

---

## 5. Classification & Recommendation

### CRITICAL (blockers)
- C1: New `booking_mode` field on matches table + DTO + Zod schema
- C2: New `pitch_slots` table for bookable time slots
- C3: New `is_koralink_partner` flag on venues

### IMPORTANT (should address)
- I1: Split monolithic `HostMatchForm.tsx` into sub-components
- I2: Pre-publish warning confirmation modal for "Book by Yourself" mode
- I3: Filter venues to Koralink partners for "Book via Us" mode
- I4: Pitch slot picker component for "Book via Us" mode

### MINOR (nice-to-have)
- M1: PostHog analytics events
- M2: Remove duplicate section comment
- M3: Loading states for slot availability

### Recommendation

**PROCEED to Gate 1.** This feature is well-scoped and builds on a stable foundation. The main risks are:
1. The database schema changes (new tables/columns) — need migrations
2. The monolithic component needs extraction before adding dual-mode to prevent a 1000+ line component
3. The slot/availability system is net-new and needs careful design

The 4:1 fix:feat ratio means we need to be EXTRA careful about contract alignment at Gate 3 — every field must be locked before any code is written.

---

## 6. Gate Boundary Checklist

- [x] `npm run build` — ✅ passes (see terminal output above)
- [x] Git working tree clean — ✅
- [x] gh auth working — ✅ (Abdullah-Alholiel)
- [ ] Gate 0 approved by user — ⏸️ PENDING

---

**Status:** ⏸️ PENDING APPROVAL — awaiting user review before Gate 1
