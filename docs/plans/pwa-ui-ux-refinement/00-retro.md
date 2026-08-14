# Gate 0: Retrospective — PWA UI/UX Layout & HIG Standardizations

> Review of existing layout implementations, safe-area bugs, and visual regressions prior to Gate 1.

---

## 1. Past Commit & Current State Analysis

Recent layout work standardized PWA safe-area padding across bottom sheets and navigation bars. However, user feedback and empirical visual testing revealed four critical HIG compliance regressions:

| Issue # | Area | Defect Description | Root Cause |
|---|---|---|---|
| **1** | Floating CTAs | `Join Match` and `Invite via WhatsApp` buttons overlap/touch the elevated center Play FAB button in `BottomNav`. | `bottom-[var(--bottom-nav-height)]` positions the bar at 72px from bottom, colliding with the `-mt-7` (28px) elevated center Play FAB circle. |
| **2** | Match Rules Sheet | Opening `View Match Rules` displays a tall modal with a vertical scrollbar. | Excess vertical padding (`py-3` per item, `pb-8` twice, large font gaps) pushes total height to ~550px, exceeding `max-h-[70vh]`. |
| **3** | Top Hero Action Bar | Top back `<` and chat `[x]` icons sit at 0px top margin on standard screens / notches. | `p-4 pt-safe` causes `pt-safe` to evaluate to `0px` when `env(safe-area-inset-top)` is 0px, eliminating top margin. |
| **4** | Desktop & Tablet View | Opening the PWA on desktop displays a rigid 448px box surrounded by flat white gutters and misaligned dev overlays. | `MobileFrame` uses a hardcoded `max-w-md` box on plain white background without desktop container framing or adaptive max-width scaling. |

---

## 2. Technical Debt & Contract Breaks

1. **Floating CTA Clearance Contract**: Floating action buttons must never touch or clip navigation bar items. They require an explicit clearance token (`--floating-cta-bottom`) incorporating the center FAB offset.
2. **Modal Sheet Compactness Contract**: Informational bottom sheets (e.g. `MatchRulesSheet`) must display all content within a single compact view without requiring user scroll.
3. **Safe Area Fallback Contract**: All top bar elements must enforce `max(1rem, env(safe-area-inset-top))` so top margins are never 0px on non-notch or standard browser viewports.
4. **Responsive Desktop Wrapper Contract**: PWA viewport must present a centered, elevated app chassis on desktop (`md:max-w-lg`, `md:my-4`, `md:shadow-2xl`, dark outer canvas) while remaining 100% fluid on mobile.

---

## 3. Mandatory Remediation Target
- Eliminate floating CTA and center Play FAB collision across `match/[id]` and `clubs/[id]`.
- Redesign `MatchRulesSheet` into a compact 2-column grid layout with zero scrolling required.
- Add `--top-safe-inset` to guarantee safe notch and status bar clearance across all top action headers.
- Refactor `MobileFrame` to support a premium desktop/tablet app frame with fluid mobile behavior.
