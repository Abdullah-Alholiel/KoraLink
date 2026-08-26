# iOS Native Shell & Scalability — Gate 0 Retrospective (Assessment)

**Date:** 2026-08-26 · **Baseline:** `2f57495` (feat(notifications): admin actions notify player)
**Trigger:** (1) "Is the PWA ready for the Capacitor recipe (exported Next.js build → native iOS webview → Xcode)?" (2) "Are these 4 scalability checklist items part of what we have?"

---

## Q1 — Capacitor readiness: **NO, not as-is**

The quoted recipe requires `output: 'export'` (static HTML/JS/CSS in `out/`).
The PWA is a **server build** — `output: 'standalone'` (`apps/player-pwa/next.config.mjs`).
Four concrete blockers:

| # | Blocker | Evidence | Impact inside Capacitor |
|---|---------|----------|--------------------------|
| 1 | Standalone output (needs Node server) | `next.config.mjs` → `output: 'standalone'`; deployed via systemd + sync-standalone | Capacitor bundles static files only; it cannot run a Next server |
| 2 | next-intl runtime middleware | `src/middleware.ts` (`localePrefix: 'always'`, matcher excludes `sw.js/worker-*/fallback-*`) | Middleware never executes in a static export — locale routing must move to a client bootstrap |
| 3 | SW-based offline + web push (`@ducanh2912/next-pwa`) | `customWorkerSrc: worker/index.js`, `fallbacks: /ar/offline` | WKWebView (Capacitor iOS) has **no service-worker support** — the entire offline + web-push layer is dead in the shell; push needs the native APNs plugin instead |
| 4 | Security headers served by the Next server | `headers()` in `next.config.mjs` (CSP, X-Frame-Options, Permissions-Policy) | Headers don't apply to bundled local files; must move to `capacitor.config` / meta tags |

Also: `next/image` optimization requires the Next server → static export forces
`images: { unoptimized: true }` or a custom loader.

### What already works in our favor (verified in code)

- **17/18 pages are `'use client'`** — rendering is already client-side; static export is plausible without rewriting pages.
- **CORS passes no-Origin (native) requests** — `apps/api/src/main.ts` origin callback allows `!origin`.
- **Bearer auth fallback is end-to-end**: fetcher attaches `Authorization` (`lib/fetcher.ts`), socket.io sends `auth.token` (`NotificationProvider.tsx` + `useMessages`/`useMatches`/`useConversations`), JWT strategy reads Bearer first, cookie second. The auth model **survives** the loss of HttpOnly cookies in a WKWebView.
- **iOS PWA shell is already first-class**: `apple-mobile-web-app-capable`/`status-bar-style`/`apple-touch-icon` in layout JSX, safe-area insets, `100dvh` via `@supports`, iOS date-picker overlay pattern.

### Pre-existing blocker: no HTTPS

PWA serves `http://100.93.99.24:3000`. Geolocation and iOS web push (16.4+)
require a secure context. Blocked on sudo — see
`../social-discovery/04-https-prerequisite.md`. Note: Capacitor "remote URL"
mode would ALSO need a public HTTPS origin (Apple ATS).

### Paths

| Path | Description | Effort | When |
|------|-------------|--------|------|
| **A — Static export fork** | `apps/mobile` build target: `output:'export'`, client locale bootstrap, unoptimized images, headers→capacitor.config, Keychain token storage, native push/geolocation plugins | Medium-large | When App Store distribution is a hard requirement |
| **B — Thin shell over deployed URL** | Capacitor webview loads the HTTPS site | Trivial but fragile | Not recommended: ATS needs public HTTPS, loses SW offline anyway, App Store 4.2 risk |
| **C — Ship the PWA on iOS properly first** | Unblock HTTPS → geolocation + iOS push work; defer Capacitor | Small (mostly ops) | **Recommended now** |

---

## Q2 — Scalability checklist mapping: **3 of 4 already built**

| Their item | KoraLink reality (evidence) | Verdict |
|---|---|---|
| Matchmaking → move geo math to PostGIS | `ST_DWithin` + `ST_Distance` on `geography(Point,4326)` in `matches.service.ts:159–182`, `venues.service.ts:44–62`; GiST indexes | ✅ **Already our architecture.** Gap is HTTPS for on-device geolocation, not the math. "Middleware routes users by location" not needed (single-region). |
| Social Feed → next/image + S3 + CDN | `next/image` in 4 components; **no media upload exists yet** (social-discovery spec = follow system, no media); `avatar_url` is a text column | ◐ Partial / N-A today. S3-compatible storage + CDN is a decision to make **before** feed media ships. |
| Messages → never WS in Next.js; external realtime | Socket.io lives in the **NestJS API** (`modules/gateway/app.gateway.ts`, `realtime.service.ts`); PWA has zero WS server code | ✅ **Already correct by design** — exactly the prescribed architecture. |
| Admin portal → isolate from player app | `apps/admin` = separate Next.js app, port 3002, own `koralink-admin.service` | ✅ **Already built** — stronger than their subfolder advice. |

### Real gaps found during this audit (NOT from their list)

1. **Socket.io has no Redis adapter** — rooms/presence live in one process's memory. First multi-instance deploy breaks match rooms and chat. Small fix: `@socket.io/redis-adapter`, env-gated (no Redis required in dev).
2. Feed queries do geo + COUNT per request with no read model — fine at current scale; revisit past ~10k MAU.

---

## Commit health

Last 15 commits: healthy feat/fix/docs mix, no reactive fix loop. Working tree clean at audit time. **Proceed to Gate 1.**
