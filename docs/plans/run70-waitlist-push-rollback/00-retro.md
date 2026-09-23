# Run #70 — Gate 0 Retrospective (waitlist-push + subscribe-rollback cycle)

**Context:** this session RESUMED the 01:15Z fire (OOM-killed, lock pid dead). Adopted its
2 committed slices (P2-93 notificationclick soft-nav `c767696`, P2-94-equivalent push-rotation
API-origin re-point `72fc2f0`) + its half-gated DTO 512-cap slice (finished, off-by-7 test
arithmetic fixed, committed `e721823`). Gates re-run parent-side before adoption: turbo 3/3
(concurrency=1), notifications jest 49/49, api tsc 0, PWA vitest 668/668.

## Area audit (push/notifications + waitlist)

- Run #69/#70 commits touched: worker/index.js (notificationclick, pushsubscriptionchange,
  KV meta), usePushNotifications.ts, notifications DTOs. No migrations in flight. Tree clean
  except this run's intentional edits.
- Reviewers (zai glm-5.3-flash, 166s+407s, clean):
  - **Reviewer A (code quality):** no CRITICAL. IMPORTANT: (1) subscribe() sets UI subscribed
    BEFORE the server POST → POST failure leaves toggle ON with zero server row ("Nothing was
    changed" toast + silent push loss); (2) VAPID key duplicated in worker + hook; (3) worker
    locale fallback 'ar' vs controller default 'en' inconsistency; (4) notificationclick
    returns on first focusable client — postMessage to a non-React window is dropped.
  - **Reviewer B (gaps + verification):** all 3 run-#69 claims VERIFIED ✓ (P2-82 49/49,
    P2-91 outcome+parity, P2-92 7/7). P1 gaps: **waitlist_promoted never sends a push**
    (waitlist.service.ts:333-347 records activity+WS only; push-text.ts:180 key has no
    caller) — an offline promoted player never learns they're in; admin-ops verbs
    (suspended/wallet_refunded/dispute_resolved/no_show_marked) are activity-only (bigger
    surface, partly money/P0-2-adjacent → boarded, not built this run); match_starting_soon
    reuses data.type 'match-chat' → tag collision renotify-replaces chat notifications.
- Fix:feat ratio healthy; no console.* in API; i18n parity intact (reviewer re-checked the
  run-#69 keys).

## ADMIN STATE CHECK

Rotation 70%4=2 = Admin lane, but the projects-dir lane carries Abdullah's in-flight edits
(users/profile/conversations services + controllers, admin users page, seed.ts, Dockerfiles)
→ **ADMIN HOLD continues** (same rule as runs #55/#69). No admin/partner-module items picked;
fall-through to the PWA/API push lane per the run directive.

## Decision

Build (smallest-first, no owner dependency):
1. **P2-95** — waitlist promotion push: API notifyPromotion calls sendPushToUsers with the
   existing waitlist_promoted catalog key; worker routes `waitlist-promoted` to the match;
   rename match_starting_soon payload type off 'match-chat' (tag collision) + worker branch.
2. **P2-96** — subscribe() server-POST failure rolls the browser subscription back
   (unsubscribe + state reset + 'error'), so the toggle never lies.
3. Reviewer-A locale alignment: push subscribe defaults 'ar' end-to-end (controller + service
   trailing default), worker already 'ar' (P2-72 Arabic-first).

Boarded (NOT built): admin-ops verb push surface (P1, needs owner scoping), report-resolved
matchId carry-through + badge/setAppBadge (P2 backlog), VAPID single-source (P2, needs a
shared-module decision — worker prepends verbatim, so a shared import needs build wiring).
