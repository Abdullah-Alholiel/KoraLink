# Run #32 — Cycle: Post-deploy hardening (docker + admin users API + PWA billboards)

## Gate 0 — Retrospective (what changed since run #31)

Commits since last run (2026-09-04T03:00Z → 15:15Z):
- `1043293` P1-37 admin purge visibility (Abdullah landed his in-flight work — ADMIN HOLD lifted)
- `841680f` Docker/Coolify deploy; `30f0054` API CMD fix; `1b0150c` feed billboard swipe
- Run #31 PDPL hardening (d96684b…acd27b4) verified 13/13 by Reviewer B this run (jest 28/28 re-run live).

Findings at Gate 0 (evidence-cited, from Reviewers A+B + Sentry triage + self):
1. **CRITICAL (build-breaking, docker only)** — `apps/admin/Dockerfile:35` COPYs `/app/public`
   but `apps/admin/public/` does not exist (git ls-files empty). Any `docker build apps/admin`
   fails at the runner stage. Prod systemd path unaffected (sync-standalone.mjs tolerates it).
2. **HIGH (API semantics)** — `admin/users.service.ts:63-66` `status=active` filter does not
   exclude soft-deleted users → deleted ghosts counted/displayed as "active".
3. **HIGH (API guard)** — `admin/users.service.ts:124+` `update()` has no deleted_at guard →
   ban/unban/role-change on a soft-deleted/purged ghost succeeds via direct API call
   (UI hides the buttons; API doesn't enforce).
4. **MEDIUM (drift trap)** — PDPL grace "30" hardcoded client-side in 2 spots:
   player-pwa profile/page.tsx:639 + admin users/page.tsx purgeInfo (acd27b4 single-sourced
   API-side only).
5. **MINOR (Sentry KORALINK-WEB-8, 4 events)** — `ServiceWorkerUpdater.tsx:36` `reg.waiting`
   deref when reg undefined (WebKit private-mode).
6. **MINOR** — PromoBillboard `goTo()` unconditionally re-arms auto-advance → reduced-motion
   users get rotation back after first interaction (effect :86 returns early, goTo :73-79 doesn't).
7. **MEDIUM (deploy footgun)** — PWA Dockerfile:8 comment claims NEXT_PUBLIC_* is supplied at
   runtime — false, compile-time only. Comment fix + admin guard.
8. **Board bookkeeping** — Reviewer B REFUTED run #31's "match-detail lobby not realtime" P1:
   useMatch already subscribes+invalidates on roster-update/status-update/pom-decided
   (useMatches.ts:168-191); only `user-joined` (gateway:220) has no PWA listener (redundant
   with roster-update). Card never created → drop the claim, no build.
9. Sentry triage: API-Z `mp.joined_at` (3 events, last 09-03 10:49) = stale-dist window
   BEFORE run #31's restart; fix a17755a predates events; 0 events in 28h since; dist clean.
   WEB-6 viewport-diagnostic:standalone = PWA's own probe instrumentation (13× today,
   diagnostic channel, not a product error). WEB-8 → fixed this run.

ADMIN STATE CHECK: tree CLEAN through 1043293 (owner committed). Hold lifted. This cycle's
admin edits are surgical (users.service guard + spec) per §3.5 re-check at commit time.

Fix:feat ratio: heavy fix cycle — justified: deploy blocker + API guards.

## Gates 1-3 (compact)

**Problem**: the new Docker deploy path cannot build the admin image; admin users API treats
PDPL-deleted ghosts as live accounts for filtering AND mutation; minor PWA/UX defects from
today's commits.

**User story**: as Abdullah deploying via Coolify, the admin image builds. As an admin, the
"active" filter never shows deleted ghosts, and moderation mutations on ghosts 409.

**Scope IN**: admin Dockerfile public guard (+ PWA same guard + comment fix); admin users API
active-filter + deleted_at update-guard + specs; ServiceWorkerUpdater reg guard;
PromoBillboard reduced-motion re-arm; named grace-day constants (PWA + admin) with pointer
comments.
**Scope OUT**: P1-37 cancel-purge action (boarded as P2-47, needs owner UX call);
drizzle-orm 0.45.2; CSP nonce; P2-7 offline queue (parked).

**Contracts (Gate 3 checklist)**:
- [x] update() on deleted user → 409 `{message: 'User is deleted…'}` BEFORE any moderation
      write; existing 200-shape unchanged (findOne populated + matchesPlayed/totalSpent).
- [x] list() `status=active` now `deleted_at IS NULL AND banned_at IS NULL AND (suspended…)`;
      shape `{users,total,page,perPage}` unchanged.
- [x] Admin UI: no change needed (badge already renders deleted state; buttons hidden for
      deleted rows — UI compensates, API now matches).
- [x] Dockerfiles: admin runner COPY succeeds with empty public (mkdir -p in builder);
      PWA identical guard; no image-shape change (server.js entry unchanged).
- [x] No i18n keys added (errors are API-level English strings, consistent with existing
      admin API error style).
