# Gate 4: Vertical Slices — Page Scroll & Universal Sheet Standardization

> Execution plan divided into 4 self-contained tracer bullets. Each slice must pass `turbo run build` green.

---

## Slice Breakdown

### Slice 1: Viewport Height Boundary & Page Scroll Restoration (`MobileFrame.tsx`)
- Update `MobileFrame.tsx` container height to `h-[100dvh] max-h-[100dvh] overflow-hidden`.
- Update `match/[id]/page.tsx` inner scroll container to `flex-1 overflow-y-auto scroll-container bg-brand-bg relative h-full`.
- **Verification**: Confirm 100% smooth vertical scrolling on `match/[id]`.

### Slice 2: Universal Bottom Sheet Container Pattern (Match Sheets)
- Refactor `ChatSheet.tsx`, `PaymentSheet.tsx`, `FilterBar.tsx`, `MatchRulesSheet.tsx`, `CancelMatchSheet.tsx`, `LeaveMatchSheet.tsx`, `PlayerProfileSheet.tsx`.
- **Verification**: `npx vitest run` & `npm run build`.

### Slice 3: Universal Bottom Sheet Container Pattern (POTM, Host & Wallet Sheets)
- Refactor `PomVotingSheet.tsx`, `PomResultsSheet.tsx`, `TeamLineupSheet.tsx`, `VenuePickerSheet.tsx`, `PublishWarningSheet.tsx`, `wallet/page.tsx` TopUp modal.
- **Verification**: `npx vitest run` & `npm run build`.

### Slice 4: Full Monorepo Build & Comprehensive Verification
- Run `npx vitest run` (91/91 passing).
- Run `npm run build` (`turbo run build` into `.next-build` green).
