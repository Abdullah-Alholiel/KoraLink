# Run #103 — Cycle: p2-88-snapshot-chain-rebuild

## Gate 0 — Retrospective (compact)

**Scope audited:** DB/Infra lane (run #103 %4 = 3) — `apps/api/drizzle/` meta
chain, `scripts/migrate-vps.mjs`, recent merges 92639cc (#79) + 749b915 (#80).

**Ledger check (kanban/DECISIONS.md read first):** no design/UX claims touched
this cycle. P2-147 (CSV full-set default) NOT built — registered 2026-10-04,
48h veto window elapses ~2026-10-06; register rule outranks the runbook hint.
No new defaults proposed this run; no veto clocks started.

**Previous-run verification (run #102 claims → facts):**
- P2-146 CSV guard: VERIFIED — identical `FORMULA_PREFIX` regex in
  `apps/admin/src/lib/csv-export.ts:34` + `apps/player-pwa/src/lib/wallet-csv.ts:24-36`,
  quote-doubling both sides, cross-app contract test present. Count correction:
  the contract suite is 5 it()/17 expect(), not "29 assertions" as reported.
- P2-143 ops-feed status: VERIFIED — `OpsSocketStatus` machine at
  `ops-realtime.ts:20`, getStatus/onStatus/reconnect present,
  `NotificationCenter.tsx` strips at :210/:215/:223/:241 (all four states
  incl. offline — Reviewer B initially misread this as missing; refuted by
  direct read), i18n 5 keys EN+AR parity 656/656. Admin dist carries
  `reconnect_failed` (chunk `2838-*` + dashboard layout chunk).

**Tech debt / findings this cycle:**
1. (IMPORTANT, fixed this run) P2-88 torn snapshot chain — rebuilt; see below.
2. (IMPORTANT, pre-existing) Fresh-migrate still breaks at 0018 in journal
   order without the orphan file applied first (`no_show_marked` missing for
   0018's `BEFORE` clause). Live DBs are unaffected (journal-hash bookkeeping);
   this is the documented P1-33 wrinkle, unchanged by this rebuild.
3. (MINOR, NEW) `0037_phone_changed_verb.sql` embeds the literal string
   `--> statement-breakpoint` inside a comment — any splitter that doesn't
   strip comments first breaks the file mid-comment. migrate-vps.mjs is
   tolerant; noted for future tooling.
4. (MINOR, corrected) Board said the snapshot rebuild is "NOT possible on this
   VPS" — stale: drizzle-kit 0.30.6 runs fine via a node_modules mirror
   (drizzle-kit is root-hoisted; drizzle-orm/postgres live only under
   apps/api/node_modules — symlink both next to a config in /tmp and run the
   kit bin with `--preserve-symlinks`).
5. Sentry triage (Phase 1.6): NO live error clusters. Old-Neon quota errors
   (1C/1D/1E/1F) are cutover-week residue (lastSeen Sep 24–25); CORS
   `127.0.0.1:3402` rejections (124×, last Oct 3) = scanner noise against a
   correctly-locked API; one EADDRINUSE during a restart. Render env var
   points at the NEW Neon (`ep-rapid-mud-ar8croal`) and prod health is 200.

**Fix:feat ratio:** pure-infrastructure fix cycle, no feature drift.

## Gates 1–3 — Program design (single item: P2-88)

**Problem:** `drizzle-kit generate` diffs `schema.ts` against the LAST journal
entry's snapshot. With a torn chain (0026 + orphaned 0029 only), the diff base
was 17–19 migrations stale → any future generate could emit destructive DDL.

**User story:** as a developer, running `drizzle-kit generate` must produce
"no changes" against the current schema — never a surprise DROP/ALTER storm.

**Contract (what "done" means):**
- Every journal entry has `meta/<tag>_snapshot.json` (post-0026) or the
  historical old-style file (pre-0026).
- prevId links chain in journal-array order from 0026's id — including THROUGH
  the duplicate idx-39 entry `0014_admin_notification_verbs`.
- The ANCHOR (last entry, 0045) snapshot is a **declaration-serialization** of
  `schema.ts` (NOT a DB introspection): no PG-default `*_fkey` names, no
  raw-SQL-only indexes. This is the load-bearing insight — introspection-pulled
  snapshots make generate emit drop/rename churn.
- Empirical proof: `drizzle-kit generate` against the real schema.ts + rebuilt
  meta → "No schema changes, nothing to migrate".

**Build recipe (proven, recorded in the spec header):**
1. scratch PG (docker `imresamu/postgis:16-3.5` on 127.0.0.1:5499) + postgis.
2. Apply migrations in JOURNAL ARRAY order; apply the un-journaled orphan
   `0014_admin_notification_verbs.sql` right before `0018_absent_shotgun`.
3. Per entry after idx 26: `drizzle-kit pull` → scrub postgis internals
   (`spatial_ref_sys`, geo views, spatial sequences) → write
   `meta/<tag>_snapshot.json`, prevId = previous snapshot's id; delete stale
   old-style same-prefix snapshot (0029 collision).
4. Replace the 0045 snapshot with the declaration-serialization
   (`drizzle-kit generate` vs empty out dir yields it), preserving prevId.
5. Tripwire spec re-pinned to the HEALED state (empty SNAPSHOT_MISSING).

**i18n keys:** none (no UI). **Observability:** n/a (build-time artifacts).

## Gate 3 contract checklist
- [x] Chain integrity verified programmatically (47/47, linked) —
      `python3 /tmp/p288/verify_chain.py` → FULLY CHAINED
- [x] generate dry-run → "No schema changes, nothing to migrate 😴"
- [x] Tripwire spec pins the healed state (4/4 green)
- [x] migrate behavior unchanged (migrate-vps.mjs never reads snapshots; live
      journal-hash bookkeeping untouched)
