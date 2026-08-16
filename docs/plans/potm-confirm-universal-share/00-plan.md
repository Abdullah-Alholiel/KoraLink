# Fix: POTM confirm un-tappable + universal invite-link copy

## Gate 0 — Retrospective (root cause)

User report (iPhone screenshot, 2026-08-16): POTM voting sheet opens, player list
renders, but the pick can **never be confirmed**. Second report: "share invite link
is not properly copied to clipboard, specially iPhone".

### Root cause 1 — PomConfirmModal is trapped under the voting sheet on iOS

`PomVotingSheet` renders `PomConfirmModal` **inline** (not portaled). The voting
sheet itself uses the shared `BottomSheet`, which portals to `document.body`
(`z-[60]` backdrop / `z-[70]` sheet). The confirm modal's `fixed z-[80]/z-[90]`
elements, however, render inside the match page's `scroll-container`
(`-webkit-overflow-scrolling: touch`), which on iOS WebKit forms a **stacking
context** — the entire subtree paints at level 0, *below* the body-level portaled
sheet. Tapping a player opens a confirm dialog that is invisible and untappable;
taps land on the sheet backdrop and just close the sheet.

Same bug class as the 2026-08-16 "sheets glitching on iPhone" fix — the sweep
portaled every `BottomSheet` but missed the one non-BottomSheet dialog (the POTM
confirm modal). Additionally, `animate-scale-in` (a transform, `forwards`-filled)
sits directly on the `position: fixed` wrapper — violation of the documented iOS
rule (transform on a fixed element re-anchors it).

### Root cause 2 — clipboard fallback is a silent no-op

All 4 share sites fall back to `navigator.clipboard?.writeText(...)`:
- `navigator.clipboard` is **undefined on non-secure origins** — the PWA is served
  over plain HTTP from the Tailscale IP → every desktop/Android fallback no-ops.
- Installed iOS home-screen PWAs gate the async clipboard API.
- The toast then claims "Link copied" — a lying success toast.
- The sticky WhatsApp CTA doesn't include the match URL in its message at all.

## Gate 1 — Product spec

1. A player must be able to confirm their POTM pick on iPhone (installed PWA and
   Safari) — no invisible dialogs, ever.
2. "Share invite link" must work on every platform: Web Share where available,
   real clipboard copy otherwise, honest failure feedback if both fail.
3. WhatsApp invite must contain the actual join link.
4. This class of bug (fixed overlay rendered inside a scroll container) must be
   **structurally prevented** across the whole PWA.

## Gate 2 — Architecture

- **Dialog contract:** any modal dialog that must overlay other overlays renders
  through `createPortal(… , document.body)` with body-level z-index above sheets
  (`z-[80]` backdrop / `z-[90]` dialog). Transforms (entrance animations) live on
  the inner card, never on the fixed wrapper.
- **Share contract:** one library, `src/lib/share.ts`:
  `copyToClipboard(text)` → clipboard API → legacy `execCommand` cascade →
  `false`; `shareOrCopy({title,text,url})` → Web Share (AbortError = dismissed,
  not failure) → copy cascade → `'shared' | 'copied' | 'failed'`. Callers toast
  honestly per result and `trackEvent('invite_shared', { method })`.

## Gate 3 — Program design (slices)

| # | Slice | Files |
|---|-------|-------|
| 1 | Portal fix | `PomConfirmModal.tsx` (createPortal + animation moved off fixed wrapper) |
| 2 | Share lib | `src/lib/share.ts` + `test/lib/share.test.ts` |
| 3 | Rewire 4 share sites + WhatsApp URL + `copyFailed` i18n (ar/en) | `match/[id]/page.tsx`, `messages/{en,ar}.json` |
| 4 | Regression guard: structure test fails CI when a `fixed inset-0/bottom-0/top-0` overlay is added without `createPortal` or an explicit reviewed allowlist entry | `test/structure/no-unportaled-overlays.test.ts` |
| 5 | Verify: vitest + `next build` + deploy + headless browser proof of portal + copy | — |

Allowlist rationale (existing un-portaled fixed elements reviewed safe):
- `Toast.tsx` — top toast, mounts *outside* scroll containers (sibling of `<main>`), z-[100].
- `LocationProvider.tsx` — top banner at layout level, no scroll-container ancestor.
- `match/[id]/page.tsx`, `clubs/[id]/page.tsx` — floating CTAs, z-40, nothing at
  body level must render *under* them; intentionally below sheets/nav.

Hard gate: `npm run build` zero errors + all tests green before "done".
