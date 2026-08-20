# Gate 4 — Completion: PWA Parity & Standardization

**Status: COMPLETE** — commit `788cae3` (pushed to main), 2026-08-20.

## Slices delivered

| Slice | Result | Evidence |
|-------|--------|----------|
| 1. Cross-platform pickers | `DateTimeOverlayInput` shared component; guarded `showPicker()` restores desktop calendar while iOS tap path unchanged | 2 new tests (desktop spy + iOS no-op); headless: `showPicker` supported + callable on host form |
| 2. Shell width parity | `max-w-6xl` → `max-w-md` on MobileFrame + BottomNav + BottomSheet + match CTA | Headless 1280px: column 448px centered, nav aligned; 390px: full width, no overflow |
| 3. Offline fallback | `offline.tsx` → `offline/page.tsx` (was never a route!); `fallbacks.document: '/ar/offline'` | SW precache contains `/ar/offline` (revision-hashed); routes serve 200 |
| 4. Install prompt | `usePwaInstall` + portaled `InstallPrompt` + ar/en i18n + manifest `id` | 8 hook tests (standalone/cooldown/iOS/Chromium state machine); banner renders post-conditions only |
| 5. Cycle close | Full build + verify + commit/push | `turbo` 3/3; 208/208 tests; 11/11 headless checks |

## Critical discoveries beyond the plan (both fixed in-cycle)

1. **The production service worker was completely dead.** Two independent silent
   killers: (a) CSP `worker-src blob:` without `'self'` blocked registration
   itself; (b) the intl middleware redirected `worker-*.js`/`fallback-*.js`
   (SW importScripts targets) to `/ar/...` → 404 → install died with zero
   errors anywhere. Signature: sw.js 200 + SW "activated" but `caches.keys()`
   empty + `controller` null. This explains months of "stale PWA" symptoms
   (no offline, no push delivery, ChunkLoadError self-heal dead).
2. **tailscale serve HTTPS is 503 on this box** — pre-existing: Coolify's
   docker-proxy binds :443 first; tailscaled can't listen. Unrelated to the
   PWA (phone clients hit `100.93.99.24:3000` directly); flagged for Abdullah.

## Verification artifact

`scripts/verify-pwa-parity.mjs` — rerunnable 11-check parity suite (desktop
shell/nav/pickers, mobile overflow, SW registration/precache/fallback chain,
manifest id, banner sanity). Run: `node scripts/verify-pwa-parity.mjs`.
