# Gate 0 — Retrospective: KoraLink PWA → App Store submission

**Date:** 2026-09-23 · **Baseline:** main @ HEAD (post-`run56-pwa-lane` cluster)
**Driver:** User decision 2026-09-23 — "i need to upload my pwa on app store as mobile app."
**Path chosen (clarify 2026-09-23):** Capacitor 6 wrapper → iOS App Store + Google Play.
**Enrollment status:** Apple Developer account NOT yet active; Google Play Console NOT yet created. Owner blocks; my code work proceeds in parallel.

> This Gate 0 is a **resumption** of `docs/plans/ios-native-and-scalability/00-retro.md` (2026-08-26, baseline `2f57495`), which already enumerated the static-export blockers. That plan concluded "Path C — Ship the PWA on iOS properly first, defer Capacitor." The user has now flipped that decision; this plan supersedes it.

---

## A. What the user already gave us (decisions captured 2026-09-23)

| Q | Answer |
|---|---|
| Which App Store target(s)? | **Capacitor 6, both iOS + Android.** |
| Native-dev setup? | Mac + Xcode installed, **no paid Apple Developer account yet.** |
| Business driver? | **Credibility / discoverability / SEO** — App Store presence matters. |
| Apple enrollment? | **Owner handles in parallel.** Code work proceeds without it; first `.ipa` build is gated on enrollment completion. |

Implication: plan must (a) be buildable in code today, (b) defer any signing-dependent steps to an explicit "Phase Z: owner-action-required" handoff, (c) prioritize App Store review-readiness (Apple guideline 4.2 — the #1 rejection reason for PWA wrappers) over technical depth.

---

## B. Re-confirmed baseline (since the 2026-08-26 assessment)

### B.1 — The four static-export blockers (unchanged)

The 2026-08-26 plan identified four blockers. Verified again today against HEAD; **all four still apply**:

| # | Blocker | Current evidence | Capacitor impact |
|---|---|---|---|
| 1 | `output: 'standalone'` (not `'export'`) | `apps/player-pwa/next.config.mjs` opens with the Workbox/Sentry config — the standalone build mode is implicit in `postbuild: node scripts/sync-standalone.mjs` and the deployed systemd unit `koralink-pwa.service` | Capacitor bundles static files only — `out/` must exist |
| 2 | next-intl runtime middleware | `apps/player-pwa/src/middleware.ts` (referenced in `next.config.mjs` via `createNextIntlPlugin('./i18n/request.ts')`) | Middleware never executes in static export — locale routing needs a client bootstrap |
| 3 | SW-based offline + web push | `@ducanh2912/next-pwa` 10.2.9 with `customWorkerSrc: worker/index.js`, `fallbacks: /ar/offline` | **WKWebView has no service-worker support** — entire offline + web-push layer is dead in the shell |
| 4 | Server-rendered security headers | `headers()` block in `next.config.mjs` (CSP, X-Frame-Options, Permissions-Policy) | Headers don't apply to bundled local files — must move to `capacitor.config` / meta tags |

**Δ from 2026-08-26:** blocker #1 now has a known recipe in this codebase (run #44 added per-locale manifest support via `metadata.manifest` in `app/[locale]/layout.tsx`, so the static-export metadata path is already exercised). That removes one source of risk but doesn't remove the blockers themselves.

### B.2 — What's new since the 2026-08-26 baseline (HEAD audit)

| Item | Status today | App Store impact |
|---|---|---|
| **HTTPS on the PWA staging** | `100.93.99.24:9450` (VPS dev) — raw IP, self-signed → ATS-blocking, geolocation-blocked | Capacitor *bundled-files* mode sidesteps ATS (no network fetch from the shell for first paint). Network calls to the API still go over HTTPS and need a real domain. |
| **Production PWA** | Vercel × 2 (per memory entry `Deploy lanes: Render FREE auto-deploys main NO migrate. Prod = Vercel×2+Render+Neon`) | Capacitor can ship pointing at the prod Vercel origin; API at Render + Neon. Both must be HTTPS (already are). |
| **Install UX** | `components/pwa/InstallLanding.tsx` (186 LoC), `InstallPrompt.tsx` (106), `WelcomeCheckpoint.tsx` (62), `InstallLandingGuard.tsx` (44) — `hooks/usePwaInstall.ts` orchestrates | Inside Capacitor, this whole layer becomes **inert and confusing**: the user is already "installed." Must gate on `Capacitor.isNativePlatform()` and hide the install flow. |
| **iOS PWA chrome** | `apple-mobile-web-app-capable`, `status-bar-style`, `apple-touch-icon` already in `app/[locale]/layout.tsx` | Carry these into Capacitor's native splash + status-bar config (`@capacitor/status-bar`). |
| **Workbox runtime caching** | Carefully tuned per-endpoint (`next.config.mjs` runtime-caching block) | SW is dead in WKWebView. **All API caching logic must move to native code or in-app request caching** (TanStack Query already does this with `staleTime: 60_000`). |
| **Web push** | `usePushNotifications.ts` — VAPID public key inlined, browser Push API | **Replace with `@capacitor/push-notifications` + APNs/FCM.** Server-side subscription model (current API expects a Web Push `subscription` JSON) must accept a native device-token payload too. |
| **Badging API** | Not yet implemented (from the prior turn's "best standard PWA" assessment) | **In Capacitor, `navigator.setAppBadge` works on Android via Chromium, fails on iOS WKWebView** — use `@capacitor/badge` for cross-platform native badge. |
| **Bearer auth fallback** | `lib/fetcher.ts` stores JWT in `localStorage` (`koralink_token`), sends as `Authorization: Bearer` | WKWebView's localStorage is per-app and survives kill — works. **But** `localStorage` can be wiped on iOS storage pressure. Plan: add `@capacitor/preferences` for durable token storage on top of existing localStorage fallback. |
| **Geolocation** | `hooks/useGeolocation.ts` uses browser API | Capacitor: keep browser API inside WKWebView **plus** `@capacitor/geolocation` for fine permissions and background updates. WKWebView's `navigator.geolocation` already works in modern iOS — confirm. |
| **Socket.io** | `lib/socket.ts` connects to API host | Must include Capacitor scheme in `Origin` allowlist on the API (`apps/api/src/main.ts` CORS callback); or better: route via the prod API host from inside Capacitor (no origin issue). |
| **PostHog** | `posthog-js` 1.416.1, captured install events | Works unchanged in WKWebView. **No code change.** |
| **Sentry** | `@sentry/nextjs` 10.70.0 | Browser-side works in WKWebView. **Add `@capacitor/sentry`** for native crash reporting (Objective-C/Swift + Java exceptions) — but only if the owner wants richer crash data. Default: skip. |

### B.3 — Real gaps the 2026-08-26 plan missed

| # | Gap | Why it matters now |
|---|---|---|
| G1 | **App Store assets:** screenshots, app icon (1024×1024 marketing + native iOS/Android icon sets), app preview videos, ASO keywords, privacy policy, support URL, age rating questionnaire | App Store Connect rejects incomplete metadata. Without these, no submission possible. None exist in repo. |
| G2 | **Apple guideline 4.2 — "minimum functionality"** | Apple rejects "thin webview wrappers" unless the app provides native-grade polish (custom splash, native navigation gestures, status-bar integration, app icon set). **Must be addressed in Gate 2 architecture, not deferred.** |
| G3 | **Capacitor version drift** | `@capacitor/*` is now at v6.x; some 2025 tutorials reference v5. Pin exact versions in the Gate 3 contracts. |
| G4 | **Build pipeline** | No CI today builds `.ipa`/`.apk`. Need a `mobile` Turbo target + GitHub Actions macOS runner for iOS + Linux runner for Android. The VPS is irrelevant here — Xcode cannot run on ARM Linux. |
| G5 | **App icon parity** | The "best standard PWA" audit (last turn) found the green-footballer icons had baked-in black backgrounds that read as dark discs on the app bar. App Store icons MUST be opaque (iOS / maskable). Same fix as the in-app rule: keep maskable + apple-touch opaque, ship transparent only for in-app favicons. |
| G6 | **`Capacitor.isNativePlatform()` gate on the install UX** | Install prompts inside a native app are absurd. The whole `usePwaInstall()` machinery must early-return when `Capacitor.isNativePlatform()` is true. Without this, the welcome checkpoint would fire on every native launch. |
| G7 | **iOS bundle ID + Android application ID + signing** | Need real values. Provisional: `com.koralink.app` (iOS) and `com.koralink.app` (Android). Owner decides naming. |
| G8 | **Privacy manifest (iOS 17+)** | Apple requires `PrivacyInfo.xcprivacy` declaring Required Reason API usage (UserDefaults, file timestamp, disk space, etc.). Capacitor provides a starter; we must declare any custom plugin usage. |
| G9 | **App Tracking Transparency (iOS 14.5+)** | If we use IDFA or any tracking, we need ATT prompt. We currently don't — PostHog/Sentry are first-party analytics. **Confirm with owner.** |
| G10 | **Android target API level (34+)** | Google Play requires targetSdk 34 (Android 14) since Aug 2024. Capacitor 6 ships with this; verify. |
| G11 | **Android 64-bit requirement** | Google Play requires 64-bit native libs. Capacitor 6 is 64-bit by default; verify no stray 32-bit dependencies. |

---

## C. Standing contracts and standards that govern this plan

These are NON-NEGOTIABLE — every Gate 1+ decision must respect them.

1. **`turbo run build` must pass with zero errors** before any slice is claimed done (`.hermes.md` + AGENTS.md §0).
2. **KoraLink UI Standards skill** (`docs/skills/koralink-ui-standards.md`) governs every screen that ships in the Capacitor bundle. The native shell uses the same screens; **no UI divergence.**
3. **i18n parity (en + ar)** for every new string (UI standards §7).
4. **Logical CSS properties** (`ms-*` / `me-*`) — RTL correctness must hold inside the WKWebView exactly as in Safari.
5. **Sentry + PostHog + Pino** — observability contract preserved.
6. **5 UX states per screen** (loading / empty / error / populated / edge) — review-readiness argument for guideline 4.2.
7. **Hydration safety** — no `Date.now()` in render path (run #40 lesson). The client-only locale bootstrap for static export MUST not introduce new SSR/CSR mismatches.
8. **`apps/api` Bearer auth + CORS** — already passes no-Origin (Capacitor WKWebView sends no Origin header on bundled-file loads, but DOES send Origin on cross-origin API fetches). Confirm with API CORS allowlist.
9. **4-Gate Software Factory** workflow: stop at every gate; no implementation code until Gate 3 is approved.

---

## D. Decision record

| Decision | Rationale |
|---|---|
| D1. Capacitor 6 over Tauri v2 | Tauri requires Rust + a host Mac for development; Capacitor is TypeScript-only and integrates with the existing Next.js toolchain. Tauri also lacks first-class Next.js examples and a stable iOS pipeline (still maturing). |
| D2. Capacitor 6 over Expo / Solito | Rewriting UI in React Native primitives would discard 6+ months of design work (MobileFrame, BottomSheet, BottomNav, RTL, design system). |
| D3. Bundled-files mode over remote-URL mode | Bundled mode = full offline, instant first paint, no ATS constraint on the shell origin. Remote mode requires a public HTTPS origin AND loses offline anyway. |
| D4. iOS + Android in one plan | User asked for both; the codebase is identical. Plan reuses the same Capacitor config; per-platform differences handled in Gate 2. |
| D5. Defer code-signing steps to owner-action phase | User confirmed enrollment pending. Code work cannot be blocked on it; first `.ipa`/`.apk` build is the explicit handoff gate. |
| D6. Reuse existing PWA install UX scaffolded behind a `Capacitor.isNativePlatform()` gate | Don't delete the PWA flow — it's still needed for web users (and the install prompt inside Capacitor would actually pass review as "polish," not as a flaw). |
| D7. Replace web push with `@capacitor/push-notifications` | WKWebView has no Push API. Need native APNs/FCM. Server-side: extend subscription endpoint to accept native device tokens. |
| D8. Skip `@capacitor/sentry` for v1 | Native crash reporting is nice-to-have, not required for first submission. Browser Sentry catches webview crashes adequately. Owner can request later. |
| D9. App icon strategy: opaque for App Store / maskable / apple-touch, transparent only for in-app favicons | Reuse the fix from the prior turn's "best standard PWA" audit (UI standards skill §15). |
| D10. iOS bundle ID `com.koralink.app`, Android application ID `com.koralink.app` | Provisional. Owner confirms in Gate 1 (or before App Store Connect registration). |

---

## E. Open questions for Gate 1 (do not block Gate 0 approval, but answer before Gate 1 closes)

- **Q-OQ1.** Final bundle ID / application ID — `com.koralink.app` OK?
- **Q-OQ2.** App name on stores: "KoraLink" everywhere, or differentiate ("KoraLink — Football" / "كورالينك — كرة القدم")?
- **Q-OQ3.** Support URL — we don't have one today. Options: (a) `koralink.app/support` (need to deploy a static page), (b) `github.com/.../issues`, (c) a Typeform. (a) is the credible answer; gate it on owner approval.
- **Q-OQ4.** Privacy policy URL — same shape. PDP-Law (PDPL) compliance already in plans (`docs/plans/pdpl-hardening-31`, `run29-pdpl-delete-export`, `run30-pdpl-hard-purge`); the policy text should exist there. If not, owner owes it.
- **Q-OQ5.** Age rating — Saudi Arabia is the primary market; the questionnaire returns 4+ likely. Confirm or override.
- **Q-OQ6.** Push notifications: do you want first-launch ATT prompt or prompt-on-event?
- **Q-OQ7.** Initial geographic release: Saudi Arabia only, or GCC, or worldwide?
- **Q-OQ8.** App Store category — Sports? Social Networking? Games / Sports?

---

## F. Scope guardrails (what this plan explicitly is NOT)

| Out of scope | Why |
|---|---|
| Rewriting UI in React Native (Expo / Solito) | See D2. |
| Replacing the API | No backend changes needed for v1; subscription endpoint extension is the only backend touch. |
| Replacing the PWA | PWA continues to ship independently. Capacitor is an additional surface. |
| App Store optimization / ASO post-launch | Plan enables submission; ASO iteration is a separate workstream after launch. |
| In-app purchases / subscriptions | Not in the user's stated request. |
| Multi-language App Store metadata | EN + AR at first; other locales are incremental. |
| Tablet layouts | Capacitor ships the phone-width frame. Tablet is a separate design investigation. |

---

## G. Git / branch health

- `git status` clean (last commit in the `run56-pwa-lane` cycle, per `git log --oneline -1`).
- Working tree is build-green per the last `run57-api-lane` cycle's `turbo run build` outcome.

---

## H. Approval to proceed

Gate 0 asks the user to confirm:

1. **Scope:** Capacitor 6 wrapper, both stores, defer signing to owner-action phase. ✅
2. **Driver:** App Store credibility/SEO/ASO. ✅
3. **Open questions Q-OQ1…Q-OQ8** can be answered in Gate 1 or now — your call.
4. **Standing constraints C.1–C.9** are accepted.

Once approved, Gate 1 (`01-product.md`) writes the user stories, success criteria, and explicit per-story scope. **No code is written until Gate 3 is approved.**
