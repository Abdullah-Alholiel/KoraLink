# KoraLink — Landing Page Drafts

Four landing-page drafts built with **Hallmark** (Nutlope's anti-AI-slop design skill)
as custom themes anchored on KoraLink's brand green (`#254132`) — all verified headless
(no horizontal scroll at 320–1920px, WCAG AA contrast, 44px touch targets, RTL-correct).

| Draft | Files | Angle | Design | Audience |
| --- | --- | --- | --- | --- |
| **A — Player EN** | `draft-a-player/index.html` | PWA / consumer | premium-booking · floodlit night hero | Saudi players |
| **A — Player AR** | `draft-a-player/index.ar.html` | PWA / consumer | same, RTL + Tajawal + Arabic-Indic numerals | Saudi players |
| **B — Partner EN** | `draft-b-partner/index.html` | Business / venue owners | dark match-night · Narrative Workflow | Saudi venue owners |
| **B — Partner AR** | `draft-b-partner/index.ar.html` | Business / venue owners | same, RTL + Tajawal | Saudi venue owners |

## Preview (Tailscale HTTPS)

- Player EN — `https://aa.tail2948f9.ts.net:9520/draft-a-player/`
- Player AR — `https://aa.tail2948f9.ts.net:9520/draft-a-player/index.ar.html`
- Partner EN — `https://aa.tail2948f9.ts.net:9520/draft-b-partner/`
- Partner AR — `https://aa.tail2948f9.ts.net:9520/draft-b-partner/index.ar.html`

Or open the `index.html` files directly / serve the folder (`npx serve docs/landing-drafts`).

## Arabic versions — conventions followed

- `dir="rtl"` + `lang="ar"`, logical properties throughout (RTL comes free)
- **Tajawal** typeface (KoraLink's Arabic font); weight 700 instead of 800 (Tajawal reads heavy)
- **Arabic-Indic numerals** per the app: ٣٥ ﷼ · ٤٫٩ (١٠٠) · © ٢٠٢٦
- Arrows flipped via `[dir="rtl"] .rtl-flip { transform: scaleX(-1) }`
- No letter-spacing on Arabic (breaks the connected script); taller line-height (1.7)

## Facts used (all real, from `apps/api/src/database/schema.ts` + PWA routes)

- Pitch sizes: `5v5 · 7v7 · 8v8 · 11v11` · surfaces: Grass / Artificial · setting: Indoor / Outdoor
- Match types: Casual / Competitive · wallet · match chat · best-player vote (`match_votes`)
- Clubs, follows, notifications · OTP phone sign-in · PWA offline support · ar/en i18n
- Partner programme: `bookingMode` = `koralink` / `self` · disputes · no-shows · verification

## Placeholders to replace before going live

1. **Base URL** — CTAs point at the Tailscale PWA (`aa.tail2948f9.ts.net:9450`) and admin
   console (`:3002/partner`). Swap for the production domain.
2. **`SAR —` / `﷼ —`** in sample mocks — real amounts once pricing is set.
3. Club-card names/ratings/prices are **sample placeholders** (tagged "Sample"/"نموذج").

## Craft notes (Hallmark slop-test + UX audit)

- Zero invented metrics · no fake browser/phone chrome · roman headers · one accent
- Sticky blur nav · 44px touch targets (HIG) · one orchestrated load entrance
- `:focus-visible` rings · `prefers-reduced-motion` fallbacks · WCAG AA contrast pairs
- `.hallmark/log.json` at repo root records macrostructure/theme per Hallmark rules
