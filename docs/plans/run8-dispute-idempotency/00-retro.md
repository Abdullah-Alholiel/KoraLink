# Run #8 — createDispute idempotency + migration-tracking reconciliation (Gate 0 Retro)

**Date:** 2026-08-28 · **Mode:** autonomous (no approval pauses)

## Baseline

- HEAD `dffc703` on `main`, clean tree, no lock. Last run #7 (`dfc671f` DM idempotency).
- Services active; API `/api/v1/health` 200 on `:3001` (NOT `:8443` — that's the HTTPS proxy).
- Baseline build 3/3, API jest 83/83, PWA vitest 218/218 (run #7 report).

## Findings driving this cycle

### F1 — `createDispute` TOCTOU (IMPORTANT, unboarded) — the build target
`matches.service.ts:1559-1607` opens a dispute via select-then-insert with NO unique
index on `(match_id, reporter_id, type)` and no `onConflictDoNothing`. A concurrent
double-tap opens two identical disputes. This is the exact class P2-9 fixed for `reports`
(`reports_open_subject_uidx`, schema.ts:906) but `disputes` was missed.

### F2 — Migration tracking stale (P1, infra) — prerequisite fix
`drizzle.__drizzle_migrations` has 19 content-hash rows but the journal lists 20
migrations. SHA256 comparison of the migration files shows `0002_mushy_fenris.sql`
(`88b01448…`) and `0008_light_karnak.sql` (`eb3dc001…`) have content hashes NOT in the
tracking table — both files were edited in-place (0002 → dual-mode backend, 0008 → `IF
NOT EXISTS` on visibility indexes) and the live DB synced via `drizzle-kit push`, which
never records hashes. **Consequence: `npm run db:migrate` would re-apply 0002
(`CREATE TYPE "BookingMode"`) and fail on the existing type.** Verified the live DB has
ALL objects from the current 0002/0008 content (enums `BookingMode`/`match_visibility`;
columns `matches.booking_mode`/`booking_slot_id`/`visibility` + `venues.is_koralink_partner`;
indexes `uq_pitch_slot`/`idx_slots_pitch_date`/`idx_slots_available`/`matches_visibility_idx`/
`matches_location_gist_idx`; table `pitch_slots`) — so reconciling the tracking table is
safe (no schema drift to backfill).

## Decision

Build **createDispute idempotency** (data-integrity, mirrors P2-9 reports) and first
**reconcile migration tracking** (prerequisite so `db:migrate` can apply 0020).
Commit criterion: security/data-integrity > broken flow > missing feature > polish.
