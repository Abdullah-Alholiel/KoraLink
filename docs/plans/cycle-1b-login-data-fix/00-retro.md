# Gate 0 — Retrospective: Post-Update Login/Data Failure

**Date:** 2026-08-12
**Symptom:** After last 3 feature commits, user could not log in with dev user, nor see any data.

---

## Root Causes Found (3 real bugs)

### RC-1: Missing DB migration — new tables + enum value never applied
- Commits added `match_reviews`, `push_subscriptions` tables and `PITCH_BOOKING` enum value to `schema.ts`, but **no migration was generated or run**.
- DB state: both tables missing, `ReferenceType` enum lacked `PITCH_BOOKING`.
- `__drizzle_migrations` tracking table did not exist → `drizzle-kit migrate` tried to re-run ALL migrations from scratch → duplicate-enum error (42710).
- **User impact:** `PITCH_BOOKING` transaction inserts 500'd (confirmed in API logs: `insert into transactions ... PITCH_BOOKING ... failed with status code 500` at 07:16-07:17) — "Book via Us" hosting broken.

### RC-2: SSR crash — `window` accessed at render time in `usePushNotifications`
- `isSupported: 'Notification' in window && 'serviceWorker' in navigator` evaluated during render (both SSR and client).
- On the server `window` is undefined → `ReferenceError: window is not defined`.
- **Confirmed in `next start` logs:** `⨯ ReferenceError: window is not defined at .next/server/app/[locale]/(main)/profile/page.js` — the Profile page 500'd for every visitor.

### RC-3: Committed service-worker build artifacts
- `public/sw.js` + `public/workbox-*.js` are **build artifacts with content-hashed chunk URLs**.
- The committed `sw.js` referenced an OLD build's chunk hashes; after any rebuild the precache list pointed at 404 URLs → installed PWA broke (login + data unusable in production mode).
- **Fix:** gitignored + untracked; regenerated on every build.

---

## Non-issues ruled out (with evidence)
- API auth: dev-login → 200, users/me → 200, matches → 200/304 **from the user's own browser** (Tailscale 100.122.72.55) at 07:14:59 — backend was never the login blocker.
- CORS: `access-control-allow-origin: http://localhost:3000` verified on preflight.
- PWA pages: all 14 routes return 200 after fix.

---

## Fixes Applied
| # | Fix | Verification |
|---|-----|-------------|
| 1 | Generated `0003_acoustic_reptil.sql`, applied manually + tracked in `__drizzle_migrations` | `PITCH_BOOKING` DEBIT 200 SAR + REFUND 245 SAR verified end-to-end via API |
| 2 | Guarded `typeof window`/`navigator` in `usePushNotifications` | All pages 200 incl. `/profile` |
| 3 | `.gitignore` + `git rm --cached` for sw.js/workbox | Build regenerates matching sw.js (BUILD_ID == sw hash == served hash) |

## Preserved (concurrent work, not mine)
- `HostMatchForm.tsx` / `MatchDetailsForm.tsx` — slot-duration locking feature + i18n keys (`durationLocked`, `minutes`).

---

**Status:** ✅ FIXED — committed `5bf1766`, pushed to main. API restarted, PWA restarted with fresh build.
