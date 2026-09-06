# 004 — Profile Screen Redesign (Impeccable-driven)

**Date:** 2026-09-06 · **Status:** AWAITING ABDULLAH'S PICK · **Recommended: V2 "Stadium Night"**

## Context
Abdullah asked whether the `impeccable` skill (pbakaus/impeccable v4.2.1, installed into the
koralink Hermes profile at `skills/impeccable/`) could take the profile screen in a better
visual direction. Findings:

- Impeccable's deterministic detector (61 rules) run on
  `apps/player-pwa/src/app/[locale]/(main)/profile/page.tsx` + `components/profile/`:
  **0 findings** (exit 0). The current screen is technically clean; its weakness is expressive,
  not structural — no identity moment, 6 stacked white cards, card-on-card shadow clutter.
- Impeccable's role: steering vocabulary (`bolder` / `layout` / `delight`) + audit discipline.
  Brand tokens stay KoraLink's (#254132 family, Outfit/Tajawal) — the skill defers to DESIGN.md.

## Variants (all: real i18n copy EN+AR, 390px, brand tokens, RTL mirrored, Arabic-Indic numerals)
| Variant | Stance | Verdict |
|---|---|---|
| `v1-player-card.html` | Dark identity hero + pitch-circle motif, GREEN stats card overlapping fold, 3 grouped cards | Clean render, EN+AR pass |
| `v2-stadium-night.html` ⭐ | Immersive dark→green gradient half, floodlight glow, Edit-profile pill, glass stats bar, flat borderless list | Clean render, EN+AR pass; most "tailored to KoraLink"; reduces below-fold clutter |
| `v3-season-tabs.html` | White identity card + jersey-stripe ribbon, segmented tabs | **AR render bug** (avatar vs ribbon); tabs add tap friction, hide content — ranked last |

Renders: `sketches/_render/004/*.png` (gitignored dir, re-run `render.js` if needed).

## Decision
PENDING — Abdullah to pick one of: V2 (recommended) / V1 / Hybrid (V2 hero + V1 grouped cards) / V3.
On pick: build per `koralink-ui-standards` §design-loop (component + i18n both locales + colocated
tests + `turbo run build` + live verify on :3000 via the dev-login chain).
