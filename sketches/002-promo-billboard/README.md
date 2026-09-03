# 002 — Compact billboard + Play pill + pinned header (round 2)

**Date:** 2026-09-03 · **Decision maker:** Abdullah (feedback on 001 hero banner)
**Method:** proportions sketch → headless render → build → live DOM+pixel verify.

## Feedback that drove this round
001's hero banner (167px) felt too big vs match cards; Abdullah wanted:
1. A smaller **billboard** on the **Feed** (not Play) that can showcase multiple
   things (host, partner page, request-a-club, …).
2. Play screen: just a **"+ Host a Match" labeled pill next to search**.
3. **Search + host pill + calendar (+ filter bar) pin** while scrolling games.

## Shipped
- `components/feed/PromoBillboard.tsx` — compact rotating billboard (~92px card):
  data-driven SLIDES config (host + clubs ship; partner/club-request join by
  adding one entry + a real destination page — no placeholder links). 5s
  auto-rotate, paused for prefers-reduced-motion and hidden tabs; dots are
  a11y buttons; crossfade via key remount (RTL-safe, no horizontal scroll);
  `useLocale()`-prefixed hrefs.
- Play page: bare "+" replaced by outlined pill `(+ circle) Host a Match`
  (`play.hostMatch`); hero banner fully removed (component, test, i18n keys).
- Pinned header group: search row + DatePicker + FilterBar in one
  `sticky top-[46px]` container; IntersectionObserver sentinel below the
  FilterBar flips isPinned (adds border-b + shadow only when pinned).
- test/setup.ts: matchMedia + IntersectionObserver jsdom polyfills.

## Verified (live :3000, EN + AR)
- Billboard: 104px section vs 108px activity card — card scale ✓; gradient
  matches bg-host-hero token exactly; AR copy + /ar hrefs ✓.
- Play: pill "Host a Match"/"استضف مباراة" ✓; old banner gone ✓; sticky pins
  at top:46 with shadow/border ✓; no horizontal overflow ✓.
- Tests: 7 (5 billboard + 2 play). Build gate passed.

## Not shipped (no destination yet — honest-billboard rule)
- Partner slide (partner.controller is console-only, no public lead route).
- Request-a-club slide (no endpoint). Add both when pages exist.

## Files
- `proportions.html` / `proportions.png` — scale study (3 phones)
- `live-feed-*.png`, `live-play-*.png`, `live-feed-en-clean.png` — live proof
