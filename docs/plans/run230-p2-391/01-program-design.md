# Run #230 — P2-391 Top-Band Overlay Stacking — Gates 0–3

Cycle: `docs/plans/run230-p2-391/` · Lane: `lane/run230-p2-391` (worktree `~/worktrees/koralink/run230-p2-391`)
Build item: **P2-391** — top-band overlay stacking at ≤430px (P2-371 real-browser baseline, 330 overlap instances across 66 loads).

## Gate 0 — Retrospective (2026-11-25)

Board truth-sweep first (this run's retro finding): the directive's suggested picks were both
stale — **P2-335** (audit date-range) was already BUILT by PR #235 `e244fdd` (audit/page.tsx:45-66
from/to + export parity + ListAuditDto shape; P2-340 hex row already attributes the throw to it)
and **P2-338** (settlements can()) is covered by PR #294 (`canPay/canGenerate` settlements/page.tsx:39-40).
Both rows' Status cells still said TODO — closed this run as premise-stale (claims≠facts, reverse
direction: the run-#213 'next pick' recommendations were stale, same pattern as P2-336/337).

Launch-order consult (`~/projects/life-os/readiness/koralink-production-plan.md` §2/§5): F1-F6
BUILT+LIVE, F7's remaining half needs owner A2 session, F8 gated on Neon heal (cutover), F9 awaits
owner repo, F10 gated on A6 — the factory-executable launch chain is fully owner-blocked. P2-391 is
the highest-priority non-gated, user-visible row (P2, mid size).

Admin state check (Phase 3.5 step 0): apps/admin + partner API surface CLEAN (no dirty files),
service active → admin items were pickable this run; rotation focus kept as review-only lens
(Reviewer A confirmed can() census complete — 16/16 pages gated).

Recent-area audit: PR #289 (P2-392) already moved InstallPrompt bottom-anchored with 44px targets —
the row's InstallPrompt evidence is stale in current code; the LIVE defect is the geolocation pill
(LocationProvider.tsx:79) vs Toast (Toast.tsx:65) pair + absolute page titles under authed standalone
shells. Scope re-centered accordingly.

Review intake (run #230 reviewers, claims≠facts applied):
- CONFIRMED IMPORTANT-1: pill (z-[80], fixed top) vs Toast (z-[100], fixed top) physically overlap;
  Toast occludes the pill's Enable/Dismiss buttons while both mounted.
- CONFIRMED MINOR: no documented z-ladder for the 4 fixed top-overlay owners.
- REFUTED (Reviewer B P1-a): reschedule shortfall does NOT bypass the classifier — useMatchActions
  checks `error?.code === 'WALLET_INSUFFICIENT'` FIRST (machine code), message-parse only as the
  documented deploy-skew fallback (PR #262 pattern).
- REFUTED (Reviewer B P1-b): join flow DOES consume the new insufficientFunds kind —
  PaymentSheet.tsx:103 `t(errorKey(classifyError(err)))`.
- MINOR-3 (z-scale doc), MINOR-4 (Toast raw safe-area drift), MINOR-5 (match-page floating-CTA
  duplication) accepted as riders of this same slice (this build owns the band contract).

## Gate 1 — Product Spec

**Problem:** on phones ≤430px, the geolocation pill ("فعّل موقعك" / enable-location card) and an app
toast render in the same top band and overlap. The toast wins paint (higher z) and swallows taps —
the pill's Enable / Not-now buttons become untappable while the toast is up. Authed standalone shells
(complete-profile, messages/[id], clubs/[id]) also sit under the pill with their headers un-reserved.
First-visit + disconnected users see titles/banners/toasts stacked (the P2-371 baseline measured 330
overlap instances across 66 loads; the InstallPrompt half of that inventory is already fixed by PR #289).

**User story:** as a signed-in player on a phone, when the location prompt and a toast are both
visible, I can read and tap both — the toast floats ABOVE the pill without covering its buttons, and
page content/headers shift down only while the pill is mounted, never leaving a gap when it unmounts.

**IN scope:** slot/reservation contract for the top band (CSS vars + measurement), pill/Toast z-order,
MobileFrame inner reservation, standalone-shell header vars, z-ladder documentation, tripwire tests.
**OUT of scope:** bottom-band overlays (already own documented offsets), sheet z-indices (z-[60]/[70]
standard is untouched), legal/realtime banners (not fixed overlays), backend/API changes, new i18n keys.

**Success criteria:**
1. Pill visible + toast visible ⇒ toast renders BELOW the pill (stacked), pill buttons tappable
   (pill target not under the toast box).
2. Pill unmount ⇒ zero reserved space left (no blank strip; `--top-banner-h` returns to 0).
3. Standalone shells' headers sit below the pill (no overlap) while mounted.
4. Z-ladder documented in one place (globals.css) — future overlay work has a contract to extend.
5. All gates green (turbo 3/3 sequential, vitest full suite, tsc 0).

## Gate 2 — Architecture

Data flow (pure client-side layout): geolocation state → LocationProvider renders pill → pill's
ResizeObserver writes measured height to `documentElement.style` `--top-banner-h` → two consumers:
(a) `--top-band-top: calc(var(--top-safe-inset) + var(--top-banner-h))` (globals.css) shifts Toast +
standalone-shell headers down by exactly the pill's height; (b) MobileFrame inner box reserves the
row via `padding-top: calc(var(--top-safe-inset) + var(--top-banner-h))` while headers opt out of
double-counting. Page content never leaves a gap (padding collapses with the var). Z-order: pill
moves z-[80] → z-[46] (documented "band slot" rung; toast band z-[47], sheet backdrop z-[60]) so
paint order matches DOM order; toasts float above the pill and never cover its buttons.

Component changes:
| File | Change |
|---|---|
| `src/styles/globals.css` | +`--top-banner-h: 0px`, `--top-band-top: max(...)`; z-ladder comment block |
| `src/providers/LocationProvider.tsx` | z-[80]→z-[46]; ResizeObserver measures card → sets `--top-banner-h` (mount/unmount cleanup) |
| `src/components/layout/Toast.tsx` | top = `var(--top-band-top)` (replaces raw 1.5rem+env calc; also fixes MINOR-4 drift) |
| `src/styles/globals.css` (shell) | `.app-shell { padding-top: var(--top-banner-h) }` — the single reservation point |
| `src/components/layout/MobileFrame.tsx` | height `calc(var(--app-height) - var(--top-banner-h))` — frame ends at canvas bottom, nav never clips |
| `test/p2391-top-band.test.tsx` (new) | tripwires: z-order, var contract, MobileFrame reservation, Toast slot |

**IMPLEMENTATION PIVOT (recorded post-PR-Agent #298 r1, parent-verified):** the original plan's
per-page header swaps (`pt-[var(--top-safe-inset)]` → `pt-[var(--top-band-top)]` on
complete-profile / messages/[id] / clubs/[id]) and a ViewportHeightSync band-calc were DROPPED —
replaced by the single `.app-shell` padding reservation + MobileFrame height calc. Why this is
strictly better:
1. `.app-shell` padding shifts EVERY in-flow header (complete-profile, messages/[id], clubs/[id]
   headers are plain flex children of in-flow page roots — verified in the tree) with ZERO per-page
   edits; a per-page swap would have DOUBLE-shifted those headers (shell padding + own band var).
2. MobileFrame (and everything absolutely positioned INSIDE it, e.g. match/[id]'s absolute header)
   rides the frame's own shift — the frame starts exactly at the pill's bottom edge.
3. Height math stays closed without touching ViewportHeightSync: `.app-shell` padding (banner) +
   MobileFrame `--app-height − banner` = exactly `--app-height`; standalone-mode pinning and the
   v3 visible-canvas contract are untouched (its test suite pins exact values — unchanged).
4. Fixed-top overlays are covered explicitly: Toast via `--top-band-top`; the only other fixed-top
   owner is the pill itself.

Risks & mitigations: double-count — resolved BY the pivot: the shell padding is the ONLY
reservation; no page or header adds its own band offset, so double-shifting is structurally
impossible. Measurement loop → ResizeObserver writes only on value change. SSR/hydration →
vars default to 0px; the pill renders client-side only (no SSR markup depends on JS-written
values). Untouched contract: ViewportHeightSync v3 (its spec pins exact values and stays
green), bottom-band offsets, sheet z-indices.

## Gate 3 — Program Design (contract)

Exact shapes (all client-side; no API contract):

```ts
// globals.css additions (:root)
--top-banner-h: 0px;                                            /* pill-measured, JS-written */
--top-band-top: calc(var(--top-safe-inset) + var(--top-banner-h)); /* where floating top UI sits */

// LocationProvider (pill container, was z-[80]):
<div className="fixed inset-x-0 top-0 z-[46] max-w-md mx-auto pointer-events-none" ref={containerRef}>
  // card measured: new ResizeObserver(entries => {
  //   const h = Math.round(entries[0].borderBoxSize?.[0]?.blockSize ?? card.getBoundingClientRect().height);
  //   const next = h > 0 ? `${h}px` : '0px';
  //   if (documentElement.style.getPropertyValue('--top-banner-h') !== next) setProperty('--top-banner-h', next);
  // }).observe(card); disconnect + reset on unmount/status-change
```

TS signatures (changed files only):
```ts
// Toast.tsx (className only — no props/signature change)
className="fixed top-[var(--top-band-top)] inset-x-0 z-[100] ..."
// MobileFrame.tsx (inner box style attr — no props change)
style={{ paddingTop: 'calc(var(--top-safe-inset) + var(--top-banner-h))' }}
// ViewportHeightSync.tsx (apply() pinned value — no signature change)
document.documentElement.style.setProperty('--app-height', `calc(${canvas}px - var(--top-banner-h, 0px))`);
```

i18n contract: **zero new keys** (layout-only change; all copy already exists in `location.*` and
`toast` surfaces). EN+AR parity unchanged (1332=1332 must hold).

Contract verification checklist (Gate 3, run explicitly):
- ✓ No API endpoint/DTO touched — no response-shape risk (layout-only cycle).
- ✓ Frontend types unchanged — no adapter/hook signature change (className/style-only edits).
- ✓ i18n keys: 0 added, 0 removed — parity assertion in the existing i18n tests must stay green.
- ✓ No field silently undefined — no data flow touched.
- ✓ Z-order contract documented in one place (globals.css comment block) — future overlay owners
  extend the ladder instead of inventing z values.
- ✓ SSR/hydration: pill renders client-side only (auth-gated); CSS vars default 0px — no markup
  depends on JS-written values before hydration.
