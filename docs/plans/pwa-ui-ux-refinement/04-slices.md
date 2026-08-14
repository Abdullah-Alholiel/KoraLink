# Gate 4: Vertical Slices — PWA UI/UX Standardizations

> Execution plan divided into 4 self-contained tracer bullets. Each slice must pass `turbo run build` green.

---

## Slice Breakdown

### Slice 1: CSS Design Tokens & Top Action Bar Safe Areas
- **Scope**: Update `globals.css` with `--floating-cta-bottom` and `--top-safe-inset`. Update top action bar positioning in `match/[id]/page.tsx`.
- **Verification**: `npx vitest run` & `npm run build`.

### Slice 2: Floating CTA Elevation & Play FAB Clearance
- **Scope**: Update floating CTA containers in `match/[id]/page.tsx` and `clubs/[id]/page.tsx` to `bottom-[var(--floating-cta-bottom)]` and container max-width matching.
- **Verification**: Visual check of 16px clearance gap above Play FAB circle + `npm run build`.

### Slice 3: Compact Match Rules Sheet Redesign
- **Scope**: Refactor `MatchRulesSheet.tsx` into a 2-column grid (`grid-cols-2`) with compact cards.
- **Verification**: Confirm zero scrollbars on rules modal + `npm run build`.

### Slice 4: Desktop & Tablet Responsive App Chassis
- **Scope**: Refactor `MobileFrame.tsx` to provide a desktop app chassis (`max-w-md md:max-w-lg`, `md:rounded-[32px]`, `bg-slate-950` outer backdrop).
- **Verification**: Full monorepo `turbo run build` green + 91/91 unit tests passing.
