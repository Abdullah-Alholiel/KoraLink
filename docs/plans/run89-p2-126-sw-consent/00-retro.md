# Run #89 — Gate 0 Retro + ADMIN STATE CHECK (PWA lane, 89%4 = 1 → deviation noted)

**Date:** 2026-09-30T10:xxZ · **Branch:** staging @ 2564493 · tree clean · 0 behind / 0 ahead.

## ADMIN STATE CHECK
`git status --short apps/admin apps/api/src/modules/partner apps/api/src/modules/admin` → EMPTY (clean).
`systemctl --user is-active koralink-admin.service` → active. No admin items picked; not applicable further.

## Rotation note (recorded decision)
Runbook rotation says 89%4 = 1 (API modules). The API lane had NO startable item: the run-#88
Reviewer-A minor (scheduler trend counter) is un-boarded (would need a new row + owner-free scope,
but P2-125 just shipped that observability pattern — duplicate risk), and all API P1/P0 rows are
owner/P0-2-gated. PWA has: P1-54 (from run #88 Reviewer B) and P2-126 (explicitly queued "run #89
candidate" by runs #87+#88). Picking P2-126 per the queue; P1-54 verified first (below) and REFUTED.

## P1-54 REFUTED — premise stale (parent verification, evidence over vibes)
Claim (run #88 Reviewer B): "match-detail page has no realtime subscription; join/leave/POTM updates
only appear on refetch."
Evidence chain:
- `apps/player-pwa/src/app/[locale]/match/[id]/page.tsx:82` → `useMatch(id, currentUserId)`.
- `useMatch` = `apps/player-pwa/src/hooks/useMatches.ts:171-203` — connects the SHARED realtime
  client (`getRealtime()`, src/lib/realtime.ts:196), `rt.joinRoom('match', id)`, and invalidates
  `['match', id]` on `status-update` AND `roster-update` AND `pom-decided` (:184-196). Comment
  block: "Shared realtime client (Slice 2): ONE app-wide socket, ref-counted rooms."
- Server side emits to `match:<id>` from every mutation:
  `app.gateway.ts:713/734/740` (broadcastRosterUpdate/StatusUpdate/PomDecided) — call sites in
  matches.service.ts: join :1710, leave :1957, start :2602, complete :2724, cancel :2902,
  reschedule :3144, removePlayer :3331, waitlist promotion :3468, POTM :4013.
Conclusion: the detail page ALREADY live-updates rosters/counts/POTM through its hook. Reviewer B
read the page file (no direct socket lines) and missed the hook. **Nothing to build.** Board row
updated to REFUTED (run #89).

## Tech-debt snapshot (area to touch: SW update lifecycle)
- `next.config.mjs:28` `skipWaiting: true` → built sw.js runs unconditional `self.skipWaiting()`.
- `ServiceWorkerUpdater.tsx:41,58-66` posts `{type:'SKIP_WAITING'}` on ready+updatefound (auto-
  activate) and reloads on ANY `controllerchange` (:44-49) → mid-session hard reload = the P2-126
  form-loss complaint. ALSO reloads on FIRST-install claim (no prior controller) — an extra
  unrequested reload on first visit.
- Historical guard rails that MUST survive: P2-60 (registration owned here, failures captured
  scope `swRegister`); P2-40 (locale-aware offline navigation); NetworkOnly money/auth/wallet
  recipes; the no-stale-SW guarantee (a consented reload path must still exist).
- fix:feat ratio last 15 commits: 2 fix / 1 feat / 12 docs+chore — healthy.

## Gate 0 → Gate 1
Proceed: build P2-126 (consent-gated SW activation). Compact single design doc:
01-program-design.md. Gates 1-3 folded per autonomous mode.
