-- P0-6 (run #29): PDPL account-delete + data-export.
-- (1) Add `users.deleted_at` for soft delete + 30-day grace window. NULL =
-- active account. `users.deleted_at IS NOT NULL` excludes the user from
-- search, public profile, match join, DM, feed, etc. The JWT strategy +
-- verifyOtp both gate on this.
-- (2) Drop ON DELETE CASCADE on `transactions.user_id` → `users.id`. PDPL
-- requires the financial transaction history to be retained for audit; a
-- hard purge at day-30 must NOT destroy it. The hard-purge job anonymizes
-- the `users` row (phone → "deleted:<id>", name → "Deleted User") and
-- leaves the FK target intact. (Activities still cascade — see schema.ts:
-- 779 — because activities are short-lived engagement logs, not financial
-- records.)
-- (3) Drop ON DELETE CASCADE on `push_subscriptions.user_id` → `users.id`.
-- A hard-purge anonymizes the user row but the push subscription is bound
-- to a (now-anonymized) user; we DELETE the push_subscriptions row in the
-- purge job (push can't reach a deleted user) and leave the users row
-- standing for the transactions FK.

-- (1) Add deleted_at to users.
ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "deleted_at" timestamptz;--> statement-breakpoint

-- Partial index on deleted_at to make the auth gate (auth.service + strategy)
-- and the "active user" queries cheap. Most users have deleted_at IS NULL;
-- a partial index keeps the working set small.
CREATE INDEX IF NOT EXISTS "users_deleted_at_idx"
  ON "users"("deleted_at")
  WHERE "deleted_at" IS NOT NULL;--> statement-breakpoint

-- (2) Drop cascade on transactions.user_id → users.id.
-- Postgres lets you swap the FK action in place. We switch to NO ACTION
-- (the default restrict) so a hard DELETE of a user with transactions is
-- blocked — the purge job must anonymize the user row instead.
ALTER TABLE "transactions"
  DROP CONSTRAINT IF EXISTS "transactions_user_id_users_id_fk";--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "transactions"
    ADD CONSTRAINT "transactions_user_id_users_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "users"("id")
    ON DELETE RESTRICT;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint

-- (3) Drop cascade on push_subscriptions.user_id → users.id.
-- A deleted user has no device to push to, so we drop the FK to CASCADE
-- and re-create it as CASCADE (so the purge job can simply DELETE the
-- user row and the subscriptions vanish). We keep this CASCADE so the
-- push_subscriptions cleanup is automatic. (The audit reason: push subs
-- are device-bound, not financial records.)
ALTER TABLE "push_subscriptions"
  DROP CONSTRAINT IF EXISTS "push_subscriptions_user_id_users_id_fk";--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "push_subscriptions"
    ADD CONSTRAINT "push_subscriptions_user_id_users_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "users"("id")
    ON DELETE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
