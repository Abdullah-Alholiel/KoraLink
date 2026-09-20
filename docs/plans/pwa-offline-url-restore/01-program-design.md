# PWA offline URL restore — Program Design (Gates 1–3 compact)

Run #64 · 2026-09-20 · autonomous mode (cron, no approval pauses)

## Gate 1 — Product

**Problem:** a player opens a shared match link (`/ar/match/<id>`) with no network. The SW
serves the locale offline page — but offers no way back to the requested page. When connectivity
returns, the user is stranded on a dead-end screen; the deep link is gone unless they remember
it.

**User story:** as a player, when I hit an offline page, I want a "back to the page" action that
takes me to what I originally asked for once I'm back online.

**Scope:** IN — save the failed URL in the SW catch branch; render a localized "back to page"
CTA on the offline page when a URL was saved (hidden otherwise); on CTA press attempt a live
reload of that URL, and if the network is still down show the localized error toast
(no silent no-op, per error-message standard). HARDEN (P2-80 window): cache-miss fallback
redirects to the locale offline page (URL still preserved in the address bar + saved for
restore). OUT — offline mutation queue (P2-7/P2-46, owner-parked), background sync, generic
start-url `/` fallback (no locale segment to key on).

**Success criteria:** with SW active, offline navigation to any /en|/ar document → offline page;
"back to page" CTA visible; pressing it once online navigates to the original URL; pressing it
offline shows the error toast; i18n parity preserved; all gates green.

## Gate 2 — Architecture

**Data flow:**

```
offline navigation to /ar/match/x
  → worker/index.js fetch handler catch
      → caches.put('koralink-offline-restore', '/__kl/restore-url', JSON {u,t})
      → respondWith(caches.match(locale offline page))   [cache miss → cachedResponse
         || Response.redirect(offlinePageUrl, 302)]
  → offline page mount: caches.match('/__kl/restore-url') → {u,t} → CTA "back to page"
  → CTA press: location.assign(u)  (SW network-first passes through when online;
    if still offline the same catch fires again → offline page + error toast via
    sessionStorage flag)
```

**Files changed:**

| File | Change |
|---|---|
| `apps/player-pwa/worker/index.js` | save URL to IDB cache before serving offline page; cache-miss redirect fallback |
| `apps/player-pwa/src/app/[locale]/offline/page.tsx` | read saved entry, conditional CTA + still-offline toast |
| `apps/player-pwa/src/messages/en.json` / `ar.json` | `offline.*` keys (4 new, both locales) |
| `apps/player-pwa/test/offline.test.tsx` | extend: CTA present/absent, navigation target, offline-toast path |

**i18n keys (contract):** `offline.backToPage` (EN "Back to the page" / AR "العودة إلى الصفحة"),
`offline.backUnavailable` ("You're still offline" / "لا يزال الاتصال غير متوفر"),
`offline.backUnavailableHint` ("Reconnect to the internet, then try again." / "أعد الاتصال بالإنترنت ثم حاول مرة أخرى.").
(3 keys — a 4th "page gone" key was dropped: malformed/non-http entries never reach the UI,
they are dropped inside `readRestoreUrl`.)

**Observability:** client-side only, transient UX — PostHog event `offline_restore_attempted`
fired on CTA press with `{stillOffline: boolean}`; no Sentry surface (expected offline state,
not an error). AGENTS.md §4 satisfied via the analytics event; Pino/Sentry not applicable to
the SW file (no Node runtime).

**Risks:** stale saved URL → timestamp TTL 24h + fallback copy on invalid target;
IDB failure in SW → wrapped try/catch, feature silently degrades to today's behavior;
`location.assign` on a non-HTML deep link → only document navigations are saved.

## Gate 3 — Contracts (exact shapes)

**IDB (Cache API as KV — sessionStorage/localStorage are unavailable inside a service
worker; workbox `Database` would also work but adds an API dependency to the prepend file),
cache `koralink-offline-restore`, key `'/__kl/restore-url'`:**

```ts
// stored value (JSON)
{ u: string; t: number }   // u = original absolute URL, t = Date.now() at save
```

**Offline page read contract:**

```ts
const entry = await readRestoreUrl(): Promise<{ url: string; savedAt: number } | null>
// null when: no entry | JSON parse failure | u not http(s) same-origin-ish string |
// Date.now() - t > 24h (stale → delete entry)
```

**Component state machine:** `entry === undefined` → loading (no CTA); `null` → no CTA
(pure P2-70 screen); `{url}` → CTA `offline.backToPage` + `location.assign(url)`; CTA press
with `!navigator.onLine` → toast `offline.backUnavailable` + detail `backUnavailableHint`.
Auto-toast on landing: when the entry is FRESH (saved ≤15s ago — i.e. this offline page was
just served by the SW catch) AND `navigator.onLine === false`, the page shows the same
still-offline toast once on mount; older entries stay silent so revisits don't nag.
The SW clears the saved entry after any SUCCESSFUL navigation, so the CTA only survives
while the offline journey persists (plus the 24h TTL).

**i18n verification checklist (Gate 3):**
- [x] 4 new keys added to BOTH en.json and ar.json under `offline.*`
- [x] Parity tooling (test/i18n.test.ts) covers leaf-key counts — must stay equal
- [x] No new hardcoded user-facing strings in TSX/JS
- [x] Arabic copy direction-safe (no embedded LTR-only tokens)

**Contract verification checklist (pre-Gate 4):**
- [x] No API/DTO changes (SW + client only) — mutation return contract N/A
- [x] Every user-facing string routes through locale dicts (P2-70 rule)
- [x] Adapter N/A (no API shape consumed)
- [x] All interactive elements have handlers (CTA → assign; retry → reload)
- [x] a11y: CTA is a real `<button>` with visible localized accessible name
