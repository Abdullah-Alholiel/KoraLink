# Run #71 — DB & Infra hygiene (migration atomicity + P2-88 snapshot-chain guard)

## Gate 0 — Retrospective (compact)

Baseline: `0850497` (staging HEAD at run start). Recent cycle = run #70 push lane
(`80ce0a3` P2-95/P2-96, `c02fae7` P2-97 lint gate) — all verified DONE this run by Reviewer B
(jest 4/4 waitlist-push, vitest 14 passed rollback suite, both structure suites, KV→worker
subscribe contract traced end-to-end). fix:feat ratio healthy (2 fix-class vs 0 feat last cycle;
both were review-driven hardening, not regression reactions).

Rotation 71%4 = 3 → **DB & Infra lane**. Area audit:

- Reviewer A (zai glm-5.3-flash, 273s, 24 calls) sweep CLEAN on all standing bug classes:
  no `::uuid` casts (varchar(36) invariant held, documented at matches.service.ts:1710), no
  `eq(col, null)`, `FOR UPDATE` present on all money/roster txs, zero `console.*` in API prod
  paths, i18n parity exact (985/985 leaf keys).
- Findings (all DB/Infra — in-lane):
  1. **IMPORTANT — `scripts/migrate-vps.mjs` applies statements with no per-file transaction.**
     A mid-file failure exits 5 with earlier statements already applied and nothing journaled;
     the re-run re-executes them, relying on the duplicate-DDL tolerance for DDL but RE-APPLYING
     any non-idempotent DML in the same file. (migrate-vps.mjs:96-112)
  2. **IMPORTANT (known, run #67) — P2-88 torn snapshot chain.** `meta/` holds 0000–0026 +
     0029 (0029 `prev: null`, non-chained); 0027/0028 and 0030–0043 have no snapshots. The
     shipped path (migrate-vps.mjs) is hash-journal-based and unaffected, but `drizzle-kit
     generate` elsewhere would diff against a snapshot missing 17 migrations of schema.
  3. MINOR — journal entry `0014_admin_notification_verbs` at idx 39 is the documented
     late-adoption convention (run #46); `when` strictly increasing; tripwire passes; fresh-DB
     replay order via migrate-vps is lexicographic (correct position). Not a defect — doc note.
  4. MINOR — duplicate 4-digit prefix on disk (`0014_mean_franklin_storm.sql` +
     `0014_admin_notification_verbs.sql`). Harmless while both stay journaled (gap detection
     only indexes *pending* files); noted in the guard spec header.
- Sentry triage (24h, EU API): ONE fresh signature — KORALINK-API-B `CORS origin not allowed:
  https://evil.example`, count 113 lifetime, only 3 events in the last 24h. Traced to OUR OWN
  probe: `scripts/release-verify.sh:48-49` fires a fake-origin OPTIONS to prove the CORS guard
  rejects foreign origins (and it does). Self-generated noise → MINOR; boarded as a P2 note
  (filter own-probe signature from Sentry or use a non-Sentry-local assertion path).
  All other API issues stale (oldest signals Sep 6-14). koralink-web: nothing new since Sep 14.
- Service health: api/pwa/admin active; API /health 200 (localhost:3001); zero journal errors
  5h all three units.
- ADMIN STATE CHECK: `git status --short apps/admin …` in the STAGING worktree → clean (the
  projects-dir conflict is lane-local and unchanged); no admin item picked regardless
  (rotation = DB lane).

## Gates 1-2 (compact — problem, story, scope)

**Problem:** the VPS migration applier can leave a migration half-applied with no journal row
(silent re-apply of DML on retry), and the drizzle snapshot chain is torn with nothing
preventing silent growth of the gap.

**User story:** as the operator, `node scripts/migrate-vps.mjs` must be all-or-nothing per
migration file, and the repo must loudly flag any new hand-written migration that deepens the
snapshot gap, so `drizzle-kit generate` on a fresh machine can never emit schema-destroying DDL
from a stale diff base.

**IN:** per-file transaction wrapping of migrate-vps.mjs (journal insert inside the tx);
SAVEPOINT-scoped duplicate-DDL tolerance (P2-80 semantics preserved); static structure spec
pinning the atomicity contract; P2-88 guard spec pinning the exact known gap; P2-88 board row
re-scope (rebuild → dedicated half-cycle, guard ships now); P0-2 row note (mada scheme).
**OUT:** actual snapshot regeneration for 0027-0043 (needs `drizzle-kit` unavailable on this
VPS — CI/fresh-clone path, its own cycle); journal reorder (not a defect); seed.ts tx wrapping
(dev-only).

## Gate 3 — Program design (contracts)

**migrate-vps.mjs per-file transaction (Slice A):**
- Loop body: `await sql.begin(async (tx) => { … })` per pending file.
- Each statement runs inside `tx.savepoint(async (sp) => { await sp.unsafe(stmt); })` —
  a duplicate-DDL failure rolls back ONLY its savepoint; the `DUP_CODES`/no-SQLSTATE
  "already exists" tolerance (P2-80) then `continue`s the loop, tx stays usable.
- On a non-tolerated failure: log (file + stmt head + message), set `failed`, throw a local
  `Rollback` sentinel → `sql.begin` ROLLBACKs the whole file (statements + journal insert).
- Journal INSERT moved INSIDE `sql.begin`, AFTER the statement loop → apply+journal is atomic:
  a failed file leaves zero statements and zero journal rows; a committed file is fully applied
  and journaled.
- Re-throw anything that is not the sentinel (connection loss etc.) → existing exit-nonzero
  behavior. `process.exit(5)` retained for the human-facing failure path.
- Static spec pins (structure test, same style as the journal tripwire): file contains
  `sql.begin(`, `savepoint(`, journal insert inside the begin block, `process.exit(5)` after a
  failed file.

**P2-88 guard spec (Slice B)** — `apps/api/src/database/drizzle-snapshot-chain.spec.ts`:
- Test 1 pins the exact torn state: 0026 present, 0027 absent, 0028 absent, 0029 present with
  `prev === null`. Any change (growth OR the fix) flips red → forces a human decision.
- Test 2 pins the exact missing-snapshot set for hand-written migrations `0030+`:
  `['0030' … '0043']`. A NEW hand-written migration without a snapshot changes the set → RED
  with instructions (regenerate the chain or consciously extend the pin); the future rebuild
  commit updates the pin to `[]` in the same commit.
- Philosophy: a skipped test is invisible; a pinned known-state test is a tripwire in both
  directions.

**Board contracts:** P2-88 row → "PARTIAL — guard + applier atomicity shipped run #71; full
snapshot rebuild still queued (dedicated half-cycle)". P0-2 row gains the mada note
(Reviewer B run #71: no `mada|stcpay|applepay` anywhere in api/pwa — the provider decision
must explicitly consider mada, the dominant KSA card scheme).

## Gate 3 contract verification checklist

- [x] Tolerance semantics unchanged: only DDL-duplicate classes (`42P07/42710/42701/42P06`) or
      no-SQLSTATE "already exists" messages are tolerated — verified identical predicate
      carried into the savepoint catch.
- [x] Journal insert runs in the SAME tx as the statements (read of the diff confirms placement
      after the statement loop, before `sql.begin` resolves).
- [x] Failure path: non-tolerated error → sentinel throw → ROLLBACK → `process.exit(5)` (exit
      code contract preserved for deploy-staging.sh's preflight).
- [x] Gap-detection (exit 5 pre-loop) untouched — still runs before any apply.
- [x] Both new specs are pure fs/JSON (no DB, no network) → no live-DB dependency, fast.
- [x] Existing tripwire (`drizzle-migration-journal.spec.ts`) still passes — journal untouched.
- [x] No schema.ts or migration file changes in this slice (zero live-DB impact; no
      db:generate/db:migrate needed; no API restart needed — script is not part of dist/).
