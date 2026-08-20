# Gate 2 — Architecture: PWA Parity & Standardization

## Surfaces touched (4 files + config)

```
apps/player-pwa/
├── next.config.mjs                      # SW fallbacks config
├── public/manifest.json                 # + id
┌─ src/
│  ├── components/layout/MobileFrame.tsx     # width standardization
│  ├── components/layout/BottomNav.tsx       # width standardization cap
│  │
│  ├── components/host/MatchDetailsForm.tsx  # date/time showPicker guard
│  ├── components/host/SlotPicker.tsx        # slot-date showPicker guard
│  │
│  └── NEW components/pwa/InstallPrompt.tsx  # beforeinstallprompt + iOS UX
│  └── NEW hooks/usePwaInstall.ts            # capture + standalone detection
│  └── NEW test/components/InstallPrompt.test.tsx
└── public/sw.js (generated — verify only)
```

## Design decisions

### D1 — Date/time: overlay input + guarded `showPicker()` (both platforms)

Commit f22886c made the transparent input the hit target (iOS ✓) but removed
`showPicker()` entirely — desktop Chromium never opens the calendar on bare
click (focus only). Fix: keep the overlay, add `onClick` →
`showPicker()` **guarded** (`typeof === 'function'` + try/catch). iOS: method
undefined → no-op; native tap behavior already opens the wheel. Android: native
sheet opens regardless; the call is harmless (guarded).

Why not a custom React calendar? Native pickers give the platform-native UX on
every platform with zero bundle cost, match the "native feel" requirement, and
both regressions came from fighting the platform, not from native inputs.

### D1-contract (locked at Gate 3): `DateTimeOverlayInput`

A shared component so the pattern exists ONCE:

```tsx
interface DateTimeOverlayInputProps {
  type: 'date' | 'time';
  value: string;
  onChange: (v: shell) => void;
  label: string;          // aria-label + visible caption
  display: ReactNode;     // styled display (icon + formatted value)
  min?: string;
  step?: number;
}
```

Renders the `<label>` + styled display + `<input>` overlay with the guarded
`showPicker()`. MatchDetailsForm date & time + SlotPicker slot-date all use it.

### D2 — App shell width: one column everywhere

`MobileFrame` inner div: `max-w-6xl` → `max-w-md`. `BottomNav` `max-w-6xl` →
`max-w-md` (grid stays `max-w-xl` inner? NO — cap the whole nav at `max-w-md`
with the grid full-width inside; the 5 tabs occupy the column width on desktop
exactly as on phone). Body already centers via `flex justify-center`.

Risk: pages rendering `MobileFrame` directly (match detail, host) vs via
`(main)` layout — all go through the same component, so one change fixes all.
Full-screen background (match hero) fills viewport; content column capped.

- Desktop >768px: centered 448px column, sides show body bg (white per §3) —
  "app preview" presentation, standard for phone-first PWAs.
- Reuses existing `--app-height` shell; no height changes.

### D2-risks

- Match detail hero uses full-bleed inside the frame; verify no width-jank at
  exactly 768px (tested in Slice 2).
- BottomNav FAB `-mt-7` offset is relative — unaffected by width cap.

### D3 — Offline fallback wired: `fallbacks` enabled

`next.config.mjs`: `fallbacks: false` → `fallbacks` mapping BOTH localized
offline routes (`/ar/offline`, `/en/offline`) per the nextjs-pwa skill's
troubleshooting reference. The offline page is a client page using
`usePathname` — it must be statically prerendered for the SW to precache it;
if it renders dynamic-only, force SSG. Slice 3 verifies
`.next/server/app/ar/offline.html` exists post-build.

**Verification:** after build, `grep -c setCatchHandler public/sw.js` ≥ 1;
offline navigation in headless Chromium serves the bilingual offline screen.

### D4 — Install prompt: `usePwaInstall` hook + `InstallPrompt` component

- `beforeinstallprompt` (Chromium): capture event, `preventDefault`, store in
  ref/state; expose `canInstall`, `promptInstall()`.
- iOS Safari non-standalone: UA sniff `/iPad|iPhone|iPod/` + standalone check
  via `matchMedia('(display-mode: standalone)')` OR `navigator.standalone`.
- Hidden when standalone or dismissed (7-day cooldown via `localStorage`,
  key `koralink.install-banner-dismissed-at`). No cross-session nagging.
- Rendered as a bottom banner using the shared `BottomSheet` pattern
  (z-[60]/z-[70], `pb-safe`, `animate-slide-up`, transform on inner wrapper
  only) per koralink-ui-standards §4.

**Design per ui-standards:** brand card + icon + two CTAs (Install / Not now),
iOS variant shows numbered share-sheet steps (1. Share 2. Add to Home Screen)
with lucide `Share` icon, copy in ar/en via next-intl keys
`pwa.install.*`, numbers wrapped `<span dir="ltr">`.

### D4-contract (locked at Gate 3)

```ts
// hooks/usePwaInstall.ts
interface PwaInstallState {
  canInstall: boolean;        // beforeinstallprompt captured
  isStandalone: boolean;      // display-mode standalone or navigator.standalone
  isIos: boolean;            // UA contains iPhone/iPad/iPod
  shouldShowBanner: boolean;  // logic: !isStandalone && (canInstall || isIos) && !dismissedRecently
  promptInstall(): Promise<boolean>;  // resolves true if accepted
}
```

### D5 — Manifest `id`

Add `"id": "/"` to `public/install-manifest.json`... manifest is
`public/manifest.json` — add `"id": "/"`. Identity stable across future
`start_url` edits; removes Chrome console warning.

## Observability (mandatory)

Per factory rules — every new user-visible behavior gets instrumentation:

- `pwa_install_banner_shown` (platform: desktop_chromium | ios_safari)
- `pwa_install_accepted` / `pwa_install_dismissed`
- `pwa_install_prompt_result` (accepted | dismissed | not-installable)

Decision: instrument banner events only. Picker interactions are
high-frequency noise — the guarded `showPicker()` catch stays silent because
a throw there is expected (no user activation), not an exceptional error.

## CSP unchanged

No new origins. Install prompt + offline fallback introduce no network
destinations → CSP stays as-is (worker-src blob: already present).

## Out of architecture scope

Serwist migration, offline queue, desktop two-pane. See Gate 1 non-goals.
