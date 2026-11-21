# P2-371 baseline audit — real-browser layout scan (run #220)

- Generated: 2026-11-21T02:17:05.395Z · PWA http://localhost:3000 · API http://127.0.0.1:3001 (loopback intercept, api/v1 only)
- Matrix: 12 pages × {ar,en} × {360,390,430} — 72 planned loads, **66 executed** (6 match-detail loads skipped: staging DB has ZERO Open matches — 19 Cancelled / 8 Completed)
- Fixtures: CLUB_ID=83ae5528-5f3f-413f-820a-9d5b40815c51 MATCH_ID=n/a

## Gate results (D-20261113-33)

| Gate | Result |
|---|---|
| H-SCROLL (horizontal overflow) | **PASS — 0 of 66 executed loads** |
| OOB (element outside viewport, scroller-aware) | **PASS — 0** |
| MISSING_MESSAGE (i18n) | **PASS — 0** |
| OVERLAP (text-leaf pairs >8px, ancestor-aware) | FAIL — ≥330 instances (counter saturated at the 5/page cap on every load — true count is higher) → 1 structural finding (top-band overlay stacking) |
| TAP (<44px targets) | FAIL — ≥408 instances (8/page cap) → 7 signatures (all OUTSIDE the PR #274/#275 census sheets) |
| CONSOLE errors | 6 — single signature (messages page resource 404, URL attribution deferred) |

## Finding 1 — Top-band overlay stacking (P2)

Geometry-verified (privacy page, ar/360): page title "سياسة الخصوصية" rect t22–46 (absolute) overlaps the PWA install banner "تطبيق ويب · تطبيق قابل للتثبيت" t16–43 and the geolocation pill "فعّل موقعك" t28–48. Same band on club-detail, match-detail (validation toast vs banner), host, login. The install banner renders at TOP with a 20×20 dismiss; first-visit users on ≤430px see titles/banners/toasts stacked over each other.

Signature table (deduped):

| Pair (text sample) | loads | locales | pages |
|---|---|---|---|
| التحديثات الفورية متوقفة مؤقتً ⇄ تطبيق ويب · تطبيق قابل للتثبيت | 18 | ar | play,clubs,my-games,wallet,profile,messages |
| Live updates paused — reconnec ⇄ PWA · Installable app | 18 | en | play,clubs,my-games,wallet,profile,messages |
| KoraLink ⇄ شاهد المباريات والنوادي القريب | 6 | ar | play,profile |
| KoraLink ⇄ كورالينك على شاشة جهازك مباشرة | 6 | ar | play,profile |
| مسودة قيد المراجعة القانونية — ⇄ كورالينك على شاشة جهازك مباشرة | 6 | ar | privacy,terms |
| آخر تحديث : ١٣ نوفمبر ٢٠٢٦ ⇄ نقرة واحدة من شاشتك الرئيسية — | 6 | ar | privacy,terms |
| KoraLink ⇄ See games and clubs near you,  | 6 | en | play,profile |
| KoraLink ⇄ KoraLink, right on your home s | 6 | en | play,profile |
| Draft — pending lawyer review. ⇄ KoraLink, right on your home s | 6 | en | privacy,terms |
| Last updated : 13 November 202 ⇄ One tap from your home screen  | 6 | en | privacy,terms |
| ع ⇄ تطبيق ويب · تطبيق قابل للتثبيت | 3 | ar | login |
| EN ⇄ فعّل موقعك | 3 | ar | login |

## Finding 2 — Tap targets under 44px (P2)

| Target | size | loads | pages |
|---|---|---|---|
| button 58x28 تفعيل | 58x28 | 25 | play,club-detail,my-games,wallet |
| button 28x28 ليس الآن | 28x28 | 25 | play,club-detail,my-games,wallet |
| button 62x28 Enable | 62x28 | 25 | play,club-detail,my-games,wallet |
| button 28x28 Not now | 28x28 | 25 | play,club-detail,my-games,wallet |
| button 44x28 العربية | 44x28 | 6 | login |
| button 44x28 English | 44x28 | 6 | login |
| button 40x28  | 40x28 | 6 | play |
| button 36x36 أضف إلى المفضلة | 36x36 | 6 | clubs |
| button 36x36 Add to favorites | 36x36 | 6 | clubs |
| a 71x12 شروط الخدمة | 71x12 | 3 | login |
| a 96x12 سياسة الخصوصية | 96x12 | 3 | login |
| a 137x40 استضافة مباراة | 137x40 | 3 | play |

## Excluded artifacts (audit env, not app defects)

- socket.io reconnect noise (wss to the API funnel :8443, currently DOWN pending Tailscale re-auth) is filtered in-script; it is a known infra state, not a UI defect.
- Earlier harness iterations showed Sentry-ingest 404s from an over-broad intercept glob; the final run intercepts api/v1 only — ingest is untouched.

## Residual console signal (small, follow-up)

- messages page: resource 404 on 6 loads (ar only, all viewports) — URL attribution needs a response-URL capture next run; isolated to /messages.
- Staging DB note: zero Open matches (19 Cancelled / 8 Completed) — match-detail was skipped this baseline; seed an Open match before the next audit pass.
## Harness

- Script: scripts/p2-371-layout-audit.cjs (lane commit this run). playwright-core@1.65.1 lane-only (npm install --no-save), drives the VPS-native ARM64 chromium (chromium-1248, Chrome for Testing 156.0.8078.4).
- Auth: POST /auth/dev-login (seed +966500000001) → access_token cookie injected into the context + forwarded requests; /api/** intercepted to 127.0.0.1:3001 with cookie + allowlisted origin (localhost:3000).
- Deferred (recorded): sheet-interaction probes (PaymentSheet at 360×640), CI wiring (mode = post-deploy staging check for now), koralink-ui-standards + koralink-ui-verification skill updates, ~44px-class census alignment.
