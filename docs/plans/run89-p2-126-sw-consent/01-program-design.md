# P2-126 SW update consent — Program Design (Gates 1-3, compact/autonomous)

## Gate 1 — Product spec (compact)
- **Problem:** a mid-session deploy hard-reloads the app under the user (`skipWaiting:true` +
  unconditional `controllerchange`→reload) — in-flight form/draft loss. Also: first visit
  double-reloads (first-install claim triggers the same reload path).
- **User story:** "As a player filling in a form, a background app update must never wipe my
  input; when an update is ready I decide when to reload."
- **IN:** consent-gated activation — waiting worker stays waiting until user taps "Update now";
  localized banner; first-install claims without reload; pending-adopted-worker reload kept
  (necessary: adopted worker = stale page + new SW, old chunk refs can 404).
- **OUT:** no changes to caching recipes, precache manifest, push handlers, offline fallback.
- **Success criteria:** (1) no reload unless user consented or the page was adopted mid-session;
  (2) waiting SW activates ONLY via explicit SKIP_WAITING postMessage from the banner;
  (3) dismissible, EN+AR; (4) build + vitest + tsc green; (5) P2-60 guarantee intact (registration
  failures still captured, scope `swRegister`).

## Gate 2 — Architecture (compact)
Data/UI flow: browser update check (`reg.update()` on mount, browser auto-rechecks on nav) →
`reg.waiting` exists → banner (aria-live=polite, bottom, above nav z) → user taps "Update now" →
`reg.waiting.postMessage({type:'SKIP_WAITING'})` → SW runs `self.skipWaiting()` → `controllerchange`
→ reload (reload allowed here: user consented). "Later" dismisses for the session
(sessionStorage `swUpdateDismissed=<hash>`), auto re-offers next session/deploy.
Files: `next.config.mjs` (skipWaiting:false), `worker/index.js` (message listener + no auto-claim
when a controller exists), `ServiceWorkerUpdater.tsx` (banner + state machine),
`src/messages/{en,ar}.json` (pwa.update* keys), tests (new ServiceWorkerUpdater suite + structure
grep + i18n parity auto-covers).

## Gate 3 — Contracts (exact)
### worker/index.js (prepended into built sw.js)
```js
// P2-126: consent-gated activation. A waiting worker NEVER activates on its own.
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});
```
- Built sw.js must contain `self.skipWaiting()` EXACTLY ONCE (the listener call), zero
  unconditional calls, and NO `clientsClaim()`… EXCEPT the workbox `clientsClaim()` which stays:
  claiming IS still needed for offline fallback takeover; what changes is WHO triggers it.
  Actually — with skipWaiting:false the new SW only reaches 'activating' after consent, and
  workbox's `clientsClaim()` runs in the same activation step; keep workbox's `clientsClaim: true`.
  **Net config: `skipWaiting: false, clientsClaim: true`** (claim on activation is fine; activation
  itself is now the consented step).

### ServiceWorkerUpdater.tsx state machine
```
states: idle → 'ready' (reg.waiting exists && navigator.serviceWorker.controller ≠ null → show banner)
        'pending-adopt' (controller === null && reg.waiting) → auto-SKIP_WAITING, NO reload offer
events: onUpdate() → SKIP_WAITING post → controllerchange → reload (consented path)
        onDismiss() → sessionStorage swUpdateDismissed=<sw hash> → hide for session
        controllerchange && !explicitConsent && priorController === null → reload (adoption path)
```
- Explicit consent flag distinguishes consented reload (allowed) from any other
  controllerchange (first-claim → NO reload).

### i18n contract (both files, leaf-identical)
- `pwa.updateReadyTitle`: "Update ready" / "تحديث جاهز"
- `pwa.updateReadyBody`: "A new version is installed in the background. Reload to use it." /
  "تم تثبيت نسخة جديدة في الخلفية. أعد التحميل لاستخدامها."
- `pwa.updateReload`: "Reload now" / "أعد التحميل الآن"
- `pwa.updateLater`: "Later" / "لاحقاً"

### Test contract
- New `test/components/service-worker-updater.test.tsx`: (1) shows banner when `reg.waiting` +
  controller exist; (2) hidden when no waiting; (3) Reload now → postMessage SKIP_WAITING exactly
  once; (4) Later → dismisses + sessionStorage set; (5) session-dismissal persists across remount;
  (6) first-install (no controller): auto SKIP_WAITING + NO banner + NO reload on controllerchange;
  (7) pending-adopt (controller appeared without consent): reloads once.
- Structure test greps worker/index.js for the message listener (guard against regression to
  auto-activation) and asserts `skipWaiting: false` in next.config.mjs.
- Run `npm run type-check` (test/ is type-checked by CI even though next build skips it).

## Gate 3 checklist — contract verification
- [x] Workbox config: `skipWaiting:false` (consent gate), `clientsClaim:true` (offline fallback
      takeover preserved) — verified against @ducanh2912/next-pwa workboxOptions passthrough
      (skipWaiting/clientsClaim are standard workbox-build generateSW options).
- [x] No unconditional `self.skipWaiting()` survives in the prepend source (built sw.js regenerates
      from it on build; verify post-build: exactly ONE `skipWaiting()` occurrence, inside listener).
- [x] P2-60 intact: register() still in ServiceWorkerUpdater with captureError scope swRegister.
- [x] P2-40 intact: no changes to worker/index.js fetch handlers / offline navigation.
- [x] i18n: 4 new leaf keys × en + ar; parity test suite revalidates globally.
- [x] Every UI string from i18n — no hardcoded copy in the banner.
- [x] z-index: banner above BottomNav (z-50) — use z-[60] (bottom-sheet backdrop tier), never top.
- [x] Mutation contract N/A (frontend-only; zero API/DB surface).
