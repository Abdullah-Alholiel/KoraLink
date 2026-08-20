# Gate 3 — Program Design: PWA Parity & Standardization

## Locked contracts

### C1 — `DateTimeOverlayInput` (new shared component)

Path: `src/components/host/DateTimeOverlayInput.tsx`

```tsx
'use client';
interface DateTimeOverlayInputProps {
  type: 'date' | 'time';
  value: string;
  onChange: (v: string) => void;
  label: string;            // aria-label + visible uppercase caption
  display: React.ReactNode; // styled display row (icon + formatted value)
  min?: string;             // date only
  step?: number;            // time only (600 = 10 min)
}
```

Behavior:
- `<label>` wrapper (styled card), `display` rendered visibly, `<input>`
  overlay `absolute inset-0 h-full w-full opacity-0 cursor-pointer`.
- `onClick` on input: `if (typeof el.showPicker === 'function') { try { el.showPicker(); } catch { /* expected without user activation */ } }`
- NEVER inside a `<button>`; NEVER `sr-only`. (Regression-tested.)

Consumers: MatchDetailsForm (date + time), SlotPicker (slot-date). Existing
display markup moves into the `display` prop — zero visual change.

### C2 — Shell width

- `MobileFrame.tsx` inner div: `max-w-6xl` → `max-w-md`.
- `BottomNav.tsx` nav: `max-w-6xl` → `max-w-md`; inner grid keeps
  `max-w-xl mx-auto` (already ≤ md, unchanged).
- No other files. Pages using MobileFrame directly inherit the cap.

### C3 — Offline fallback

`next.config.mjs`: `fallbacks: false` →
`fallbacks: { '/ar/offline': {}, '/en/offline': {} }`.
If `/[locale]/offline` is not prerendered → add `export const dynamic = false`.
Post-build assertions: `grep -c setCatchHandler public/sw.js` ≥ 1;
`.next/server/app/{ar,en}/offline.html` exist.

### C4 — Install prompt

New `src/hooks/usePwaInstall.ts` (contract in 02-architecture D4) +
`src/components/pwa/InstallPrompt.tsx` rendered in `[locale]/layout.tsx`
(after ChunkLoadErrorHandler, outside providers chain is fine — needs
IntlClientProvider so INSIDE it).

i18n keys (BOTH ar.json + en.json):

```json
"pwa": {
  "install": {
    "title": "Install KoraLink",
    "bodyDesktop": "Get the full-screen app experience with one tap.",
    "bodyIos": "Add KoraLink to your home screen for the full app experience.",
    "install": "Install",
    "notNow": "Not now",
    "iosSteps": "1) Tap Share  2) Add to Home Screen"
  }
}
```
(Arabic equivalents authored during implementation; keys locked now.)

localStorage key: `koralink.install-banner-dismissed-at` (ISO timestamp;
7-day cooldown).

### C5 — Manifest

`public/manifest.json`: add `"id": "/"` (first field after name/short_name).

## Vertical slices (Gate 4 execution order)

### Slice 1 — Cross-platform pickers (tracer: Host flow date/time)
1. Create `DateTimeOverlayInput` per C1.
2. Refactor MatchDetailsForm (date + time) + SlotPicker (slot-date) to use it.
3. Tests (extend `MatchDetailsForm.test.tsx` + new SlotPicker cases):
   - hit-target pattern intact (existing 6 tests must stay green, unmodified)
   - NEW: onClick calls `showPicker` when the function exists (mock on
     HTMLInputElement prototype)
   - NEW: onClick is a no-op (no throw) when `showPicker` is undefined (iOS sim)
4. Headless verify desktop: click date field → picker opens (Chromium).
5. `npm run build` + full test suite green.

### Slice 2 — Shell width parity
1. Apply C2 (2 files).
2. Visual verify desktop 1280px: column centered 448px, nav aligned under it;
   mobile 390px unchanged (screenshots via headless).
3. Build + tests green.

### Slice 3 — Offline fallback
1. Apply C3; verify offline route prerenders (else force SSG).
2. Build; assert setCatchHandler ≥ 1 + offline.html exists.
3. Headless verify: throttle offline → navigate uncached route → offline screen.

### Slice 4 — Install prompt + manifest id
1. `usePwaInstall` hook + tests (mock matchMedia/UA/localStorage;
   standalone → hidden; dismissed <7d → hidden; canInstall → visible).
2. `InstallPrompt` component + i18n keys + PostHog events.
3. Mount in layout; manifest `id`.
4. Headless verify banner renders on desktop Chromium (beforeinstallprompt
   mocked via CDP or verified by logic-level tests).
5. Build + tests green.

### Slice 5 — Cycle close
1. Full `turbo run build` + `npm test` (all suites).
2. Headless smoke: /play desktop + mobile viewport; host form pickers both.
3. Commit (conventional), push, deploy via postbuild auto-sync (standalone).
4. PostHog event check in served bundle (grep for install event names).

## Definition of Done (per slice + cycle)

- [ ] All contracts above implemented verbatim (deviations need re-approval)
- [ ] New tests green; pre-existing tests untouched-green
- [ ] `turbo run build` zero errors (terminal output shown)
- [ ] Headless verification evidence (command output / screenshots)
- [ ] PostHog events present in served bundle
- [ ] i18n keys in BOTH locales
- [ ] Committed + pushed; CI green

## Risks & mitigations

| Risk | Mitigation |
|------|------------|
| `showPicker()` throws in some embedding contexts | try/catch — silent, documented |
| offline page dynamic-only → not precached | Slice 3 step 1 checks; force SSG |
| Width cap breaks match hero full-bleed | hero lives INSIDE frame → scales with column; visual check in Slice 2 |
| `beforeinstallprompt` not fireable in headless | logic-level tests cover state machine; banner render test mocks the event |
| Dirty working tree (11 files, other workstream) | must be resolved (commit/stash) BEFORE Slice 1 — blocker |
