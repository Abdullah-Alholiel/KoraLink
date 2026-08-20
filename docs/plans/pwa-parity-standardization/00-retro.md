# Gate 0 — Retrospective: PWA parity & quality

## Scope reviewed
PWA layer of `apps/player-pwa`: SW config, manifest, app shell, host-flow
date/time pickers. Audit done 2026-08-20 against the `nextjs-pwa` skill
(upgraded this cycle) + `koralink-ui-standards`.

## Past decisions that created today's debt

| Commit | What it did | Debt created |
|--------|-------------|--------------|
| f9c88ee | Match lifecycle UI pass | `MobileFrame` widened to `max-w-6xl` (desktop stretches to 1152px; design system §3 says `max-w-md` phone-column shell). Root cause of "desktop feels different". |
| f22886c | iOS date/time fix — invisible overlay input replaces `showPicker()` | Fixed iOS, **regressed desktop**: on desktop Chromium a tap on a transparent `type="date"` input only focuses it; the calendar never opens without `showPicker()`. The fix removed `showPicker()` entirely. |
| original SW setup | `fallbacks: false` in `withPWAInit` | Offline route `/[locale]/offline` exists but is NEVER served: built `public/sw.js` contains **0** `setCatchHandler`. Navigation offline = browser error page, not our screen. |
| original SW setup | no `beforeinstallprompt` / iOS install UX | Desktop Chrome/Edge install prompt is dead; iOS users get no Add-to-Home-Screen guidance. |
| manifest v1 | no `id` field | Chrome warns; app identity derived from `start_url` — fragile across manifest edits. |

## What is already correct (keep, do not touch)

- `viewportFit: 'cover'` + `interactiveWidget: 'resizes-content'` + iOS meta
  tags rendered directly in layout JSX (fixed in earlier cycle).
- `--app-height` with `dvh` `@supports` fallback; `body` fixed + `bg-white`.
- Custom worker push wiring intact: `sw.js` → `importScripts("/worker-<hash>.js")`
  → `showNotification` present (verified on disk).
- CSP includes `worker-src blob:`; SW excluded from intl middleware matcher.
- Icons: 192/512 any + maskable, apple-touch-icon — complete.
- HTTPS serving via `tailscale serve` (SW + install requirements met).

## Working-tree warning
`git status` shows 11 modified/untracked files (hooks + tests, another
workstream). Gate 4 cannot start on a dirty tree — needs commit/stash decision
before implementation.
