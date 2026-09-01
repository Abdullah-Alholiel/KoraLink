# Gate 0 — Retrospective: run #24 cycle (P2-8 push-text localization)

**Date:** 2026-09-01 · **Run:** #24 · **Mode:** autonomous · **Item:** P2-8 (+ reviewer fan-out finding)

## Area audit (notifications/push path)

- **Premise re-verified against live code** (board row written against run #13 line numbers — both drifted):
  - `sendPomDecidedNotification` now routes through `sendPushToUsers` (run #17, b12d13e) but still
    hardcodes English text at `notifications.service.ts:236-239` (`'🏆 Player of the Match'`).
  - Match-start reminder hardcoded at `matches.service.ts:272-273` (`'⏰ Match starting soon'` +
    `toLocaleTimeString('en-GB')`) — was :255-260 on the board row.
  - Reviewer A (run #24, glm-5.3) enumerated ALL composition sites: matches.service.ts :272/:375/:484/:1120/:1969/:2251,
    notifications.service.ts:236, admin/reports.service.ts:137. **8 localizable sites** (the 2 DM/chat paths are
    locale-neutral by design — sender name + raw message text).
- **Infrastructure already in place (this is a text-only gap, not a plumbing gap):**
  - `push_subscriptions.locale` stored per subscription (migration 0016, P1-5).
  - PWA sends the active UI locale at subscribe: `usePushNotifications.ts:70` with `useLocale()` (profile/page.tsx:105).
  - `sendPushToUsers` already selects `sub.locale` and injects it into `data` for deep-links (:163, :188-191).
  - SW reads `data.locale` for routing (worker/index.js:68).
- **Live DB:** `push_subscriptions` = 0 rows (dev box) → no backfill needed; every future subscription gets localized text.
- **Adjacent debt found by Reviewer A (this run):** push fan-out is a sequential `await` for-loop
  (notifications.service.ts:177-210) — one slow push endpoint stalls every remaining push for all callers.
  Fold into this cycle (same 20-line window, independent behavior).

## Tech debt / contracts check

- fix:feat ratio in last 10 commits: 2 fix / 5 feat / 3 docs — healthy (<1.5:1).
- Standing bug-class sweep (Reviewer A): 0 `::uuid`, 0 `eq(col,null)`, WS authz clean, z-index clean,
  i18n parity 685/685, mutations return populated `findOne` outside tx. No CRITICAL findings.
- Sibling risk: `apps/admin` + partner surface CLEAN at preflight (admin state check 10:2xZ) — but this cycle
  touches only `apps/api` + `worker/index.js`, zero admin surface.
- Refuted-for-record: Reviewer B's "no Web Push" (runs #22/#23 refutations stand — worker/index.js ships push).

## Gate 0 → Gate 1

Proceed: text-localization + fan-out parallelization, vertical slice in ONE commit family
(catalog → dispatch → call sites → SW dir → tests). No DB migration (locale column exists; zero rows live).
