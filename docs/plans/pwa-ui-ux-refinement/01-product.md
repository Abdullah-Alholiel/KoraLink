# Gate 1: Product Spec — PWA UI/UX Refinement & Apple HIG Standardization

> User stories, functional scope, and visual acceptance criteria for PWA UI/UX improvements.

---

## 1. Product Goals

Standardize the KoraLink PWA interface to strictly align with Apple Human Interface Guidelines (HIG) for safe-area layout, spatial hierarchy, modal sheet compactness, and cross-device responsiveness (Desktop, Tablet, Mobile).

---

## 2. User Stories & Scope

### Story 1: Floating CTA Clearance
- **As a** player or host viewing a match details or club page,
- **I want** the floating `Join Match` and `Invite via WhatsApp` CTA buttons to float cleanly above the bottom navigation bar with clear breathing room,
- **So that** the buttons never touch, obscure, or collide with the elevated circular center "Play" button.

### Story 2: Compact Match Rules Sheet
- **As a** player tapping "View Match Rules",
- **I want** to read all 6 match rules cleanly in a single compact view without needing to scroll,
- **So that** I can instantly understand game rules and tap "Got It" without friction.

### Story 3: Notch & Status Bar Clearance
- **As a** mobile or desktop user,
- **I want** top action icons (back arrow `<`, chat `[x]`, search) to sit at a comfortable 16px+ margin from the top of the screen,
- **So that** icons are never jammed against the top edge or obscured by iPhone notches / Dynamic Islands.

### Story 4: Fluid Responsive Desktop & Tablet Experience
- **As a** user opening the PWA on a desktop browser or tablet,
- **I want** the application to present a polished, centered app canvas with an elegant dark backdrop and smooth shadow,
- **So that** the desktop experience feels like a native desktop app frame rather than a squished mobile slice in white space.

---

## 3. Success Criteria & HIG Acceptance Checklist

| Criteria | Metric | Target |
|---|---|---|
| **CTA Clearance** | Gap between CTA bottom and elevated Play FAB top edge | ≥ 12px clear space (zero overlap) |
| **Rules Sheet Scroll** | Vertical scrollbar on `MatchRulesSheet` | **0 scrollbars** (100% visible on standard mobile viewports) |
| **Top Bar Clearance** | Top action icon margin from screen edge | ≥ `max(16px, env(safe-area-inset-top))` |
| **Desktop Canvas** | Desktop/Tablet presentation | Centered chassis (`max-w-lg`/`max-w-xl`), sleek backdrop, zero overflow |
| **Build Integrity** | `turbo run build` status | Pass (0 errors) |
