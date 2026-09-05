# Run #32 — Program Design (Gates 1–3 compact)

Single doc for the whole cycle (5 fixes, one commit batch per logical group).

## 1. Admin Docker image build-breaker (Reviewer B P1 + verified live)

**Before**: `apps/admin/Dockerfile` runner stage `COPY --from=builder /app/public ./public`
failed — `apps/admin/public/` does not exist (git ls-files empty; sync-standalone.mjs:33-37
explicitly tolerates a missing public/ in the systemd path, the Dockerfile copied its context
without its guard). A second, independent breaker: `src/lib/use-live-data.ts:4` imports
`socket.io-client`, which was NEVER declared in `apps/admin/package.json` (phantom dep —
resolves on the host via root-workspace hoisting, unresolvable inside the isolated image).
`apps/admin/package-lock.json` (standalone, committed by 841680f) had 0 socket.io entries.

**After**: (a) builder gains `RUN mkdir -p public` before the runner COPY (empty dir = COPY
succeeds; static assets flow through .next/standalone as today); (b)
`"socket.io-client": "^4.8.3"` added to admin package.json (version pinned to what PWA uses /
what the root lockfile resolves, 4.8.3) + standalone lockfile regenerated in an isolated dir
with npm 12 (`--package-lock-only --ignore-scripts`), verified 3 refs; (c) PWA Dockerfile
NEXT_PUBLIC_* comment corrected: build args are the ONLY delivery channel for client-bundle
constants — runtime env cannot reach compiled chunks.

**Live proof**: `docker build -f apps/admin/Dockerfile -t koralink-admin:run32-verify
apps/admin` → exit 0 (was: exit 1 at COPY / at webpack module-not-found).

## 2. Admin users API — PDPL ghost guards (Reviewer A MEDIUM #1+#2)

**Before**: `status=active` filter (`admin/users.service.ts:63-66`) matched deleted ghosts
(`banned_at IS NULL AND suspended…`); `update()` had no `deleted_at` guard — ban/unban/role
mutations on soft-deleted/purged accounts succeeded via direct API call.

**After**: `active` predicate = `deleted_at IS NULL AND banned_at IS NULL AND (suspended… )`;
`update()` throws `ConflictException` (409) BEFORE any write when `before.deleted_at` is set.
Default view unchanged (already excluded). `banned` filter unchanged (banned ghosts stay in
the banned view — deliberate: ops must see a ghost's ban history).

**Specs** (`users.pdpl-guard.spec.ts`, 4 cases): active-filter SQL pinned via
PgDialect.sqlToQuery (contains deleted_at IS NULL); banned-filter has NO deleted_at clause;
update-on-ghost → 409 with zero db writes; update-with-empty-dto on LIVE → still 400 (guard
does not shadow the existing no-changes path).

## 3. ServiceWorkerUpdater reg guard (Sentry KORALINK-WEB-8, 4 events)

`reg.waiting` → `reg?.waiting` (WebKit private-mode resolves `serviceWorker.ready`
non-standardly). No behavioral change on the happy path; the SKIP_WAITING postMessage is
belt-and-braces (sw.js already skipWaiting()s at install).

## 4. PromoBillboard reduced-motion re-arm (Reviewer A MINOR #5)

`goTo()` unconditionally re-armed the auto-advance interval — a reduced-motion user's first
swipe/dot-tap silently re-enabled rotation (mount effect returns early, goTo didn't check).
goTo now respects `prefers-reduced-motion` on every path. Existing 15/15 suite green.

## 5. PDPL grace-days drift trap (Reviewer A MINOR #4)

API single-source exists (acd27b4, `apps/api/src/common/constants/pdpl.ts`); clients can't
import across apps → named constants + sync pointers: `PDPL_GRACE_DAYS_CLIENT` (profile
page) and `PDPL_GRACE_DAYS_ADMIN` (admin users page), both with "mirror apps/api …
constants/pdpl.ts" comments.

## Gate 3 contract checklist
- [x] list() response shape `{users,total,page,perPage}` unchanged; only the active predicate tightened.
- [x] update() success path UNCHANGED (findOne populated + matchesPlayed/totalSpent); new failure = 409 Conflict with message (Nest format `{message, error, statusCode}`).
- [x] Admin UI already compensates (deleted badge + hidden actions, 1043293) — no UI change needed.
- [x] Docker: no image-shape change (server.js entry, standalone layout identical); admin image now BUILDS.
- [x] No i18n keys touched. No schema/migration changes (zero DB surface).
- [x] Observability: no new emit paths; 409s land in Pino/Sentry via the existing exception filter.
