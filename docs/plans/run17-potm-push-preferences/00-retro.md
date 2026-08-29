# Run #17 — POTM push preferences — Gate 0 Retrospective

**Area audited:** `apps/api/src/modules/notifications/notifications.service.ts` (push delivery paths),
recent commits 4e7ad44 / 6171bd4 / cda3833 (run #16), Reviewer A/B findings this run.

## What triggered this cycle
Reviewer A (glm-5.3, run #17) found two IMPORTANT defects, both verified by direct read:

1. **POTM pushes bypass per-user delivery preferences (P1-20 regression class).**
   `sendPomDecidedNotification` (:226-259) iterates `getMatchSubscriptions` (raw SQL join of
   `match_players` + `push_subscriptions`) and sends unconditionally — no `push_muted` skip, no
   quiet-hours check. Every other push path routes through `sendPushToUsers` (:157-219), which
   enforces both. A user who muted pushes or set a 23→07 quiet window still receives the
   "🏆 Player of the Match" blast at 3am Riyadh time once VAPID keys land in prod.
   Evidence: notifications.service.ts:243-257 (no preference checks) vs :184-192 (enforced).
2. **`getMatchSubscriptions` hides the driver result shape** — `result as unknown as Array<...>`
   (:115) on a postgres-js `execute()` result (RowList — iterable, so not a live break, but the
   cast would fail loudly under a driver swap and defeats type safety).

## Connective findings (same audit)
- No VAPID keys in `apps/api/.env` → `vapidConfigured=false`, all pushes no-op on this box
  today. The bypass is latent, not user-visible yet — exactly the cheap time to fix it.
- `winnerId` in the POTM push `data` is consumed by nothing on the PWA (worker deep-links off
  `type` + `matchId` only; WS payload carries the winner object separately and is untouched).
- POTM raw body omitted `locale` → SW defaulted deep-links to `en` for all subscribers
  (P1-5 gap, same line of code).

## Tech-debt posture of recent commits
fix:feat ratio healthy (run #16 was 3 feat + docs). No contract breaks found by either
reviewer in run #16's commits — Reviewer B verdict: BUILT-AS-CLAIMED on all three.

## Decision
Merge this with boarded **P2-23** (reporter closure — also a "notification never sent"
class item) under one cycle: P2-27 (POTM prefs) is the small anchor; P2-23 stays a
separate build item. Proceed to Gate 1.
