-- P1-41 (run #35): optional user email + verified-email kill-switch.
-- Phone-first product: NULL email = never emailed (existing users unaffected).
-- Erasure promise (PDPL): the 30-day purge anonymizer nulls these columns,
-- so a purged ghost can never be addressed again.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "email" varchar(255);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "email_verified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "email_muted" boolean NOT NULL DEFAULT false;--> statement-breakpoint

-- Case-insensitive uniqueness. Partial: multiple NULLs are legal (most users
-- have no email at all). Lower() so Email@X.com blocks email@x.com.
CREATE UNIQUE INDEX IF NOT EXISTS "users_email_uidx"
  ON "users" (LOWER("email"))
  WHERE "email" IS NOT NULL;--> statement-breakpoint

-- Suppression lookups resolve the recipient list by this predicate on every
-- send — hot enough to deserve the composite (email_muted prefix serves the
-- rare muted scan; the real win is email+verified on the mailer path).
CREATE INDEX IF NOT EXISTS "users_email_suppression_idx"
  ON "users" ("email_muted")
  WHERE "email" IS NOT NULL AND "email_verified_at" IS NOT NULL AND "deleted_at" IS NULL;
