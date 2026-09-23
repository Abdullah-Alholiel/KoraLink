# Run #70 — Gates 1-3 compact (waitlist-push + subscribe-rollback)

## Problem / user story
- As a player on the waitlist, when a spot opens I must be PUSH-notified ("🎉 You're in!")
  even if the app is closed — today I only get an in-app activity row.
- As a player enabling push, if the server rejects my subscription the toggle must NOT show
  ON — today it does and I silently receive zero pushes.

## Scope
IN: (a) `notifyPromotion` push fan-out (semantic-key form), (b) worker route + type fixes
(`waitlist-promoted`, `match_starting_soon` off the 'match-chat' tag), (c) hook rollback on
server-POST failure + console.error removal, (d) locale default 'ar' alignment.
OUT: admin-ops verb pushes (owner scoping), VAPID single-sourcing (build-wiring decision),
badge/setAppBadge, report-resolved matchId.

## Contract deltas (Gate 3)
- `POST /notifications/subscribe` default locale: `'en'` → `'ar'` (body.locale ?? 'ar');
  service trailing default `'en'` → `'ar'`. Response shape unchanged.
- Push payload (new): `sendPushToUsers([userId], { key: 'waitlist_promoted',
  vars: { title }, data: { type: 'waitlist-promoted', matchId } })`.
- Push payload (renamed): match_starting_soon `data.type: 'match-chat'` →
  `'match_starting_soon'` (worker gains the branch; deep-link unchanged `/${locale}/match/:id`).
- Hook: `subscribe()` outcome contract unchanged ('ok'|'not-installed'|'permission-denied'
  |'error'); on POST failure the browser subscription is UNsubscribed and `subscription`
  state stays null.

## Contract verification checklist
- [x] No new mutation endpoints (activity/push fan-out only) — mutation contract N/A.
- [x] PWA types accept the payloads: `PushSubscribeOutcome` unchanged; worker is JS.
- [x] Adapter functions: none new (worker + hook only).
- [x] No silently-undefined fields: `WaitlistPromotion.matchTitle` already required.
- [x] i18n: zero new keys — catalog key `waitlist_promoted` already ships en+ar.
- [x] Gates before "done": turbo 3/3 (concurrency=1), notifications+matches jest, api tsc 0,
      PWA vitest + type-check + eslint.

## Tests
- API: new waitlist-push.spec.ts (happy fan-out + error-swallow), controller spec locale pins
  updated to 'ar'.
- PWA: hook rollback case (POST fails → unsubscribe called, outcome 'error'); worker source
  tripwires for both route branches + starting-soon type.
