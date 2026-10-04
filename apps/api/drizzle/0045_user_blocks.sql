-- ============================================================================
-- Migration 0045: user blocks (P1-53, run #100).
--
-- A user can block another user; a block in EITHER direction prevents DMs
-- between the pair (ConversationsService.sendMessage →
-- BlocksService.assertNotBlockedBetween). Composite PK (blocker_id,
-- blocked_id) makes block idempotent and serves blocker-side lookups; the
-- blocked_id index serves the reverse-direction check.
--
-- NOTE: hand-written migration per VPS convention (drizzle-kit broken here;
-- __drizzle_migrations bookkeeping row added by the apply step —
-- scripts/migrate-vps.mjs). All id columns are varchar(36) — ::text casts
-- only, never ::uuid.
-- ============================================================================

CREATE TABLE IF NOT EXISTS "user_blocks" (
  "blocker_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "blocked_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "user_blocks_pk" PRIMARY KEY ("blocker_id","blocked_id"),
  CONSTRAINT "user_blocks_no_self" CHECK ("blocker_id" <> "blocked_id")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_blocks_blocked_id_idx" ON "user_blocks" ("blocked_id");
