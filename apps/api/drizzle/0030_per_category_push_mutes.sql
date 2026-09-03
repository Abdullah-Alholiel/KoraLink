-- P0.5 (run #28): per-category push preferences. 4 categories that cover
-- every web-push trigger today + reserve `promo` for future use. The
-- `users.push_muted` global kill-switch stays; this table is the per-category
-- opt-out INSIDE that. Cascade-delete keeps the table clean on PDPL
-- soft-delete purges.

DO $$ BEGIN
  CREATE TYPE "NotificationCategory" AS ENUM ('match', 'chat', 'promo', 'system');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "user_notification_prefs" (
  "id" varchar(36) PRIMARY KEY,
  "user_id" varchar(36) NOT NULL,
  "category" "NotificationCategory" NOT NULL,
  "muted" boolean NOT NULL DEFAULT true,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "user_notification_prefs_user_category_uidx"
  ON "user_notification_prefs"("user_id", "category");--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "user_notification_prefs_user_idx"
  ON "user_notification_prefs"("user_id");--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "user_notification_prefs"
    ADD CONSTRAINT "user_notification_prefs_user_id_users_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "users"("id")
    ON DELETE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
