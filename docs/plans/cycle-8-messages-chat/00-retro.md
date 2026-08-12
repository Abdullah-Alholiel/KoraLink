# Cycle 8 — Retrospective

## Baseline
- **Baseline commit:** `6bc8a57` (feat(profile): editable personal info, post-match review UI)
- **Build:** ✅ `npm run build` passes with zero errors
- **Tests:** 10 pre-existing failures (stale test files referencing deleted hooks — not from current work)
- **Working tree:** Clean (stashed pre-cycle drift)

## Recent Commit Pattern (last 10)
```
6bc8a57 feat(profile): editable personal info, post-match review UI
bfa48b6 feat(play): match card badges, play filters, surface type, rich seed data
de3f491 docs: cycle-1b retrospective
5bf1766 fix: repair broken login/data flow
6e802de feat(push): push notifications infrastructure
61d3654 feat(reviews): player rating system
145fe57 feat(ux): wire chat send, add ErrorBoundary, toast notifications
5bbdc0b feat: slot payment, cancellation refund, recurring slots
615e6ea feat: match lifecycle auto-complete, POM voting sheet
a1a4143 fix(host): auto-populate date/time from slot
```
**Fix:Feat ratio:** 2:7 → healthy (0.29:1). Most commits are features.

## Current State Audit

### 1. Messages Screen (`apps/player-pwa/src/app/[locale]/(main)/messages/page.tsx`)
- **What exists:** Displays match discussions grouped by date (Today, Tomorrow, This Week, Upcoming, Past)
- **Data source:** `useMyMatches()` → `GET /users/me/matches` → `adaptMatchList()` → `Match[]`
- **Card design:** Match-style cards with avatar initial, title, status badge, location, time, spots
- **What's missing vs screenshot:**
  - Screenshot shows WhatsApp-style discussion cards (avatar, name, last message preview, time, unread indicator)
  - No personal messaging capabilities
  - No `DiscussionCard` component — uses match cards rendered differently
  - No unread count badges
  - No last message preview line
  - No online/offline indicators

### 2. Personal Messages — NONE EXISTS
- **DB:** No `personal_messages` or `conversations` table
- **API:** No personal message endpoints
- **Frontend:** No personal chat UI, no DM hooks, no conversation list
- **This is a greenfield feature**

### 3. Match Detail — Joined State Order
**Current order** (from `match/[id]/page.tsx` lines 232-355):
1. GameDetails
2. View Match Rules (centered trophy button)
3. Location / Map
4. PostMatchSection (completed only)
5. ReviewSection (completed only)
6. TeamLineup
7. Leave Match button
8. Host lifecycle controls (Start/Complete)
9. Cancel Match (host only)
10. WhatsApp Invite (sticky CTA at bottom)

**Screenshot order** (derived from pixel analysis):
1. GameDetails
2. TeamLineup (main visual — takes ~40% of content height)
3. Chat / Discussion preview
4. Location / Map
5. View Rules
6. Bottom CTA

**Delta:** TeamLineup should be RIGHT AFTER GameDetails (not after Location+Rules+Reviews). Chat/Discussion should be prominent. Location moves down.

### 4. MatchRulesSheet
**Current:** Rules items with icon+title+description. No action button at bottom.
**Screenshot:** Has a green CTA button at the bottom of the sheet (`#254132`).
**Delta:** Missing bottom action button (likely "I Understand" / "Got It" / close button).

### 5. DiscussionCard Component
**Current:** Match cards adapted for messages screen. No dedicated DiscussionCard.
**Screenshot:** Clean WhatsApp-style discussion preview cards.
**Delta:** Need a new `DiscussionCard` component with: avatar, name, last message, timestamp, unread badge.

## Findings Classification

### CRITICAL
- **C1:** No personal messaging infrastructure (DB → API → UI) — entire feature missing
- **C2:** Messages screen reuses match cards instead of discussion cards — wrong UX pattern

### IMPORTANT
- **I1:** Match detail joined state order is wrong (TeamLineup buried under Location+Rules)
- **I2:** MatchRulesSheet missing bottom CTA button per design spec

### MINOR
- **M1:** Messages screen has no unread/read state tracking
- **M2:** ChatSheet is match-scoped only; no personal conversation support
- **M3:** No `last_message` or `updated_at` tracking on match_messages for list preview

## Cascade Impact Map
```
No personal_messages table
  → No conversation list endpoint
    → No DiscussionCard data source
      → Messages screen shows match cards (wrong UX)
      
Match detail order wrong
  → Joined users see Location before TeamLineup
    → Poor UX: can't see who's playing without scrolling past venue info
    
MatchRulesSheet missing CTA
  → User must find X button to close
    → Less intuitive dismiss behavior
```

## Recommendation
**Proceed to Gate 1.** This cycle has two intertwined workstreams:
1. **Workstream A: Messages + Discussion cards** — Build DiscussionCard component, restructure messages screen to match screenshot, lay personal messaging foundation (DB schema + table, scalable architecture)
2. **Workstream B: Match detail polish** — Reorder joined state sections, add MatchRulesSheet CTA
