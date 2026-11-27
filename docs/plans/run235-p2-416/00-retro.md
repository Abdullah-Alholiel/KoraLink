# Run #235 — P2-416 Push re-subscribe identity re-bind (compact gates)

## Gate 0 — Retro (DB & Infra lane, run 235 % 4 = 3)

- Reviewers A+B (glm-5.3-flash, zai probe 200): **0 CRITICAL / 0 IMPORTANT**. Migrations 0059–0061
  verified correct (fresh-apply-safe enum/predicate ordering; schema↔SQL parity). Standing bug-class
  sweep: 0 hits (::uuid casts, eq(col,null), unescaped ILIKE, console.* in API, missing status predicates).
- Hex audit: CLEAN at baseline (355/27/1, all metrics ok) — no new import-arrow violations.
- Journal tripwire: 8/8 green (run start).
- Sentry 24h: KORALINK-API-1C count=101 (Neon quota, last 00:00Z today) — owner-gated (Coolify cutover).
  KORALINK-API-1F (19 events, push sweep delete) = SAME quota root cause (stack: sweepStaleSubscriptions
  → PostgresError quota). Deduped into the existing blocker; sweep code itself verified correct.
- Reviewer B premises refuted by parent code read (claims≠facts): storage "silent-default S3 config" —
  the P2-385 fix is present (endpointExplicit + venuesConfigured requires explicit endpoint+creds+bucket;
  boot-throw deliberately avoided after the 2026-11-18 Render deploy-crash). Push-sweep/wallet-reconcile/
  venue-image "gaps" all already exist.
- Parent-discovered REAL defect (upgrades Reviewer B run #234 hint): push re-subscribe upsert omits
  user_id in the conflict set → cross-account row binding on shared devices (PR #149 class). logout()
  never unsubscribes (profile sign-out: token + cache purge only), so the exposure persists across
  account switches; the P2-43 sweep keys on updated_at, and the conflict-path touch refreshes it —
  stale row survives the sweep indefinitely.

## Gates 1–3 — compact program design

- Problem: device re-registration under account B must transfer the push_subscriptions row to B.
- User story: as a player sharing a device, I receive MY notifications after I enable push; the
  previous account's notifications stop on this device.
- Scope: IN — one-line conflict-set addition + regression spec. OUT — logout-time unsubscribe sweep
  (bigger surface: SW lifecycle + server bulk delete; board follow-up noted), PWA/admin changes, schema
  changes, migrations.
- Contract: `subscribe(userId, sub, userAgent?, locale?)` keeps returning `{ subscribed: true }`;
  upsert target stays `[push_subscriptions.endpoint]`; conflict set = existing fields + `user_id: userId`.
- i18n: none (API-only).
- Gate 3 checklist: mutation shape unchanged ✓; no frontend consumption of the changed internals ✓;
  no new API shape ✓; no i18n keys needed ✓; test pins the exact set payload (user_id present).

## Gate 4 — slices

1. Lane (zeroshot, Claude) authors the fix + spec in the isolated worktree; parent reconciles.
2. Parent re-applies to a real-install tree and runs REAL gates: turbo --concurrency=1, notifications
   jest, journal tripwire; PWA vitest as the full-suite check on the merged tree.
3. PR lane/run235-p2-416 → staging; triage PR-Agent; squash-merge on green; API rebuilt + restarted.

## Decisions (autonomous)

- subscriptionType "max" (not "pro") accepted for the lane precondition — functional superset, lane
  proven on this subscription in runs #232–#234; recorded here per the runbook's record-decision rule.
- Launch-first line: F2/F7-rest/F8/F10 remain owner-gated (Coolify A2–A5 session, webhook URL, post-A6)
  → none buildable; this run builds the next best security-adjacent item per pick order
  (security/data-integrity > broken flow > missing functionality > polish).
