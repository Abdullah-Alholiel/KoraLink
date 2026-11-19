# Run #216 — Item 2: P2-367 RTL nowrap wraps (compact gate doc)

## Problem
`whitespace-nowrap` spans inside unconstrained flex rows overflow at 360px in AR
(long Arabic labels): the chat sheet header ("عرض المحادثة الكاملة" pill beside
the title; "رسائل جديدة أثناء غيابك" marker), the clubs filter chips row header,
and the clubs favorites error strip (retry button beside a long error sentence).

## Scope (IN)
- MatchChat.tsx:269 — open-full-thread pill: the SIBLING title column already
  has `min-w-0` (:240) and truncates; the pill itself is `flex-shrink-0`.
  Overflow risk is the PILL against the header — but the pill sits beside a
  min-w-0 truncating sibling, so the actual defect is the pill can exceed the
  container when BOTH shrink sources are exhausted... verified: title truncates
  first (min-w-0), pill keeps full label = correct UX (label never clipped
  mid-word; title yields). REAL residual defect = :382 missed-marker: its
  flex-1 h-px divider sibling has NO min-w-0, and the row is `w-full` — in AR
  the long marker + divider can force the row wider than the viewport. Fix:
  `min-w-0` on the divider span.
- clubs/page.tsx:262 — filter chips sit in `overflow-x-auto scroll-container`
  (:256): nowrap chips are the CORRECT pattern for a horizontally scrollable
  chip row (they wrap = broken chips). NO defect — document, don't touch.
- clubs/page.tsx:288 — retry button in the favorites error strip:
  `justify-between` with a long `<p>` sibling. The `<p>` has NO min-w-0; in AR
  a long error sentence pushes the retry button off-screen at 360px. Fix:
  `min-w-0` on the `<p>` (and `flex-shrink-0` already implicit on the button —
  add it explicitly).
- FilterBar.tsx:63,76 — chips + filter button live in `overflow-x-auto` (:57):
  same correct-scroll pattern as clubs chips. NO defect — document.

## OUT of scope
Any redesign of chip rows; match page action rows (fixed in PR #259).

## Fix shape (2 files, 3 class edits + docs)
1. MatchChat.tsx:381 divider span gains `min-w-0`.
2. clubs/page.tsx favorites error `<p>` gains `min-w-0`; retry button gains
   `flex-shrink-0`.
3. Board/docs note: clubs:262 + FilterBar:63/76 are overflow-x-auto chip rows —
   nowrap is the correct affordance there (row scrolls, chips don't wrap).

## Verification
- vitest suite green (no behavior change to tests), pwa type-check 0.
- Manual-geometry pin: add a lightweight DOM test asserting the divider and
  error-<p> carry min-w-0 (defends the fix against regression), consistent
  with house tripwire style.

## Contracts
No API/i18n changes. Pure render classes.
