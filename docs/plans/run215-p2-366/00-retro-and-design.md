# P2-366 — Systemic tap-target deficit on sheet close/secondary controls

## Gate 0 — Retrospective (run #215, DB/Infra rotation, item = PWA a11y carry-over)
- Area audited: sheet close buttons + PaymentSheet consent checkbox across apps/player-pwa.
- Reviewers A+B (run #215): CLEAN on DB/Infra rotation focus (journal chain 62 entries contiguous,
  no ::uuid/eq-null regressions, CORS/CSP/trust-proxy sound, SW money-path NetworkOnly, i18n 1322=1322).
- Tech debt in scope: ~12 high-frequency controls render 32–36px visual + target; the project's own
  44px standard exists as `min-h-hit`/`min-w-hit` (tailwind.config.ts:28, P2-52 run #40) but was
  never applied to the sheet-close family. WCAG 2.5.8 target-minimum misses.
- Evidence (file:line, census run #215):
  - src/components/payment/PaymentSheet.tsx:119,125 (w-9 h-9 closes) + consent checkbox ~:223 (20px)
  - src/components/profile/DeleteAccountSheet.tsx:69; SignOutConfirmSheet.tsx:37
  - src/components/matches/ReportDisputeSheet.tsx:100; PlayerProfileSheet.tsx:88; ReportSheet.tsx:70;
    CancelMatchSheet.tsx:30; LeaveMatchSheet.tsx:32; PomResultsSheet.tsx:38; AttendanceSheet.tsx:48;
    OngoingGameJoinSheet.tsx:51; FilterBar.tsx:101; HostMatchForm.tsx:359
- Excluded (NOT tap targets): avatars/decorative icons (VenueReviewsSection 68/71, PostMatchSection,
  AttendanceSheet:76, AuthGuard spinner, ErrorState/RouteError icons, BottomNav logo).
- DECISIONS.md check: no owner standard contradicted (this ENFORCES the project's own 44px rule).

## Gates 1–3 — Compact program design
- Problem: closes/secondary controls on money/settings sheets miss the 44px hit-target standard.
- User story: As a player on a phone, tapping the X on PaymentSheet or the consent checkbox never
  misses, because the target is ≥44×44px even when the visual stays compact.
- Scope IN: the 12 button sites above + PaymentSheet consent checkbox touch row + one census pin test.
  Scope OUT: redesigning visuals; BottomNav; decorative icons; admin console.
- Contract: pure Tailwind change — add `min-h-hit min-w-hit` to the interactive buttons (visual
  w-8/w-9 stays, target grows); consent checkbox gets a ≥44px hit-area wrapper on its label row.
  No API/schema/i18n changes. No new visual regressions expected (buttons keep rounded-full centers).
- Acceptance criteria:
  1. Every listed interactive close/secondary button carries min-h-hit + min-w-hit.
  2. PaymentSheet consent checkbox row: hit area ≥44px (label wrapped or padded), visual unchanged.
  3. NEW census tripwire test bans any `w-8 h-8`/`w-9 h-9` BUTTON (onClick-bearing) lacking
     min-h-hit/min-w-hit in src/components + src/app (exempt: non-interactive divs/icons).
  4. Gates green in the lane: `npx turbo run build --concurrency=1` (root) + `cd apps/player-pwa
     && npx vitest run` (grep "Test Files" — vitest 2.x has no -C flag).
  5. No i18n key changes (parity untouched).

## Gate 4 slices
1. Tracer: PaymentSheet closes + consent row + census test → build+vitest.
2. Sweep the remaining 10 sheet/site buttons per the census list.
3. Full gates + PR.
