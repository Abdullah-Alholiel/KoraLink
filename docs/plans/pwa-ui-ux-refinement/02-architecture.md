# Gate 2: Architecture Spec — PWA UI/UX Tokens & Layout Engine

> System design, CSS custom properties, responsive container rules, and safe-area calculation engine.

---

## 1. System Architecture & CSS Tokens

### 1.1 CSS Custom Properties (`globals.css`)

```css
:root {
  /* Bottom Navigation Bar Height */
  --bottom-nav-height: calc(4.5rem + env(safe-area-inset-bottom));
  
  /* Floating CTA Offset: BottomNav height (72px) + Elevated Play FAB offset (28px) + Clearance gap (16px) */
  --floating-cta-bottom: calc(var(--bottom-nav-height) + 1.75rem);
  
  /* Top Safe Inset: Guarantees a minimum 1rem (16px) top padding regardless of device/browser */
  --top-safe-inset: max(1rem, env(safe-area-inset-top));
}
```

### 1.2 Desktop & Tablet Responsive Chassis (`MobileFrame.tsx`)

```
+-------------------------------------------------------------------+
|  Desktop Outer Backdrop (bg-slate-950 / bg-gray-900)             |
|                                                                   |
|       +---------------------------------------------------+       |
|       |  App Frame Container (bg-white shadow-2xl)        |       |
|       |  Mobile: w-full min-h-[100dvh] rounded-none       |       |
|       |  Tablet/Desktop: max-w-lg md:rounded-3xl md:my-4 |       |
|       |  Height: md:h-[calc(100dvh-2rem)]                 |       |
|       |                                                   |       |
|       |  [ Top Hero Header with --top-safe-inset ]        |       |
|       |                                                   |       |
|       |  [ Scrollable Viewport Content ]                  |       |
|       |                                                   |       |
|       |  [ Floating CTA at --floating-cta-bottom ]        |       |
|       |  [ BottomNav at bottom-0 ]                        |       |
|       +---------------------------------------------------+       |
|                                                                   |
+-------------------------------------------------------------------+
```

---

## 2. Layout Modules & Refactoring Plan

### Module 1: Floating CTA System
- Replace `fixed bottom-[var(--bottom-nav-height)]` with `fixed bottom-[var(--floating-cta-bottom)]` across `match/[id]/page.tsx` and `clubs/[id]/page.tsx`.
- Ensure floating CTAs inherit container width constraints (`max-w-md md:max-w-lg mx-auto`) so they stay perfectly aligned within the app frame on desktop.

### Module 2: Compact Match Rules Sheet
- Refactor `MatchRulesSheet.tsx`:
  - Change layout from single column vertical list (`py-3`) to a sleek **2-column grid** (`grid grid-cols-2 gap-2.5`).
  - Use compact rule cards with 24px icon pills and concise text (`text-[11px]`).
  - Reduce container padding from `pb-8` to `pb-4`.
  - Result: Total height reduced from 550px to ~340px, eliminating scrolling completely.

### Module 3: Top Action Bar Safe-Area System
- Update `match/[id]/page.tsx` top hero controls:
  - Change `absolute top-0 inset-x-0 flex items-center justify-between p-4 pt-safe z-10` to:
    `absolute top-0 inset-x-0 flex items-center justify-between px-5 pt-[var(--top-safe-inset)] z-10`.
- Update top navigation bars across profile, clubs, messages, and wallet pages to use `--top-safe-inset`.

### Module 4: Responsive App Shell (`MobileFrame.tsx`)
- Update `MobileFrame.tsx`:
  - Outer container: `bg-slate-950 min-h-[100dvh] flex items-center justify-center` on desktop.
  - App frame: `w-full max-w-md md:max-w-lg min-h-[100dvh] md:min-h-0 md:h-[96dvh] bg-white md:rounded-[32px] md:shadow-[0_25px_60px_-15px_rgba(0,0,0,0.5)] md:border md:border-slate-800 relative overflow-hidden flex flex-col`.
