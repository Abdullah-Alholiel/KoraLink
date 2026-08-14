# Gate 1: Product Spec — PWA Page Scroll & Universal Bottom Sheet Standardization

> User stories, functional scope, and visual acceptance criteria for fixing page scrolling and standardizing all bottom sheets.

---

## 1. Product Goals

1. **Restore Full Page Scrollability**: Ensure `match/[id]`, `clubs/[id]`, `host`, and all main viewports scroll smoothly across touch and desktop mousewheel devices.
2. **Universal Bottom Sheet Standardization**: Standardize all 13 bottom sheets across the PWA so they present as elegant, responsive, slide-up panels centered within the app container on mobile, tablet, and desktop.

---

## 2. User Stories & Scope

### Story 1: Match Detail Page Scrolling
- **As a** player or host viewing a game detail page (`match/[id]`),
- **I want** to scroll down smoothly to view Game Details, Location Map, Match Rules, Team Lineup, and Discussions,
- **So that** I can access all game information without any scroll locking.

### Story 2: Universal Bottom Sheet Responsive Standard
- **As a** player opening any bottom sheet (`ChatSheet`, `PaymentSheet`, `MatchRulesSheet`, `FilterBar`, `PlayerProfileSheet`, `PomVotingSheet`, `PomResultsSheet`, `TeamLineupSheet`, `VenuePickerSheet`, `CancelMatchSheet`, `LeaveMatchSheet`, `PublishWarningSheet`, `WalletTopUp`),
- **I want** the sheet to slide up smoothly, fill up to 85vh maximum height, and provide clean internal scrolling for long content,
- **So that** sheets look native and consistent across mobile, tablet, and desktop screens.

---

## 3. Success Criteria & Acceptance Checklist

| Criteria | Metric | Target |
|---|---|---|
| **Game Detail Scroll** | Vertical scrollability on `match/[id]` | **100% scrollable** (all sections accessible) |
| **Main Layout Scroll** | Vertical scrollability on Feed, Clubs, My Games, Profile, Messages | **100% scrollable** |
| **Sheet Sizing Standard** | Sheet container max-width | `max-w-2xl` centered inside `max-w-6xl` app frame |
| **Sheet Internal Scroll** | Internal content overflow handling | `overflow-y-auto scroll-container flex-1 max-h-[85vh]` |
| **Build Integrity** | `turbo run build` status | Pass (0 errors) |
