# Run #135 — Gates 1–3 Program Design (P1-66 push VAPID last mile)

## Gate 1 — Product spec (compact)

**Problem:** push notifications never fire anywhere. Server has no VAPID keys (sends
self-skip); client hardcodes the public half of a publicly-burned demo keypair, so even a
naive "fix" would be insecure, and the worker rotation would keep re-subscribing users to
the burned key.

**User story:** as a player with the PWA installed, when the server has no push keys yet I
see an honest "not set up yet" hint instead of being walked through install/permission steps
that can never work; when the owner adds keys and restarts, subscribe works and my matches
remind me.

**Scope:** IN — env-keyed VAPID public key (PWA), worker empty-key abort, `not-configured`
outcome + hint (EN/AR), .env.example server contract, tripwire tests. OUT — generating/provisioning
real keys (owner, credential custody), any server behavior change (self-disable stays), iOS
APNs, push content.

**Success criteria:** no codelab key anywhere in source; subscribe with empty key never
reaches requestPermission or the SW; profile shows the new hint; all gates green.

## Gate 2 — Architecture delta (compact)

No DB, no API behavior change. Data flow: `env.NEXT_PUBLIC_VAPID_PUBLIC_KEY` (build-time
baked) → `usePushNotifications` subscribe → pushManager.subscribe(applicationServerKey) →
POST /notifications/subscribe (unchanged). Worker rotation reads KV `/__kl/push-vapid`
(hook-mirrored) with an empty-string fallback that now ABORTS.

**Files changed:** `src/env.mjs` (client var, empty default), `src/hooks/usePushNotifications.ts`
(outcome union + early return + KV mirror guard), `src/app/[locale]/(main)/profile/page.tsx`
(hint branch), `src/messages/en.json`/`ar.json` (1 key each), `worker/index.js` (empty
default + abort), `apps/api/.env.example` (commented contract), 2 test files.

## Gate 3 — Contracts (exact shapes)

- `export type PushSubscribeOutcome = 'ok' | 'not-installed' | 'permission-denied' | 'error' | 'not-configured';`
- `subscribe()` guard order: `!('serviceWorker' in navigator)` → `'not-installed'`; SSR →
  `'not-configured'` (no key) — wait: SSR branch returns 'not-installed' today for the
  `typeof window === 'undefined'` check; the NEW key check sits BEFORE the standalone gate:
  `if (!VAPID_PUBLIC_KEY) return 'not-configured';` placed immediately after the
  serviceWorker-supported check, so it precedes matchMedia + requestPermission.
- Profile switch: `outcome === 'not-configured' || outcome === 'not-installed' ||
  outcome === 'permission-denied'` → `setSubscribeHint(outcome)`; hint renderer adds a
  third `: ef('common.pushNotConfigured')` arm (role="status", amber, same as existing).
- i18n (leaf-key parity preserved): `common.pushNotConfigured` =
  EN "Push notifications are not set up on this server yet. Check back later." /
  AR "الإشعارات الفورية غير مُهيّأة على الخادم بعد. تفضّل لاحقًا."
- Worker: `const DEFAULT_VAPID_PUBLIC_KEY = '';` + `if (!vapidKey) return;` before
  `pushManager.subscribe` inside `pushsubscriptionchange` (KV read unchanged).
- API .env.example block (comments only — no values):
  `# VAPID_PUBLIC_KEY=` · `# VAPID_PRIVATE_KEY=` · `# VAPID_SUBJECT=mailto:hello@koralink.sa`
  + "Generate with: npx web-push generate-vapid-keys — push notifications stay disabled
  without these".

### Contract verification checklist (run before Gate 4)

- [x] No mutation endpoint touched → mutation-return contract N/A.
- [x] Frontend types accept backend shapes: zero API shape change; only client-side outcome
      union extended (frontend-internal contract, pinned by hook tests).
- [x] Adapter contract: none added/removed (no API shape change).
- [x] No field silently undefined: env var defaults to '' explicitly; guard converts '' →
      'not-configured' outcome, never undefined flow.
- [x] i18n keys exist in BOTH en.json and ar.json (1 new key each; parity checked in gates).
- [x] Worker never calls pushManager.subscribe with an empty key (abort guard + tripwire test).
- [x] Zod env schema: `NEXT_PUBLIC_VAPID_PUBLIC_KEY: z.string().default('')` mirrors the
      NEXT_PUBLIC_SENTRY_DSN pattern; runtimeEnv wired.

## Status

| Gate | Name | Status | Artifact |
|------|------|--------|----------|
| 0 | Retrospective | ✅ DONE (autonomous) | [00-retro.md](./00-retro.md) |
| 1 | Product Spec | ✅ DONE (compact, this doc) | this doc |
| 2 | Architecture | ✅ DONE (compact, this doc) | this doc |
| 3 | Program Design | ✅ DONE (checklist above all ✓) | this doc |
| 4 | Vertical Slices | 🔄 IN PROGRESS (lane) | lane run 01a1403c |
