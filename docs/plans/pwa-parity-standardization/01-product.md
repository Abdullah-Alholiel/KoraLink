# Gate 1 — Product Spec: PWA Parity & Standardization

## Problem statement (user voice)
> "The PWA and desktop versions feel different. When we fixed date/time for
> iPhone the PWA stopped working on desktop. I need standardized implementation
> and best PWA quality that works smoothly on BOTH desktop and phone."

## User stories

1. **As a player on desktop** (installed PWA or browser), when I tap the Date
   or Time field in *Host a Match* (both modes) or the slot-date field in the
   venue picker, **the calendar/clock picker opens** — same one-tap effort as
   on iPhone.
2. **As a player on desktop**, the app renders in the **same centered phone
   column** as on mobile — identical layout, spacing, nav. No stretched cards,
   no wide-mode drift.
3. **As a player offline** (subway/flight), navigating to any uncached page
   shows the **branded KoraLink offline screen** (bilingual) — never the
   browser's dinosaur/error page.
4. **As a desktop Chrome/Edge user**, I get a **native install prompt**
   (`beforeinstallprompt`) with an in-app banner; as an **iOS Safari user** I
   see short "Share → Add to Home Screen" instructions. Both dismissible and
  not shown when already installed/standalone.
5. **As any user**, installing/updating never regresses the other platform.

## Non-goals

- No Serwist migration (current `@ducanh2912/next-pwa@10` push wiring is
  healthy; migrating risks the verified push pipeline — separate cycle if ever).
- No offline data mutations/queue (React Query cache + SW caches stay as-is).
- No redesign of screens — parity only, per koralink-ui-standards.
- No desktop-specific two-pane layout (explicitly out: standardize = ONE shell).

## Acceptance criteria (verifiable)

- [ ] Desktop Chromium: clicking Date/Time fields opens the picker (headless
      verification via `page.click` + picker DOM or `showPicker` spy).
- [ ] iOS: fields still open the wheel picker on bare tap (pattern unchanged:
      input remains the full-size hit target; `showPicker` guarded no-op).
- [ ] `MobileFrame` + `BottomNav` share the same max-width cap (`max-w-md`).
- [ ] After build: `grep -c setCatchHandler public/sw.js` ≥ 1 and offline page
      served on failed navigation (DevTools offline navigation test).
- [ ] Install banner: shown on Chromium desktop (deferred prompt), iOS
      instructions on Safari non-standalone; hidden when `display-mode:
      standalone` or already installed.
- [ ] `manifest.json` has `id`.
- [ ] Full test suite green + `turbo run build` zero errors.
