# Run #55 — Program Design (compact Gates 1–3): P2-56 FK leading-column indexes

Cycle: run55-db-infra · Mode: autonomous · Status: GATES 0–3 COMPLETE (autonomous mode — no
approval pauses; hard gates remain build+tests before any done-claim).

## Gate 1 — Product spec (compact)

- **Problem:** 12 FK columns have no index with them as the leading column. Postgres does NOT
  auto-index the referencing side of a FK, so any `DELETE`/`UPDATE` on the referenced PK
  (users, matches, pitch_slots, activities) or a reverse lookup (`WHERE fk = X`) triggers
  full scans per referencing table. Harmless at demo scale, a launch-scale liability, and
  every future migration re-opens the Render demo drift question (P2-51) — which is exactly
  why this was deferred at run #43.
- **User story:** as the platform, when a user/match/slot row is deleted or reverse-looked-up,
  all FK enforcement scans indexes, never tables.
- **In scope:** one staging migration `0042_hot_fk_indexes.sql` + `schema.ts` third-arg index
  blocks + journal entry + repo docs. Verify FK coverage live on staging DB after apply.
- **Out of scope:** prod/Neon migration (promote-flow owner gate, P2-51 stays owner-gated);
  any code that would create new reverse-lookup query consumers; any apps/admin or PWA change.
- **Success criteria:** (1) all 12 columns appear as leading columns in `pg_indexes` on staging;
  (2) `turbo run build` + PWA vitest + API jest green; (3) FK-coverage audit script reports
  zero un-led FK columns.

## Gate 2 — Architecture (compact)

- Data flow: none (pure DDL + metadata). No API/PWA/admin surface changes.
- Files changed:
  | File | Change |
  |---|---|
  | `apps/api/drizzle/0042_hot_fk_indexes.sql` | NEW — 12 `CREATE INDEX IF NOT EXISTS` |
  | `apps/api/src/database/schema.ts` | add index entries in the 9 tables' third-arg arrays |
  | `apps/api/drizzle/meta/_journal.json` | append entry idx 43, tag 0042, when=1789316793124 |
  | `scripts/fk-index-report.mjs` | NEW — FK-coverage audit (information_schema vs pg_indexes) |
  | `docs/plans/run55-db-infra/*` | gate docs |
  | `kanban/BOARD.md`, `kanban/STATE.json`, `kanban/RUNS/…` | board/report |
- Risks: (a) index-name collision → mitigated by `IF NOT EXISTS` + fresh names; (b) write
  amplification → 12 narrow b-trees on append-heavy small tables, accepted; (c) journal when
  misplacement → checked live (0041 = 1789316793123; 0042 = +1 ms); (d) build breakage from
  schema.ts edit → turbo + tsc gates.

## Gate 3 — Program design: exact DDL contract (copy-paste truth)

12 indexes, one per statement, all `IF NOT EXISTS` (idempotent; applier also tolerates
duplicate-code 42P07). `--> statement-breakpoint` separated.

| # | Index name | Table | Column | FK target / delete rule |
|---|---|---|---|---|
| 1 | `idx_pitch_slots_booked_match` | pitch_slots | booked_match_id | matches / set null |
| 2 | `idx_matches_booking_slot` | matches | booking_slot_id | pitch_slots / set null |
| 3 | `idx_matches_pom_winner` | matches | pom_winner_id | users / set null |
| 4 | `idx_activities_match` | activities | match_id | matches / cascade |
| 5 | `idx_feed_items_activity` | feed_items | activity_id | activities / cascade |
| 6 | `idx_match_votes_voter` | match_votes | voter_id | users / cascade |
| 7 | `idx_match_votes_candidate` | match_votes | candidate_id | users / cascade |
| 8 | `idx_disputes_decided_by` | disputes | decided_by | users / set null |
| 9 | `idx_disputes_respondent` | disputes | respondent_id | users / set null |
| 10 | `idx_dispute_messages_author` | dispute_messages | author_id | users / cascade |
| 11 | `idx_venue_verifications_reviewed_by` | venue_verifications | reviewed_by | users / set null |
| 12 | `idx_reports_resolved_by` | reports | resolved_by | users / set null |

### TS signatures (schema.ts third-arg arrays — exact lines to add)

```ts
// pitch_slots: append to (table) => [ … ] array
index('idx_pitch_slots_booked_match').on(table.booked_match_id),
// matches: append to (t) => [ … ]
index('idx_matches_booking_slot').on(t.booking_slot_id),
index('idx_matches_pom_winner').on(t.pom_winner_id),
// activities
index('idx_activities_match').on(t.match_id),
// feed_items: change single-element array to include both
index('idx_feed_items_activity').on(t.activity_id),
// match_votes: append two entries
index('idx_match_votes_voter').on(t.voter_id),
index('idx_match_votes_candidate').on(t.candidate_id),
// disputes: append two entries
index('idx_disputes_decided_by').on(t.decided_by),
index('idx_disputes_respondent').on(t.respondent_id),
// dispute_messages: replace single-element array
index('idx_dispute_messages_author').on(t.author_id),
// venue_verifications: replace single-element array
index('idx_venue_verifications_reviewed_by').on(t.reviewed_by),
// reports: append
index('idx_reports_resolved_by').on(t.resolved_by),
```

### Migration file content (exact)

```sql
-- 0042_hot_fk_indexes.sql — P2-56: FK leading-column indexes (run #55)
-- Postgres does not auto-index the referencing side of a FK. Every column below is
-- an un-led FK leg (coverage audit: scripts/fk-index-report.mjs). All idempotent.
CREATE INDEX IF NOT EXISTS idx_pitch_slots_booked_match ON pitch_slots (booked_match_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_matches_booking_slot ON matches (booking_slot_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_matches_pom_winner ON matches (pom_winner_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_activities_match ON activities (match_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_feed_items_activity ON feed_items (activity_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_match_votes_voter ON match_votes (voter_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_match_votes_candidate ON match_votes (candidate_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_disputes_decided_by ON disputes (decided_by);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_disputes_respondent ON disputes (respondent_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_dispute_messages_author ON dispute_messages (author_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_venue_verifications_reviewed_by ON venue_verifications (reviewed_by);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_reports_resolved_by ON reports (resolved_by);
```

### Journal entry (append to apps/api/drizzle/meta/_journal.json entries)

```json
{ "idx": 43, "version": "7", "when": 1789316793124, "tag": "0042_hot_fk_indexes", "breakpoints": true }
```

`when` = 0041's (1789316793123) + 1 ms → BELOW any future live-newest at apply time, ABOVE
0041 so the ordering is monotone (0039/40 phantom-refire trap avoided; sha256 applier is the
real gate on the VPS anyway).

### Gate 3 contract verification checklist (explicit, per factory rule)

- [x] ✓ Every target column verified as an FK with a known delete rule (schema.ts read line-by-line this run: 387, 453, 459, 883, 905-906, 585-597, 929-946, 981-982, 1007, 1082-1085).
- [x] ✓ Every target column verified NOT covered by any existing leading-column index (schema index blocks read: pitch_slots 397-398, matches 471-475, activities 889-891, feed_items 912, match_votes 597-601, disputes 951-965, dispute_messages ~986, venue_verifications 1010, reports 1087-1099).
- [x] ✓ Migration file name sorts after 0041 → `migrate-vps.mjs` gap-guard passes (0042 > maxKnown 41).
- [x] ✓ All statements `CREATE INDEX IF NOT EXISTS` → re-run safe; duplicate-name tolerated by applier (42P07).
- [x] ✓ No snapshot json emitted; journal entry hand-appended in the same commit (0030+ convention; tripwire spec enforces pairing).
- [x] ✓ `when` below live newest (1789316793124 vs live-newest ≥ 0041's when) → drizzle-kit on Neon (at promote time) treats it as applied-exactly-once.
- [x] ✓ No API/PWA/admin code touched → no DTO/adapter/i18n contract surface changes; only schema.ts index metadata (type-level no-op).
- [x] ✓ Live staging DB verified AFTER apply: 12/12 names present in `pg_indexes` (evidence in run report), audit script reports 0 un-led FKs.
