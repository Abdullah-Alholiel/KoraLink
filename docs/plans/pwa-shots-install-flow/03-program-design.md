# Gate 3 — Program Design (CONTRACTS): shots.so-style install landing + PWA activation

Binding contract gate. Every shape below is the exact interface — no drift.
Corrections from self-review are folded in (marked **Δ vs Gate 2** where they supersede).

## 1. `usePwaInstall()` — extended hook contract

```ts
interface UsePwaInstallReturn {
  canInstall: boolean;          // captured beforeinstallprompt (Chromium)
  isStandalone: boolean;        // display-mode: standalone OR navigator.standalone
  isIos: boolean;               // UA-based iOS detection (existing)
  shouldShowBanner: boolean;    // existing 7d cooldown logic — UNCHANGED
  shouldShowLanding: boolean;   // NEW: !isStandalone && landing-flag < 30d old
  shouldShowWelcome: boolean;   // NEW: isStandalone && welcome flag absent (see §1.2)
  promptInstall(): Promise<boolean>; // accepted=true (existing behavior)
  dismiss(): void;              // existing banner dismiss (7d) — UNCHANGED
  dismissLanding(): void;       // NEW: write koralink.install-landing-dismissed-at
  markWelcomeSeen(): void;      // NEW: write koralink.pwa-welcome-seen
}
```

**New internal state (exact keys):**
- `LANDING_DISMISS_KEY = 'koralink.install-landing-dismissed-at'` — 30d TTL, independent
  of the banner's `koralink.install-banner-dismissed-at` (7d, unchanged).
- `WELCOME_SEEN_KEY = 'koralink.pwa-welcome-seen'` — no TTL (once, forever).

**Installed re-detect (post-install handoff):** `visibilitychange` + `focus` listeners
re-evaluate `matchMedia('(display-mode: standalone)')`; when a user accepts the native
dialog and returns to the tab, `isStandalone` flips true → guard swaps landing→app with
a spring fade. No reload.

**`appinstalled` handler (extended):** (a) track `pwa_install_accepted` (existing);
(b) remove `WELCOME_SEEN_KEY` so the FIRST standalone launch after install shows the
checkpoint exactly once.

### §1.2 Returning-standalone-user gate (Δ vs Gate 2)

`shouldShowWelcome` must NOT fire for users who are already regular standalone users
(upgrade installs, or users who re-open after install). Gate:

```
shouldShowWelcome =
  isStandalone
  && !localStorage.has(koralink.pwa-welcome-seen)      // never seen before
  && !localStorage.has(koralink.pwa-seen-app-before)   // not a returning user
```

`koralink.pwa-seen-app-before` is written by `markWelcomeSeen()` TOGETHER WITH the
welcome key (so completing the checkpoint satisfies both gates in one write), and ALSO
by any successful in-app navigation after 10s of standalone usage (safety net for users
who dismiss the checkpoint by closing the app before tapping CTA — next launch is a
returning user, no nag). Implementation: `WelcomeCheckpoint` mounts → after 10s in
standalone, write `koralink.pwa-seen-app-before` regardless of CTA interaction.

## 2. `InstallLandingGuard` (client, mounted in `[locale]/layout.tsx`)

```ts
function InstallLandingGuard({ children }: { children: ReactNode }): JSX.Element;
```

- Three states: `checking` → `landing` | `app`.
- **`checking` (pre-effect, first paint): renders `children` with `aria-busy="true"`.**
  The app shell (light bg, brand fonts preloaded) IS the first paint — no flash, no
  branded splash in the DOM tree (manifest background_color handles the real splash at
  boot). Δ vs Gate 2 (removed the inline head-script idea — `checking` is a single
  synchronous effect tick; the landing mounts only after the effect, so there is no
  standalone-mismatch window worth a head script).
- `landing` state renders `<InstallLanding />` as a **full-viewport overlay
  (`fixed inset-0 z-[80]`)** OVER the shell. **Children stay mounted** — the provider
  stack (`IntlClientProvider`, `QueryProvider`, `LocationProvider`, `AuthBootstrap`,
  `ServiceWorkerUpdater`, `ChunkLoadErrorHandler`) lives in the same layout tree and
  must survive (post-install handoff = overlay unmount, no reload). The shell behind
  the overlay must not run user-visible network churn — acceptable: React Query
  refetches on overlay unmount; feed data is 60s-stale-tolerant (staleTime).
- Overlay unmount = `ctaContinue` tap or installed re-detect flip.

### Guard decision table

| Condition | Render |
|-----------|--------|
| `isStandalone` (any locale) | app (children) — NEVER the landing |
| landing flag < 30d old | app (children) |
| otherwise | landing overlay |

## 3. `InstallLanding` CTA matrix (platform-adaptive)

| Platform state | Primary CTA | Behavior |
|----------------|-------------|----------|
| `canInstall` (Chromium desktop/Android) | `ctaChromium` "Add to Home Screen" | `promptInstall()`; accepted → guard handoff; dismissed → inline `notNowNote` + `dismissLanding()` (30d) |
| `isIos && !canInstall` (iOS Safari) | `ctaContinue` "Continue to the web app" | cheat-sheet step cards ABOVE the CTA; two steps with OS glyphs |
| neither (Firefox, in-app webviews, desktop Safari) | `ctaContinue` | value pitch only; no fake install promise |

`ctaContinue` ALWAYS renders (bypass is guaranteed on every platform state).

## 4. `WelcomeCheckpoint` contract

```ts
function WelcomeCheckpoint(): JSX.Element | null; // null unless shouldShowWelcome
```
- `<Portal>` full-screen overlay `fixed inset-0 z-[80]` (portal mounts to body —
  BottomSheet iOS rule: never anchored to an ancestor with transforms).
- "Let's play" CTA → `markWelcomeSeen()` (writes BOTH keys per §1.2) → unmount with
  spring fade. 10s safety-net timer writes `koralink.pwa-seen-app-before` regardless.
- Mounted in `(main)/layout.tsx` only (never on auth pages).

## 5. Manifest contract (final, asserted verbatim in Gate 4 §6)

```json
{
  "id": "/",
  "name": "KoraLink — Football Match Hub",
  "short_name": "KoraLink",
  "description": "Find, join, and host football matches across Saudi Arabia. Live availability, wallet payments, POTM voting.",
  "start_url": "/",
  "scope": "/",
  "display": "standalone",
  "display_override": ["standalone", "minimal-ui"],
  "orientation": "portrait-primary",
  "background_color": "#254132",
  "theme_color": "#254132",
  "dir": "rtl",
  "lang": "ar",
  "icons": [ 4 entries — 192/512 any + 192/512 maskable, paths unchanged ],
  "screenshots": [
    { "src": "/screenshots/wide.png", "sizes": "1440x900", "type": "image/png", "form_factor": "wide",  "label": { "en": "Discover matches near you", "ar": "اكتشف المباريات القريبة منك" } },
    { "src": "/screenshots/narrow.png", "sizes": "800x1200", "type": "image/png", "form_factor": "narrow", "label": { "en": "Play feed with live availability", "ar": "ملعب المباريات مع التوفر المباشر" } }
  ],
  "categories": ["sports"],
  "prefer_related_applications": false
}
```

Note: `name_localized` is NOT a spec field — dropped. `window-controls-overlay` NOT in
display_override (mobile-first, descoped). Screenshot labels are flat `en`/`ar` objects
(Chrome renders the value; no spec violation — labels are informational strings).

## 6. i18n contract — exact keys (ar + en, BOTH files)

Namespace `pwa.installLanding` — **19 FLAT keys** (no nested objects/arrays):

| Key | en | ar |
|-----|----|----|
| `kicker` | INSTALL KORALINK | ثبّت كورالينك |
| `title` | KoraLink, right on your home screen | كورالينك على شاشة جهازك مباشرة |
| `subtitle` | One tap from your home screen — full-screen, no browser bars, offline-ready. | نقرة واحدة من شاشتك الرئيسية — ملء الشاشة بدون أشرطة المتصفح، جاهز للعمل بدون إنترنت. |
| `benefitOne` | Live match availability, even on the move | توفر المباريات المباشر حتى أثناء التنقل |
| `benefitTwo` | Wallet payments and POTM voting in one tap | المحفظة وتصويت رجل المباراة بنقرة واحدة |
| `benefitThree` | Works offline — your games are saved on-device | يعمل بدون إنترنت — ألعابك محفوظة على جهازك |
| `ctaChromium` | Add to Home Screen | أضف إلى الشاشة الرئيسية |
| `ctaContinue` | Continue to the web app | المتابعة إلى التطبيق |
| `iosStepOne` | 1 | ١ |
| `iosStepOneLabel` | Open this page in Safari | افتح هذه الصفحة في سفاري |
| `iosStepTwo` | 2 | ٢ |
| `iosStepTwoLabel` | Tap Share, then Add to Home Screen | اضغط مشاركة، ثم أضف إلى الشاشة الرئيسية |
| `notNow` | Not now | ليس الآن |
| `notNowNote` | You can add it later — the web app stays one tap away | يمكنك إضافته لاحقًا — التطبيق على الويب على بعد نقرة واحدة دائمًا |
| `alreadyInstalled` | You're all set — the app is installed on this device | كل شيء جاهز — التطبيق مثبت على هذا الجهاز |
| `heroBadge` | PWA | تطبيق ويب |
| `heroBadgeLabel` | Installable app | تطبيق قابل للتثبيت |
| `iosShareHint` | Safari Share button | زر المشاركة في سفاري |
| `iosAddHint` | Add to Home Screen | أضف إلى الشاشة الرئيسية |

Namespace `pwa.welcome` — **3 FLAT keys**:

| Key | en | ar |
|-----|----|----|
| `title` | You're all set | كل شيء جاهز |
| `subtitle` | KoraLink is now on your home screen. See you on the pitch. | كورالينك الآن على شاشتك الرئيسية. نراك على الملعب. |
| `cta` | Let's play | هيا نلعب |

Existing `pwa.install` namespace: UNCHANGED (banner keeps its keys).

## 7. PostHog event contract (via `trackEvent`)

| Event | Trigger | Properties |
|-------|---------|------------|
| `pwa_install_landing_shown` | landing overlay mounts (guard passed) | `platform`: chromium/ios/other, `locale` |
| `pwa_install_landing_cta_clicked` | CTA tap | `platform`, `locale`, `cta`: install/continue |
| `pwa_install_prompt_result` | userChoice outcome (existing) | `outcome` |
| `pwa_install_accepted` | appinstalled (existing) | `platform` |
| `pwa_install_dismissed` | landing "Not now" (EXTENDED from banner-only) | `surface`: landing/banner |
| `pwa_standalone_first_launch` | welcome checkpoint mounts | `locale` |

## 8. Motion contract (shots.so feel, zero new deps)

- One new keyframe `@keyframes koralink-spring-in` (translateY(12px) scale(0.97) →
  identity with overshoot curve) + class `animate-spring-in` — transform+opacity ONLY
  (GPU-safe). Landing overlay and welcome checkpoint use it.
- Press feedback: existing `active:scale-[0.98]` on all landing CTAs.
- No Framer Motion dependency (Δ vs Gate 1 assumption; spring curve via CSS cubic-bezier
  overshoot — `(0.175, 0.885, 0.32, 1.15)` — one token, used twice).

## 9. Contract verification checklist (Gate 3 exit — all ✓ before Gate 4)

- [✓ planned] Hook return type extended exactly per §1 (typed in the hook file).
- [✓ planned] Guard decision table matches §2 (standalone / flag<30d / landing).
- [✓ planned] CTA matrix §3 implemented exactly (chromium/ios/other).
- [✓ planned] Welcome gate §1.2 (both keys, 10s safety net).
- [✓ planned] Manifest JSON = §5 byte-for-byte on the built artifact.
- [✓ planned] i18n: 19 + 3 flat keys in BOTH ar.json and en.json.
- [✓ planned] 6 PostHog events with exact property names.
- [✓ planned] One spring keyframe, transform+opacity only.
- [✓ planned] NO `git add -A` — stage only `apps/player-pwa/**` +
  `docs/plans/pwa-shots-install-flow/**` (+ regenerated `public/sw.js` siblings).

## 10. Δ summary (supersedes Gate 2 where conflicting)

1. Landing = full-viewport OVERLAY over the shell (children stay mounted; providers
   survive) — not a route replacement, not a children-swap.
2. Custom CacheFirst shell SW route: **DESCOPED** — next-pwa precache + locale-aware
   offline fallback (P2-40, 175df30) already serve documents offline; no new route.
3. Inline head-script standalone pre-check: removed (checking-state is one effect tick;
   manifest background_color covers boot splash).
4. `name_localized` dropped (not a spec field). Categories → ["sports"].
5. Welcome gated on returning-user marker (§1.2) — not just standalone+flag.
