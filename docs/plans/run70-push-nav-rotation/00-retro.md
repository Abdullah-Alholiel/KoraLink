# Run #70 — PWA Push UX cycle (compact gates, autonomous mode)

Run #70 (2026-09-23, cron 01:15Z slot). Rotation 70%4=2 → Admin lane — **ADMIN HOLD continues**
(projects-dir merge conflict UU users.service.ts / profile/page.tsx / ServiceWorkerUpdater /
PromoBillboard + staged admin edits, unchanged since run #63) → fell to PWA board order per
run #69 handoff. Reviewers A+B (glm-5.3-flash, zai, probe 200/2.7s) clean; claims of run #69
verified (P2-82/91/92 BUILT-AS-CLAIMED; notifications jest 47/47, push hook vitest 12/12,
structure 5/5 — parent re-run).

## Gate 0 — Retro (audit of the push surface this cycle touches)
- Run #69 closed P2-82/91/92; its Reviewer-B residual leads: notificationclick unconditional
  navigate (real UX risk), verb-map drift, locale-presence assertion.
- Reviewer A (run #70) sweep: standing bug classes CLEAN (no ::uuid, no eq(col,null), no
  console.* in API src, z-index compliant, i18n 977/977 leaves, hydration-safe).
- Convergent IMPORTANT (A #1 + B P1): worker `pushsubscriptionchange` re-upserts to the
  RELATIVE `/api/v1/notifications/subscribe` (worker/index.js:42). Same-origin VPS proxy:
  fine. Vercel prod (PWA kora-link-player-pwa.vercel.app, API koralink-api.onrender.com —
  no rewrite/proxy in next.config.mjs, fetcher uses absolute NEXT_PUBLIC_API_URL): resolves
  against the PWA origin → 404 → rotation silently never re-points → user misses pushes.
  Verified by parent: `grep rewrites next.config.mjs` → absent.
- Reviewer A IMPORTANT #2: SubscribeDto/UnsubscribeDto `endpoint` has @IsUrl but no length
  cap (DB col is text — no overflow, but unbounded garbage/DoS surface).
- Reviewer B P1 #2: stale-subscription UX invisible (90d sweep + swallowed rotation failures
  → server gone, toggle says ON) — boarded as backlog lead, NOT built this run (needs server
  re-validation endpoint choice; bigger than remaining budget with slice 1+2+3).
- Reviewer B P2s (permission primer, offline tap-through, unknown-type default route):
  recorded in run report; not boarded as new rows (PWA-push table is hot; next push cycle).

## Gates 1–3 — Program design (single compact doc)

### Slice 1 — P2-93 notificationclick guarded navigation (PWA)
- Problem: `client.navigate(url)` on the first found window is a HARD document navigation —
  wipes Zustand/React-Query in-memory state, scroll, and any in-progress user action (chat
  draft, form) just because a push was tapped; even re-focusing a window ALREADY on the
  target route reloads it.
- Behavior: (a) window already on the target path(+query) → focus ONLY; (b) other window →
  postMessage `{type:'kl-push-nav', url}` + focus; client listener does `router.push` (soft
  navigation — shared layout + module state survive); (c) no window → `openWindow(url)`
  (unchanged). Same-origin URL guard on both ends (`new URL(url, self.location.origin)`,
  reject cross-origin).
- Client listener: NEW `src/components/layout/PushNavHandler.tsx` (client component, mounted
  in `src/app/[locale]/layout.tsx`), `navigator.serviceWorker.addEventListener('message')`,
  validates `url` starts with `/` and passes `router.push(url)`.
- i18n: none (no user-facing copy).
- Tests: NEW `test/structure/push-notification-click.test.ts` (source tripwire: focus-only
  branch, postMessage branch, openWindow fallback, no unconditional navigate, kl-push-nav
  type present in both worker + handler, same-origin guard) + handler unit test with
  next/navigation mock.

### Slice 2 — Worker re-upsert carries the API base (+ VAPID) via the existing KV (PWA)
- Problem: relative `/api/v1/...` in the worker breaks cross-origin deployments (above).
- Fix: hook's `writePushLocaleKv` pattern gains sibling entries in the SAME
  `koralink-push-meta` cache: `/__kl/push-api-base` `{b: NEXT_PUBLIC_API_URL origin+path}`
  and `/__kl/push-vapid` `{k: VAPID_PUBLIC_KEY}` (kills Reviewer-A minor #3 duplication —
  the worker key always matches what the page used). Worker: `apiBase` read with fallback
  `''` (relative, current same-origin behavior); VAPID read with fallback to the existing
  constant (first rotation ever, before any page subscribe). Subscribe URL becomes
  `${apiBase}/api/v1/notifications/subscribe`.
- Tests: extend `test/structure/push-subscription-change.test.ts` (+2 cases: worker reads
  push-api-base + composes absolute URL; hook writes both new KV keys).

### Slice 3 — SubscribeDto/UnsubscribeDto endpoint length cap (API)
- `@Length(1, 512)` on `endpoint` in both DTOs (real FCM/Mozilla endpoints ≈120-180 chars).
- Tests: extend the existing DTO contract jest cases (+2: 513-char endpoint 400, 512 ok).

### Gate 3 contract checklist
- [x] No new endpoints; existing `POST /notifications/subscribe` shape unchanged → P2-82
      DTO still authoritative; only validation tightened (512 cap — all real endpoints pass).
- [x] No DB change → no migration → Phase 4.5 rule 1 not triggered.
- [x] Worker ↔ hook KV contract: names/values co-defined (locale pre-existing; api-base +
      vapid new); fallbacks keep old behavior when KV absent (same-origin deploys unchanged).
- [x] i18n: zero new keys (slice 1 has no copy; parity stays 977/977).
- [x] Frontend types: `PushSubscribeOutcome` untouched; PushNavHandler adds no store state.
- [x] Observability: notificationclick client-handler failures keep the focused window (no
      new silent-failure surface); worker remains swallow-by-design for rotation (P2-72).

## Gate 4 slices
1. `feat(pwa): notification tap focuses instead of hard-reloading your tab` — slices 1
   (+structure/unit tests) → gates → commit.
2. `feat(pwa): push rotation re-points to the right API origin` — slice 2 (+tests) → gates
   → commit.
3. `fix(api): cap push endpoint URL length` — slice 3 (+jest) → gates → commit.
