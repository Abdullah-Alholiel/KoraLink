# Run #93 — Program Design (Gates 1-3 compact)

## Item 1 — P2-135 completion: freshness poll for the bell-sheet notifications hook

**Problem (user story):** A player opens the notification bell after sitting on another tab. The sheet reads `['notifications']` cache via `useNotificationsFeed` (staleTime 30s, no refetchInterval) — items that arrived while the tab sat idle (follows, POTM votes, joins) appear only after an unfocus/refocus or navigation. The home-page notification list already polls (PR #58); the bell-sheet hook does not.

**Scope:**
- IN: add `listRefetchInterval` to `useNotificationsFeed`'s main list query (`useNotificationsFeed.ts:14-20`); 2 hook tests pinning the 45s poll + the no-stacking-behind-in-flight invariant (same harness as `test/hooks/useFeed.test.tsx`).
- OUT: `useUnreadNotificationCount` (already refreshes on window focus + WS `badge-sync` invalidation via NotificationProvider — a poll would fight the event path); mutations (invalidate on success already).

**Contract (no API change):** same endpoint `/users/me/notifications`, same `['notifications']` key, same response shape `{items,total,hasMore}`. Behavior-only change: background refresh every 45s while visible+idle, paused while a fetch is in flight, single-page so page-1 guard passes trivially (pageParam 0).

**i18n:** none (no new strings).

## Item 2 — Reviewer-A hardening: admin listSlots forwards the real adminId

**Problem:** `apps/api/src/modules/admin/pitches.service.ts:158` calls `this.partner.listSlots('', 'Admin', id, from, to)` with an empty-string ownerId sentinel. Today the Admin branch (`partner.service.ts:70/74/84`) makes ownerId moot, so behavior is correct — but the sentinel is a trap: any future call path that reaches `listSlots` with a non-Admin role and `''` silently queries `owner_id = ''` (zero rows, looks like an empty schedule). Defense-in-depth: pass the actual admin id.

**Contract (internal signature change only, no HTTP change):**
- `AdminPitchesService.listSlots(id, from, to)` → `listSlots(id, from, to, adminId)`; controller (`pitches.controller.ts:32-38`) extracts `adminId` from the JWT exactly like its sibling routes (`:47,:57,:63` — `(req as unknown as { user: { sub: string } }).user.sub`).
- `partner.listSlots` signature unchanged (`actorId` already first param — it was designed for this).
- New spec `apps/api/src/modules/admin/pitches.list-slots.spec.ts`: (1) forwards the authenticated adminId (NOT '') to PartnerService; (2) same actorId+role pair the partner controller passes for VenueOwner (symmetry pin); (3) 404 guard still delegates to partner.assertPitchAccess for a missing pitch.

**i18n:** none. **Observability:** none (read path, no new error class).

## Gate 3 contract verification checklist
- [x] No mutation endpoints touched (both items are read-path/behavior-only) — mutation findOne contract unaffected.
- [x] No frontend API-shape change: `NotificationsFeedResponse` unchanged; consumers (NotificationSheet, BadgeHydrator) untouched.
- [x] Adapter functions: none affected (no new API shapes).
- [x] No field silently undefined: no response fields added/removed.
- [x] i18n keys: zero new user-facing strings (verified: no new literals in the diffs).
