# KoraLink — Landing Page Drafts

Two fully standalone landing-page drafts built with **Hallmark** (Nutlope's anti-AI-slop
design skill, 21-theme catalog + 58-gate slop test). Both are **custom themes** anchored
on KoraLink's brand green (`#254132`), tailored to the PWA's real feature set — no
invented metrics anywhere (Hallmark gate 46).

| Draft | File | Angle | Macrostructure | Theme | Audience |
| --- | --- | --- | --- | --- | --- |
| **A — Player** | `draft-a-player/index.html` | PWA / consumer | Marquee Hero | custom · light pitch-green (Outfit 800 + Albert Sans + JetBrains Mono) | Saudi players |
| **B — Partner** | `draft-b-partner/index.html` | Business / venue owners | Narrative Workflow | custom · dark match-night (Fraunces + Geist + JetBrains Mono) | Saudi venue owners |

## How to preview

Open the `index.html` files directly in a browser, or serve the folder:

```bash
npx serve docs/landing-drafts
```

Both pages are single-file HTML + embedded token blocks (plus a matching `tokens.css`
each for reuse). They need no build step and no framework.

## Facts used (all real, from `apps/api/src/database/schema.ts` + PWA routes)

- Pitch sizes: `5v5 · 7v7 · 8v8 · 11v11` · surfaces: Grass / Artificial · setting: Indoor / Outdoor
- Match types: Casual / Competitive · skill levels: Beginner / Intermediate / Advanced
- Wallet (transactions, per-booking records) · match chat · best-player vote (`match_votes`)
- Clubs, follows, notifications · OTP phone sign-in · PWA offline support · ar/en i18n
- Partner programme: `bookingMode` = `koralink` (full service) or `self` (self-managed)
- Disputes, no-shows, venue verification, settlement statuses

## Placeholders to replace before going live

1. **Base URL** — CTAs currently point at the Tailscale PWA (`https://aa.tail2948f9.ts.net:9450`)
   and admin console (`:3002/partner`). Swap for the production domain.
2. **`SAR —`** in the sample match card / wallet mocks — real amounts once pricing is set.
3. Venue name in the sample card (`District Pitch · Riyadh`) is a plausible placeholder.
4. **Arabic copy** — both pages are English-first; the app is ar/en. A bilingual toggle
   (ar.json/en.json pattern) is the natural next step if you want it.

## Craft notes (Hallmark slop-test gates)

- No invented metrics, no fake browser/phone chrome, no icon-tile feature grids
- Roman headers only (no italic display), tinted neutrals, one accent (+ brand red as second)
- `overflow-x: clip` on html/body; responsive at 320/375/414/768; 44px touch targets
- `:focus-visible` rings, `prefers-reduced-motion` fallbacks, WCAG AA contrast pairs
- Stamps + `.hallmark/log.json` at repo root record macrostructure/theme per Hallmark rules
