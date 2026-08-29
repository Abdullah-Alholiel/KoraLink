ALTER TABLE "venues" ADD COLUMN "open_hour" smallint DEFAULT 8 NOT NULL;--> statement-breakpoint
ALTER TABLE "venues" ADD COLUMN "close_hour" smallint DEFAULT 23 NOT NULL;--> statement-breakpoint
ALTER TABLE "venues" ADD COLUMN "closed_day_0" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "venues" ADD COLUMN "closed_day_1" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "venues" ADD COLUMN "closed_day_2" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "venues" ADD COLUMN "closed_day_3" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "venues" ADD COLUMN "closed_day_4" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "venues" ADD COLUMN "closed_day_5" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "venues" ADD COLUMN "closed_day_6" boolean DEFAULT false NOT NULL;