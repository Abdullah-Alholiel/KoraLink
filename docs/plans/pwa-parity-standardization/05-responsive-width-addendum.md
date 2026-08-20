# Addendum 2026-08-20 — Responsive width standard (user correction)

## Correction

Slice 2 of this cycle misread the `max-w-6xl` shell as "drift" and capped it to
`max-w-md`. That was WRONG: the wide shell was Abdullah's deliberate
desktop-flexibility fix. His explicit standard:

> "The PWA should NOT show as phone screen width on desktop — it must be
> flexible and extended comfortably on desktop, tablet, and most importantly
> phone."

## Final width architecture (restored + verified)

| Surface | Width behavior |
|---------|---------------|
| `MobileFrame` shell | `w-full max-w-6xl` — full-bleed phone/tablet, 1152px capped + centered on desktop |
| `BottomNav` | same `max-w-6xl` — spans the full shell on every device |
| `BottomSheet` | same `max-w-6xl` (+ `md:px-4`) |
| Floating join CTAs, install banner | `max-w-md md:max-w-lg` — comfortable reach, not stretched |

Verified live (headless, `scripts/verify-pwa-responsive.mjs`): phone 390 →
shell 390 (full-bleed, nav 390, no overflow); tablet 768 → shell 768 full-bleed;
desktop 1280 → shell 1152 centered (left=64); desktop-xl 1920 → shell 1152
centered (left=384). Nav aligns with the shell at every width. 12/12 checks.

All other cycle results stand (pickers, SW revival, offline fallback, install
banner — see 04-completion.md).

## Lessons encoded into skills

- `nextjs-pwa` parity checklist: shell responsive `max-w-6xl`, never `max-w-md`.
- `koralink-ui-standards` §3: MobileFrame rule replaced with the responsive
  standard + floating-chrome width rule.
