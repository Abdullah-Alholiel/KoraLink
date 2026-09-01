# Gate 2 — Architecture: shots.so-style install landing + PWA activation

## Architecture overview

```
Browser visit /                     Installed PWA launch
      │                                     │
      ▼                                     ▼
next-intl middleware (localePrefix    app shell loads → splash paints
always: / → /ar)                     brand-green instantly (bg_color
      │                                     │
      ▼                              SW precache serves shell
InstallLandingGuard (layout-level)         │
  isStandalone? ──yes──► never mount       ▼
      │ no                        AppContent (feed / login)
      ▼                                     │
dismissed < 30d? ──yes──► appContent       ▼
      │ no                          WelcomeCheckpoint (first
      ▼                             standalone launch only,
<InstallLanding /> (locale hero +   flag in localStorage)
 install CTA | iOS cheat-sheet)
      │ CTA
      ▼
usePwaInstall.promptInstall() ─► native dialog ─► appinstalled event
      │                                                │
      └─ dismissed ─► inline fallback + 30d flag       ▼
                                        post-install handoff (focus the
                                        standalone window; browser tab stays)
```

## Route & redirect decision (Gate 1 open questions resolved)

- **R1 — dismissed visitors:** a 30-day dismissal flag (localStorage, key
  `koralink.install-landing-dismissed-at`) sends them straight to the app via the
  guard — the landing does NOT re-nag for 30 days. The in-app banner cooldown
  (7d, existing) is unchanged and independent.
- **R2 — auth on landing:** public route, no auth check. Auth stays in-app
  (`(auth)` pages + AuthBootstrap), unchanged.
- **R3 — screenshots:** regenerate from the live app via headless CDP —
  `wide` 1440×900 (desktop feed view) + `narrow` 800×1200 (phone feed view).
  Write them to `apps/player-pwa/public/screenshots/`. NOT reusing raw
  `.hermes-bootstrap` crops (wrong aspect ratios for the install sheet spec).

## Component changes (per file)

| File | Change | Why |
|------|--------|-----|
| `src/components/pwa/InstallLanding.tsx` | NEW client component: hero, app icon, localized pitch, primary CTA (Chromium native prompt / iOS cheat-sheet), secondary "continue to web app", motion via existing spring tokens | Stage A surface |
| `src/hooks/usePwaInstall.ts` | EXTEND: `installLanding` behavior — installed re-detect on focus/visibilitychange (post-install handoff), 30d landing-dismiss flag, `appinstalled` triggers welcome-checkpoint flag reset | Powers Stage A→B→C |
| `src/app/[locale]/layout.tsx` | Mount `<InstallLandingGuard>` (client, returns `children` or `<InstallLanding/>`) around `{children}` | Locale-aware guard |
| `src/components/pwa/InstallLandingGuard.tsx` | NEW client guard: isStandalone check, dismissed-check, children-swap | First paint strategy |
| `src/components/pwa/WelcomeCheckpoint.tsx` | NEW: first-standalone-launch welcome sheet (z-80 layer, localized, "continue" CTA) | Stage C |
| `src/app/[locale]/(main)/layout.tsx` or `(main)/play` | Mount `<WelcomeCheckpoint />` | Only inside main app (never on auth) |
| `public/manifest.json` | ADD `screenshots` (wide+narrow), `orientation: portrait-primary`, `prefer_related_applications: false`, tune `description`/`categories` | Richer install sheet |
| `next.config.mjs` (workbox custom runtime route) | ADD custom CacheFirst route for `/_next/static/*` document shell assets (maxEntries 100, 30d) | Instant relaunch |
| `src/messages/{ar,en}.json` | ADD `install` + `welcome` namespaces (ar+en, exact keys below) | i18n contract |
| `tailwind.config.ts` (or globals.css keyframes) | ADD spring-ish easing tokens (`--ease-spring`) + `animate-install-cta-pulse` (opacity/transform only) | Shots.so motion feel |
| `test/components/InstallLanding.test.tsx` | NEW | Guard logic + CTA |
| `test/hooks/usePwaInstall.test.tsx` | EXTEND | 30d flag, standalone-first-launch |
| `test/components/WelcomeCheckpoint.test.tsx` | NEW | Once-only render |

## Data flow — install funnel event map (PostHog via trackEvent)

| Event | Trigger | Properties |
|-------|---------|------------|
| `pwa_install_landing_shown` | Landing mounts (guard passed) | locale, platform |
| `pwa_install_landing_cta_clicked` | CTA tap | locale, platform |
| `pwa_install_prompt_result` | userChoice outcome | outcome (accepted/dismissed) |
| `pwa_install_dismissed` | landing "not now" | days_until_next_prompt=30 |
| `pwa_standalone_first_launch` | WelcomeCheckpoint mounts once | locale |
| `pwa_install_accepted` | `appinstalled` event | platform (existing, keep) |

## Splash & activation verification path

- `background_color: #ffffff` → **change to `#254132`** (brand-green) so the installed
  app paints green, not white, at boot (matches the match-detail dark hero; body stays
  light per UI-standards §3 — splash is manifest-level, does not affect in-app surfaces).
  `theme_color` stays `#254132`.
- Verify via headless CDP on the served bundle: relaunch (offline visit of `/` from SW
  cache) must render `background-color` of the first paint = `#254132` (probe
  `getComputedStyle(document.body).backgroundColor` right after load; the app-shell
  covers the viewport).
- The custom worker (worker/index.js) is NOT touched (push pipeline verified via
  `grep showNotification worker-*.js` after build).

## Files changed table (full list)

| Layer | Path | Type |
|-------|------|------|
| PWA | `src/components/pwa/InstallLanding.tsx` | new |
| PWA | `src/components/pwa/InstallLandingGuard.tsx` | new |
| PWA | `src/components/pwa/WelcomeCheckpoint.tsx` | new |
| PWA | `src/hooks/usePwaInstall.ts` | extend |
| PWA | `src/app/[locale]/layout.tsx` | extend (guard mount) |
| PWA | `src/app/[locale]/(main)/layout.tsx` | extend (welcome mount) |
| PWA | `public/manifest.json` | extend |
| PWA | `next.config.mjs` | extend (cache route) |
| PWA | `public/screenshots/{wide,narrow}.png` | new assets (CDP-generated) |
| PWA | `src/messages/ar.json`, `en.json` | extend |
| PWA | `src/styles/globals.css` | extend (spring tokens + keyframes) |
| Tests | `test/components/InstallLanding.test.tsx`, `test/components/WelcomeCheckpoint.test.tsx`, `test/hooks/usePwaInstall.test.tsx` | new/extend |
| Docs | `docs/plans/pwa-shots-install-flow/*` | this cycle |

## i18n keys needed (ar + en)

Namespaces: `pwa.installLanding`, `pwa.welcome`, `pwa.install` (existing, extend).
Full key list in Gate 3 (contract gate).

## Risks & mitigations

| Risk | Mitigation |
|------|-----------|
| Landing hijacks already-installed users after a SW update re-mounts the guard | Guard reads `display-mode: standalone` synchronously in an inline head script (`script-src 'unsafe-inline'` is already permitted) — no hydration flash possible |
| iOS cheat-sheet cards confuse if labels drift per iOS version | Copy names the OS ("iPhone: Safari → Share") and keeps steps to exactly 2; no version-specific promises |
| `screenshots` push install-sheet size past limits | Cap each ≤ 200KB, correct aspect ratios (1440×900, 800×1200), generate from live app |
| Locale mismatch: landing shown in en to an Arabic user | Landing route is locale-scoped (`/ar/install`-style content INSIDE `[locale]` layout) — middleware guarantees the locale segment; no `Accept-Language` sniffing |
| SW update race while landing is mounted | ServiceWorkerUpdater already handles update flow; landing is stateless |
| 30d flag blocks a user who genuinely wants install later | In-app banner still offers install (7d cooldown independent); profile settings already link... verify: add "Add to Home Screen" entry point in profile menu if absent → Gate 3 confirms |

## Descoped (and why)

- Desktop `window-controls-overlay` — mobile-first PWA; desktop shell already responsive.
- Marketing landing drafts — separate surface (docs/landing-drafts, :9520).
- Background sync / offline mutations.
- Native shells (Capacitor) — incompatible with runtime middleware (prior plan).
