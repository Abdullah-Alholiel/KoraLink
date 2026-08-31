# Cycle run23 — Gates 1–3 (single compact doc)

## Problem
1. A fresh KoraLink environment running `npm run db:migrate` fails at migration `0018`
   (`ADD VALUE 'account_unbanned' BEFORE 'no_show_marked'` — neighbor value missing because the
   journaled chain never adds `account_suspended`/`account_banned`/`no_show_marked`). Verified:
   0007 creates 5 verbs; 0026 folds back only 4 of the orphan's 7; live DB has 20 (out-of-band
   history). Reproducibility bug — any fresh env bootstrap 500s mid-chain.
2. PWA offline navigation fallback serves only `/ar/offline` (next.config.mjs `fallbacks.document`,
   sw.js precache) — English users land on an Arabic page.

## User story
As a developer bootstrapping a fresh environment, `drizzle migrate` completes without manual
SQL patching. As an English-locale PWA user, losing connectivity shows an English offline page.

## Scope
IN: one journaled idempotent migration (0029) adding the 3 verbs; a custom-worker offline-fallback
branch keyed by navigation locale; gates + board/report updates.
OUT: touching applied migrations (run #8 rule); changing live DB data; CSP nonce migration;
GiST re-location; any admin/partner surface.

## Architecture delta
- API/migrations: `apps/api/drizzle/0029_<name>.sql` via `drizzle-kit generate --custom`
  (comment + 3 `ALTER TYPE ... ADD VALUE IF NOT EXISTS` statements, journal idx 29).
  No schema.ts change (enum already carries all values — snapshot already correct).
- PWA: `apps/player-pwa/worker/index.js` += a `fetch` listener (prepended to generated sw.js via
  `@ducanh2912/next-pwa` `extend`): for navigation requests whose URL starts `/en/`, when the
  network+cache miss triggers the workbox `handlerDidError` fallback, serve the precached
  `/en/offline` instead of the `/ar/offline` document fallback. Implementation shape: install-time
  cache warm of `/en/offline` + a fetch listener that intercepts the fallback path.
  No src changes; no i18n changes (page already bilingual).

## API JSON shapes
None (no endpoint changes).

## TS signatures
None (worker file is plain JS, `extend` option already consumed by next-pwa).

## i18n keys
None (offline page copy already ships ar+en inline).

## Gate 3 contract verification checklist
- [x] Every mutation endpoint returns fully populated objects — N/A this cycle (no endpoint changes).
- [x] Frontend types accept the exact JSON the backend produces — N/A (no shape changes).
- [x] Adapter functions exist for every consumed API shape — N/A.
- [x] No field silently undefined — N/A.
- [x] i18n keys exist for every user-facing string in both languages — verified N/A: offline page
      carries both locales inline (page.tsx:5-16); no new strings introduced.
- [x] Migration is journaled + idempotent (`IF NOT EXISTS`) — verified by `drizzle-kit generate`
      output + applied-live NOTICE check.
- [x] Applied-migration files untouched (run #8 rule) — only 0029 is new.
