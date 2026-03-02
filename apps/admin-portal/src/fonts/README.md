# Admin Portal Fonts

This directory contains the font files used by the KoraLink Admin Portal.

## Required Fonts

| File | Usage | Source |
|------|-------|--------|
| `Outfit.woff2` | English UI font | [Google Fonts](https://fonts.google.com/specimen/Outfit) |
| `Marzouk.woff2` | Arabic UI font | KoraLink brand font (private) |

## Notes

- The placeholder `.woff2` files in this directory are minimal stubs for development.
- Replace them with the actual licensed font files before deploying to production.
- Font files are loaded via `next/font/local` in `src/app/[locale]/layout.tsx`.
