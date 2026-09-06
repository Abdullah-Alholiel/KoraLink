# 004 — Profile Screen Redesign (Impeccable-driven)

**Date:** 2026-09-06 · **Status:** PICKED — **V2 "Stadium Night" r2 (brand-green retint)**

> Abdullah: "yes go with v2, but dont make the background of the top card to dark,
> tailor it to the same colours highlight as my app design system"

Retint applied (r2): hero gradient now `#2d5c3e → #274b38 → #254132` (design-system
family, shipped as `bg-profile-hero` token in tailwind.config.ts), floodlight radials
switched to white glows, edit pill switched to white (`bg-white text-brand-green`,
PromoBillboard white-pill language). Avatar disc deepened to `brand-green-deep` for
contrast on the lighter hero.

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
**PICKED (2026-09-06, later same day): V2 with the brand-green retint (r2).**
Build landed in the same cycle: tailwind token `profile-hero`, page rewrite preserving
all P0/P1/P2 logic (PDPL sheets, install hint, prefs, wallet error affordance),
`FlatSectionLabel` shared component, EmailSection de-carded, section labels i18n
(`profile.sectionPlaying/Preferences/Account`, EN+AR), tests in
`test/components/ProfilePage.test.tsx` (24/24 green incl. pre-existing sheet suites).

## Follow-up (2026-09-06, same evening): system standardisation
Abdullah: "make profile screen header same as play screen header… standardise, not to
feel various headers in different screens; no notification bells on other screens (feed
has one); tailor personal information screen same to profile screen."
- `components/layout/AppBar.tsx` — THE standard header (Play anatomy), used by Play + both heroes
- `components/profile/GlassStats.tsx` — shared glass stats bar (Profile + Personal Info)
- Bell policy reversed (was P2-34 "bell on every tab"): Feed ONLY; stripped from play/
  my-games/wallet/clubs (+ profile hero's decorative bell)
- Personal Info rebuilt on the Stadium Night system (hero + chip + GlassStats), edit
  flow untouched; new i18n key `profile.sectionDetails` (EN+AR)
- Gates: 18/18 tests (7 profile + 3 personal-info + 8 sheet/bell/email), build exit 0,
  live-verified 6 screens × EN+AR on :3000 — exactly 1 bell per locale (feed).
