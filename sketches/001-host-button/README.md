# 001 — "Host a Match" + button redesign (design loop)

**Date:** 2026-09-03 · **Decision maker:** Abdullah (picked Variant A)
**Method:** sketch skill (2 HTML variants, EN+AR) → headless render → vision QA → pick → build → live verify.

## Problem
The only hosting entry points were a bare 40×40 "+" icon in the Play search bar
(low discoverability, no value proposition) and text links on empty states.
`components/layout/TopAppBar.tsx` had a fully dead "+" (no href — never wired).

## Variants
| | A — Hero banner | B — "+" speed-dial sheet |
|---|---|---|
| Stance | Permanent showcase in the feed; banner IS the button | Feed untouched; "+" opens a perks showcase sheet |
| Taps to host | 1 | 2 |
| Files | `variant-a-hero-banner/` | `variant-b-speed-dial/` |
| Render | `variant-a.png` | `variant-b.png` |

## Winner: A
Permanent visibility on the highest-traffic screen, fewest taps, leanest build.
(Hybrid A+B was offered; not taken.)

## Shipped
- `apps/player-pwa/src/components/host/HostHeroBanner.tsx` — whole banner is one
  `Link → /{locale}/host`; gradient token `bg-host-hero` (tailwind.config);
  pitch center-circle line-art mirrors in RTL via `insetInlineEnd`; all copy i18n
  (`host.hostingKicker/hostBannerTitle/hostBannerSubtitle/hostBannerCta`).
- Play screen renders `<HostHeroBanner />` between search bar and date picker;
  search-bar "+" kept (now `data-testid="host-plus-button"`).
- Tests: `HostHeroBanner.test.tsx` (4 pass). Build gate passed; live headless
  verify passed on :3000 for en+ar (`live-en.png`, `live-ar.png`).

## Not shipped (deferred)
- B's perks sheet (revisit as post-publish upsell surface).
- Dead `TopAppBar.tsx` removal — it's unused by any page; safe delete in a
  future cleanup PR.
