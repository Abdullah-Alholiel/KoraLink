# Bottom Sheet iOS PWA Fix — Gate 0 Retrospective & Plan

**Cycle:** bottom-sheet-ios-fix
**Date:** 2026-08-16
**Trigger:** "bottom sheets glitching and not shown all — iPhone PWA bookmarked app"

---

## 0. Retrospective — Root Cause Analysis

Audited every bottom sheet (`rounded-t-3xl` / `fixed bottom-0` sites) across
`apps/player-pwa`. Found **five** distinct defects, three of which are iOS-PWA
specific and directly explain "glitching" + "not shown all".

### RC1 — `transform` animation applied directly to `position: fixed` elements (GLITCH)

`animate-slide-up` runs `transform: translateY(100%) → translateY(0)` with
`forwards` fill. On iOS Safari a CSS `transform` on a `position: fixed` element
creates a new containing block and re-anchors it mid-animation → visible jump /
flicker. 14 sheets correctly put the transform on an inner (non-fixed) wrapper;
**2** put it on the fixed element itself:

| File | Line | Pattern |
|------|------|---------|
| `components/layout/NotificationSheet.tsx` | 95 | `fixed … animate-slide-up` same el |
| `app/[locale]/clubs/[id]/page.tsx` | 302 | `fixed … animate-slide-up` same el |

### RC2 — static `vh` instead of dynamic `dvh` for sheet height (NOT SHOWN ALL)

The shell uses `--app-height: 100dvh`, but every sheet caps height with static
`vh` (the LARGE viewport — ignores the on-screen keyboard / bottom toolbar).
When the visual viewport shrinks, `max-h-[85vh]` stays tall while the visible
area is smaller → bottom of the sheet (input row, CTA) is pushed off-screen.

| File | Line | Value |
|------|------|-------|
| `components/payment/PaymentSheet.tsx` | 79 | `h-[75vh]` |
| `components/matches/ChatSheet.tsx` | 132 | `max-h-[85vh]` |
| `components/matches/PomVotingSheet.tsx` | 76 | `max-h-[85vh]` |
| `components/matches/PomResultsSheet.tsx` | 34 | `max-h-[80vh]` |
| `components/matches/TeamLineupSheet.tsx` | 32 | `max-h-[80vh]` |
| `components/host/VenuePickerSheet.tsx` | 30 | `max-h-[75vh]` |
| `components/matches/PlayerProfileSheet.tsx` | 32 | `max-h-[75vh]` |
| `components/matches/FilterBar.tsx` | 84 | `max-h-[80vh]` |
| `components/layout/NotificationSheet.tsx` | 95 | `max-h-[85vh]` |
| `app/[locale]/clubs/[id]/page.tsx` | 302 | `max-h-[75vh]` |

### RC3 — `EmergencyCancelSheet` uses deprecated `z-50` (CLIPPED BEHIND NAV)

`BottomNav` is `z-50` and renders later in the DOM → a `z-50` sheet ties and
loses paint order, clipping content behind the nav. Skill mandates `z-[60]`
backdrop / `z-[70]` sheet.

### RC4 — missing `pb-safe` (home-indicator overlap)

`NotificationSheet`, `clubs/[id]` calendar sheet, and `EmergencyCancelSheet`
have no `env(safe-area-inset-bottom)` padding → bottom row sits under the iPhone
home indicator with `viewportFit: cover`.

### RC5 — keyboard doesn't resize the visual viewport (NOT SHOWN ALL, inputs)

The viewport meta has no `interactive-widget`, so iOS keeps `dvh`/`svh` at the
full height when the keyboard opens. `dvh` alone won't track the keyboard.
Adding `interactive-widget=resizes-content` makes `dvh` shrink to the
keyboard-resized viewport.

---

## 1. Scope (IN / OUT)

**IN SCOPE** (presentation-layer only — zero API/data/i18n changes):
1. Viewport `interactiveWidget: 'resizes-content'` (`[locale]/layout.tsx`).
2. `vh → dvh` for all 10 sheet height caps.
3. Move `animate-slide-up` off the `fixed` element in the 2 offenders (wrap content in an inner div).
4. `z-50 → z-[60]/z-[70]` + `pb-safe` + `max-h` for `EmergencyCancelSheet`.
5. `pb-safe` on `NotificationSheet` + `clubs/[id]` calendar sheet.

**OUT OF SCOPE:** `body { position: fixed }` shell refactor (validated in a prior
cycle, high regression risk for no proven gain here); non-sheet `vh` usages
(`min-h-[50vh]/[60vh]` on match page content).

## 2. Contract (no API surface changes)

No backend, DTO, adapter, or i18n-key changes. All edits are Tailwind class
strings in 12 frontend files. Build + vitest are the verification gates.

## 3. Verification

- `turbo run build` (root) → zero errors.
- `npx vitest run` in `apps/player-pwa` → all green.
- Manual: iPhone standalone PWA — open ChatSheet (keyboard), NotificationSheet,
  club calendar, Payment, TeamLineup, POM voting/results, EmergencyCancel.

## 4. Round 2 — POTM sheets still clipped + "scroll anywhere"

After the vh→dvh round, POTM voting/results were STILL not shown fully. Root cause
found: `PomVotingSheet`/`PomResultsSheet` render inside `PostMatchSection`, which
lives inside the match-detail `scroll-container` (`-webkit-overflow-scrolling:
touch` + the parallax hero's `will-change-transform`). On iOS that container
becomes the containing block for `position: fixed` descendants, so those sheets
anchored/clipped to the scroll container instead of the viewport. Every *working*
sheet rendered directly in `MobileFrame`.

**Fix — shared portal-based `BottomSheet` component** (`components/layout/BottomSheet.tsx`):
- `createPortal` to `document.body` → every sheet escapes any scroll-container/transform ancestor.
- Backdrop `z-[60]` + fixed wrapper `z-[70]` + panel `flex flex-col max-h-[XXdvh] pb-safe animate-slide-up`.
- Scrollable bodies use `flex-1 overflow-y-auto scroll-container min-h-0` (fixed chrome gets `flex-shrink-0`).
- Migrated all 15+ sheets (POM voting/results, Chat, Notification, Payment, Rules,
  Cancel/Leave/Emergency/Ongoing, PublishWarning, VenuePicker, PlayerProfile,
  TeamLineup, FilterBar, club calendar, wallet top-up) to it.

This guarantees every sheet is viewport-anchored AND scrolls when content is tall.
