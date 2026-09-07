# Run #39 — Program Design (Gates 1–3 compact)

Cycle: run39-drizzle-journal-parity · Owner pre-approved autonomous mode (factory loop).

## Item 1 — Drizzle migration journal parity (P0-class drift, DB/Infra)

**Problem.** `apps/api/drizzle/meta/_journal.json` ends at tag 0033 while
`0034_waitlist_capacity_standard.sql` and `0035_drop_skill_level.sql` exist on disk (and in git,
since eb4ad39 / 562a240). `readMigrationFiles` (drizzle-orm/migrator.js:12-28) iterates ONLY
journal entries → any fresh environment (new contributor, CI, restored DB, demo clone) silently
misses both migrations: waitlist table missing → P1-17 endpoints 500; `users.skill_level`
still present → schema drift vs schema.ts. The LIVE box is unaffected (rows exist in
drizzle.__drizzle_migrations with hashes b29a876a… = 0035 file exactly; fde425a5… = 0033;
0034 applied pre-rewrite at fde425a5-slot 2026-09-05T15:58 then file rewritten post-apply per
eb4ad39's message).

**User story.** As an operator booting KoraLink on a fresh database, `npm run db:migrate` must
produce the exact same schema as the live box, including the waitlist table and the DEFERRABLE
(match_id, position) constraint that P1-17's resequence logic depends on.

**Scope.**
- IN: journal entries for 0034 + 0035 (shape mirrors 0032/0033: version "7", breakpoints true,
  when = repo commit epoch ms, tag = filename stem); a jest tripwire spec that (a) fails when a
  numbered `drizzle/*.sql` file lacks a journal entry or vice versa, (b) fails if any journaled
  file is missing on disk, (c) pins that a fresh DB replaying the journal creates the DEFERRABLE
  waitlist constraint and drops skill_level (static SQL assertions on 0034/0035 content —
  no live DB dependency).
- OUT: no new migration (fresh DBs reach parity by replaying 0034/0035 — verified idempotent
  shape: IF NOT EXISTS everywhere + DO-block guarded constraint). No snapshot backfill (0030+
  are hand-written by documented VPS convention; snapshots stopped at 0029 deliberately).
  No live-DB writes.

**Safety proof (Gate 3, run against drizzle-orm 0.44.7 source, pg-core/dialect.js:44-71).**
`migrate()` reads ONLY `select ... order by created_at desc limit 1` — the newest live row — and
applies any journal entry whose `when` > that row's `created_at`. Live newest = 0035 row
(1788730560000... = 2026-09-06T19:42Z read). Repaired entries: 0034 when=1788708023000,
0035 when=1788730125000 — both < newest live created_at → skipped on the live box (0 DDL);
applied exactly once on fresh DBs. Hash is write-only metadata (never compared).

**Exact artifacts.**
- `apps/api/drizzle/meta/_journal.json`: entries idx 33→tag 0034..., idx 34→tag 0035...
- `apps/api/src/database/drizzle-migration-journal.spec.ts` (new).

**Contract checklist (Gate 3).**
- [x] No API/DTO/hook/i18n surface changes (backend-infra only; i18n parity untouched — en=ar 952 keys).
- [x] Journal entry shape byte-compatible with drizzle-kit's (idx/version/when/tag/breakpoints).
- [x] Spec fails on the current (pre-fix) tree — will be demonstrated by reverting the journal
      in a scratch check before committing.
- [x] No live-DB dependency in the spec (pure fs + string assertions).

## Item 2 — P2-5 residual: createDispute + createVenue populated returns

**Problem (API Contract Rule §2).** `createDispute` (matches.service.ts:2650) returns the bare
inserted row incl. raw `evidence` json and NO `has_appealed` — while the PWA consumer
`useAppeal` types the response as `MyDispute` (has_appealed: boolean, no evidence field).
Silent undefined on a typed field = the exact P2-5 class. `createVenue`
(partner.service.ts:101-115) returns only `{id,name,city}` while the admin venues page's row
type is the full venue column set — the optimistic create path can't populate a valid row.
`createSlot` (partner.service.ts:736+) REFUTED as violation: returns the complete slot row
(single entity, nothing omitted).

**User story.** As a player appealing a no-show, the appeal sheet must render the real dispute
status immediately from the POST response (no refetch flash); as a partner creating a venue,
the new row must appear in the table complete (or the client refetches — today it gets a
half-row that type-checks only by luck).

**Scope.** createDispute → map BOTH return paths (attachAppeal + fresh insert) through one
`toMyDispute()` mapper: `{ id, type, status, decision, has_appealed, created_at, updated_at }`
(exactly MyDispute; evidence stays internal — findMyDispute already computes has_appealed the
same way). createVenue → return the full inserted row (`.returning()` no projection; columns
match PartnerVenueRow; is_approved:false etc.). No DTO/hook/i18n changes required: consumers'
existing types already declare these exact shapes (verified: useDisputes.ts MyDispute;
admin types.ts:260 PartnerVenueRow; admin venues page renders `reload()` data, no optimistic
insert). i18n: no new user-facing strings.

**Exact JSON shapes.**
```json
// POST /matches/:id/dispute  (and the concurrent-appeal path)
{ "id": "uuid", "match_id": "uuid", "type": "no_show", "status": "opened",
  "decision": null, "has_appealed": true, "created_at": "...", "updated_at": "..." }
// POST /partner/venues → full venues row:
{ "id": "…", "owner_id": "…", "name": "…", "city": "…", "address": "…",
  "is_approved": false, "is_koralink_partner": false, "rating": null, "…": "every venues column" }
```

**Specs.** Extend the P2-5 contract spec family: matches.dispute-contract.spec.ts
(+3: mapper shape incl. has_appealed from appeal-action evidence; attachAppeal path returns
same shape; status preserved) and partner.venue-contract.spec.ts (+2: full-row return;
is_approved false on create). Jest mocks mirror matches.castvote-contract.spec.ts's thenable-db
pattern.

**Contract checklist (Gate 3).**
- [x] Both dispute return paths (insert + attachAppeal) go through the same mapper — no shape drift.
- [x] PWA `MyDispute` fields all present, no silent undefined (has_appealed explicitly computed).
- [x] Admin `PartnerVenueRow` can accept the full row (superset fields are optional in the type).
- [x] No i18n keys needed (no user-facing copy).
- [x] Mutation returns OUTSIDE tx (both methods already single-statement, no tx wrapper).
- [x] Realtime `broadcastOps('venues')` unchanged (fires before return, order preserved).

## Verification plan (both items)
`npx jest --silent drizzle-migration-journal dispute-contract venue-contract` →
full `npx jest` → PWA vitest (untouched but re-run as gate) → root `npm run build` →
commit per item → push. API restart NOT required (no dist-consuming change at runtime:
journal is build-time input; service changes are pure return-mapping — still, restart per the
stale-code rule since API source changed).
