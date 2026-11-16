# Run #196 — Gate 0 Retro: P2-321 chat page (re-scoped P0-class crash)

## What the item said vs what was true

- **P2-321 (run #194)**: "chat header falls back to 'Loading…' permanently when the match
  query fails" — framed as a cosmetic error-state gap.
- **Reality (proven this run)**: the page **crashed on every render** since it shipped
  (e89ce02, run #176). `match/[id]/chat/page.tsx` called
  `use(useParams() as unknown as Promise<…>)` — React 19's `use()` throws on
  non-thenables ("An unsupported type was passed to use(): [object Object]").
  - Live SSR probe `/en/match/test-id-123/chat` → HTTP 200 shell with **error digest
    2159266065** and only the loading skeleton; MobileFrame + chat composer never rendered.
  - journald (koralink-pwa, 2026-11-09 01:51Z): `⨯ Error: An unsupported type was passed to
    use(): [object Object]`.
  - Client-side navigation to the thread crashes identically (same component code path).
- **Lesson**: the "Loading…" symptom was the *suspension fallback*, not a data bug — a
  reviewer-grade probe (curl the SSR HTML, check for digests) would have caught this at
  run #176. Small user-visible pickups still need a render-path sanity probe, not just a
  code read.

## Pattern class sweep (Gate 0 duty)

`grep -rn "use(params" apps/player-pwa/src` → exactly 3 sites:
- `match/[id]/page.tsx:78` — real Promise prop ✅
- `messages/[id]/page.tsx:65` — real Promise prop ✅
- `match/[id]/chat/page.tsx:28` — the broken cast ❌ (fixed this run)

No other page mixes `useParams()` into `use()`.

## Area health (what this cycle touches)

- Reviewers A+B returned complete (glm-5.3, 430s/711s, low effort): **zero CRITICAL, zero
  IMPORTANT** on the run-#195 settlement-void code and the #191–#195 PWA surfaces.
- Reviewer B verified all 3 of run #195's claims (chunk served + audit rows + void guards).
  Two of B's *new* product-gap claims were refuted by code evidence (blackout exists as
  P2-246/P2-255; typing indicators exist as P2-231) — claims≠facts applied to reviewers too.
- Sentry: no new signatures in the live window (all four unresolved issues last fired Oct
  13–31; Neon 1C storm ended Oct 31 → P1-52 stays resolved).
- Hex: drift +2 api_exc_total (341→343) fully attributed to PR #229's two pending-only
  BadRequestException guards (ALLOWED class) → baseline folded.

## Fix:fact ratio check

Last 8 commits on staging before this run: 3 feat / 2 fix / 3 docs — healthy; no reactive
loop.

## Gate 0 → proceed

Item re-scoped from "add error branch" to "fix route-crashing `use()` misuse + add the
error branch". Proceed to Gate 1 (compact).
