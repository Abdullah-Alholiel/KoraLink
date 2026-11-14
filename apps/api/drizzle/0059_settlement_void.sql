-- 0059: settlement VOID path (P2-285, run #195) — owner decision
-- D-20261106-03 (Life OS portal, 2026-11-07): "Void pending only, with audit
-- trail." An admin may void a PENDING settlement (duplicate/erroneous row);
-- the row keeps its history (audit settlement.void carries before/after).
--
-- (1) New terminal enum value. IF NOT EXISTS keeps this idempotent against
--     legacy environments that already carry it.
--     FRESH-APPLY TRAP (CI run 42498845309 proved it): the enum value is
--     added inside the same transaction drizzle/migrate-vps run in, so it
--     must NOT be USED anywhere later in that transaction (PG "unsafe use
--     of new value", all supported versions). Hence the index predicate
--     below enumerates the PRE-EXISTING open statuses instead of
--     `status <> 'voided'` — semantically identical for this enum, and a
--     future enum addition must revisit this predicate (grep 0059).
-- (2) The (venue_id, period_start) uniqueness guard becomes PARTIAL — an OPEN
--     (pending/paid/failed) settlement still blocks duplicates for its window,
--     but a VOIDED row frees the window: the next generator run / partner
--     payout request can re-settle it. Drop-then-create in one file keeps the
--     uniqueness property intact at every instant of the swap.
ALTER TYPE "SettlementStatus" ADD VALUE IF NOT EXISTS 'voided';--> statement-breakpoint
DROP INDEX IF EXISTS "settlements_venue_period_uidx";--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "settlements_venue_period_open_uidx" ON "settlements" ("venue_id","period_start") WHERE "status" IN ('pending','paid','failed');
