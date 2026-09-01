# Gate 1 — Product Spec: shots.so-style install landing + PWA activation

## Problem statement (user voice)

> "How to make my PWA and app similar to shots.so's PWA configuration — the smoothness
> of opening the actual app when installed. Before that, when the app is opened in the
> browser it shows another landing page prompting the user to Add to Home Screen as a
> PWA; then, when that is done, the app is activated in the best way possible."

## Target experience (three stages, mirrored from shots.so)

**Stage A — Browser (not installed):** the FIRST thing a browser visitor sees is a
dedicated install landing page (not the raw app): dark green hero, app icon, "Start
Creating"-style CTA that either fires the native install prompt (Chromium) or walks iOS
users through Share → Add to Home Screen with visual step cards. "Continue to the web
app" is always available below.

**Stage B — The install act itself:** Android/desktop get the native OS install dialog;
iOS users get the cheat-sheet. After acceptance, the app is "installed" and — critically
— activation must feel like opening a real app: branded splash (background_color +
512 icon, zero white flash), and the browser tab hands the user over to the installed
app.

**Stage C — Installed app opens:** standalone display, feels native. On first standalone
launch the user lands on a **welcome checkpoint** that confirms activation ("You're all
set — welcome to the app") and lets them continue into the app. Auth cookie persistence
is verified end-to-end (no surprise login wall after install).

## User stories

1. **As a browser visitor (Android/desktop Chrome):** the landing page's primary CTA
   fires the native install prompt. Accepting installs the app. Dismissing shows a
   gentle inline "You can add the app later" and the web app remains one tap away.
2. **As an iOS Safari visitor:** the landing page shows the OS-correct two-step
   cheat-sheet (Share → "Add to Home Screen") with large icon-visual cards (not
   small text lines), plus "Skip for now".
3. **As an already-installed user (any platform):** no landing page and no banner —
   straight into the app (feed/login). `display-mode: standalone` OR
   `getInstalledRelatedApps()` wins.
4. **As a first-time standalone user:** first launch shows the localized welcome
   checkpoint once, then never again.
5. **As any user, in Arabic or English:** every string above is localized; RTL mirrors
   correctly (logical properties, flipped step arrows); numbers stay LTR where needed.
6. **As Abdullah (product owner):** every funnel event is measurable in PostHog —
   landing shown, CTA clicked, prompt result (accepted/dismissed), iOS steps seen,
   standalone-first-launch detected.

## Scope

**IN:** PWA player app only. New `/[locale]/install` route (locale-aware landing);
`usePwaInstall` extended (installed-state re-detect on focus, welcome checkpoint flag);
`InstallPrompt` upgraded to shots.so-grade banner (still passive-in-app fallback);
manifest hardening (`screenshots` wide+narrow, `orientation: portrait-primary`,
`prefer_related_applications`, tuned `description`/`categories`, keep existing
`id`/icons/scope/start_url); splash-color/icon verification; custom-workbox CacheFirst
shell runtime route for instant relaunch; PostHog funnel events; i18n ar+en; tests.

**OUT (non-goals):**
- Marketing landing drafts (`docs/landing-drafts/`) — untouched, separate surface.
- Serwist migration / manual SW rewrite — stays on `@ducanh2912/next-pwa` + custom worker.
- Offline mutation queue, push subscription changes.
- Desktop `window-controls-overlay` (browser-only shots.so chrome) — PWA is mobile-first;
  desktop already gets the responsive shell.
- Capacitor / native shells (rejected in `00-retro` of ios-native-and-scalability).

## Success criteria (verifiable)

- [ ] Browser `/` (Chromium desktop/Android) → redirects to install landing; landing
      shows hero + native-install CTA; `promptInstall()` still works via deferredPrompt.
- [ ] iOS Safari: landing renders step cards with correct OS labels; no BIP events.
- [ ] Standalone (any platform): NO landing, NO banner; feed or login renders directly.
- [ ] After accepting install: `appinstalled` → PostHog event + welcome checkpoint shows
      on first standalone launch (flag persisted, shown once).
- [ ] Manifest passes audit: screenshots (wide+narrow), orientation, icons 192/512 any
      + maskable, id, theme_color = #254132.
- [ ] Relaunch after install paints brand-green splash instantly (no white flash) —
      verified via headless offline-visit of `/` (cached shell render).
- [ ] `turbo run build` zero errors; vitest suite green; both locales render the
      landing (ar RTL + en LTR verified in DOM).

## Open questions for Gate 2

1. Should the landing show for **returning browser users who dismissed install**? →
   Gate 2 decision: never show landing to a dismissed visitor for 30 days (they get
   redirected straight to the app; banner may still appear in-app).
2. Auth on landing route: none (public route) — cookie check happens in-app only.
3. Manifest screenshots: reuse `.hermes-bootstrap/screenshots/*.png` (regenerate at
   1440×900 wide + 800×1200 narrow from live app) — Gate 2 picks final crops.
