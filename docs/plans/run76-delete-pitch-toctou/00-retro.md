# Run #76 — Gate 0–3 Compact (P2-105 deletePitch TOCTOU)

Cycle: factory run #76 (2026-09-26T01:15Z), rotation 76%4=0 (PWA screens lane), primary item P2-105 routed via claude lane.

## Gate 0 — Retrospective (audit of the touched area)

- Baseline: staging 9597ba6 (PR #32 socket-singleton + #33 CI gates merged by Abdullah's interactive session; deploy fork COLLAPSED — projects dir is now the staging checkout, 2nd worktree removed). ADMIN HOLD (in place since run #62) LIFTED — clean admin/partner surface verified before picking the item.
- **Board-premise audit (P2-105): the row claimed "matches.pitch_id is a bare varchar(36), NO DB FK constraint — schema.ts:420". LIVE-DB check (pg_constraint) disproves it: `matches_pitch_id_pitches_id_fk ON DELETE CASCADE` exists (since Prisma→Drizzle conversion 93842dc). The real consequence is worse than boarded: a mid-check match is silently CASCADE-ERASED, not orphaned.** Lesson recorded: a board row's schema claim was written against schema.ts reading only — pg_constraint is the source of truth.
- Mutation-contract audit of deletePitch: returns {deleted:true} by design (not a findOne contract surface). deleteSlot already fixed the same class (run #9) — its harness (thenable fake db + call-order pins) is the module's spec convention.
- Tech-debt scan: Reviewer A flagged the dead Admin bypass (~8 sites) + weeklyTrend TZ misalignment → boarded P2-108/P2-109 rather than batched into this fix (one defect per PR).

## Gates 1–3 — Program design (contract locked before build)

- User story: as a venue owner I can delete an unused pitch without a match created mid-request being silently destroyed.
- Fix shape (locked): ONE `db.transaction()`; first statement `SELECT id FROM pitches WHERE id = $1 FOR UPDATE` (existence + row lock — concurrent FK-referencing inserts block until commit); history count in the same tx; `count > 0` → BadRequest with the EXACT existing message; tx DELETE; broadcastOps + return AFTER commit. assertPitchAccess unchanged before the tx. No migration. No wire-shape change.
- Contract verification checklist:
  - [x] Response shape unchanged: `{ deleted: true }` (deleteSlot precedent; controller returns it verbatim) — no frontend types touched.
  - [x] 404/400 semantics preserved (same messages; 404 now raised inside the tx after the lock select).
  - [x] New spec `partner.delete-pitch.spec.ts` (4 cases) pins 404 / exact 400 message / happy path broadcast-once / call ORDER (FOR UPDATE before count; deletes only inside tx; broadcast after commit; out-of-tx db.select/delete throw via the harness).
  - [x] i18n: no user-facing strings added (error text unchanged, server-side).
  - [x] No migration files; no schema change; observability: no new error paths (existing Sentry capture on 4xx/5xx unchanged).
- Why FOR UPDATE and not a WHERE-guard delete: FK inserts take a KEY SHARE lock on the referenced pitch row — they block behind FOR UPDATE and commit only after the delete tx closes, so cascade-erasure becomes structurally impossible; a conditional DELETE alone would still delete an empty pitch while a match insert was mid-flight.

## Lane execution + reconciliation

- claude lane run 01a0db56 (software-change template, rt-lane.json Opus 5.5 worker), isolated worktree /tmp/lane-p2-105 (node_modules symlinked, .env copied for lane-internal gates), input folded into the template's single `task` field (schema accepts only `task`).
- Lane delivered uncommitted diff; parent reconciled: full diff review + lane gates (partner jest 27/27, tsc 0) → lane branch commit b3d7172 → PR #35 → bot checks green (gate 3m55s, review SUCCESS, semgrep SUCCESS, fresh-apply) → PR-Agent triage clean → squash-merged `7a99711` → ff-pulled into the staging checkout → parent full gates re-run on the final tree.

## Status

| Gate | Name | Status |
|------|------|--------|
| 0 | Retrospective | ✅ (this doc) |
| 1–3 | Program design | ✅ (this doc, autonomous mode) |
| 4 | Vertical slice | ✅ PR #35 → `7a99711`, all gates green |
