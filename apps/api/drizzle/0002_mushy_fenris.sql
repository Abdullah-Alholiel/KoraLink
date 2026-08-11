CREATE TYPE "public"."BookingMode" AS ENUM('koralink', 'self');--> statement-breakpoint
CREATE TABLE "pitch_slots" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"pitch_id" varchar(36) NOT NULL,
	"slot_date" date NOT NULL,
	"start_time" time NOT NULL,
	"end_time" time NOT NULL,
	"is_booked" boolean DEFAULT false NOT NULL,
	"booked_match_id" varchar(36),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "booking_mode" "BookingMode" DEFAULT 'self' NOT NULL;--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "booking_slot_id" varchar(36);--> statement-breakpoint
ALTER TABLE "venues" ADD COLUMN "is_koralink_partner" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "pitch_slots" ADD CONSTRAINT "pitch_slots_pitch_id_pitches_id_fk" FOREIGN KEY ("pitch_id") REFERENCES "public"."pitches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pitch_slots" ADD CONSTRAINT "pitch_slots_booked_match_id_matches_id_fk" FOREIGN KEY ("booked_match_id") REFERENCES "public"."matches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_pitch_slot" ON "pitch_slots" USING btree ("pitch_id","slot_date","start_time");--> statement-breakpoint
CREATE INDEX "idx_slots_pitch_date" ON "pitch_slots" USING btree ("pitch_id","slot_date");--> statement-breakpoint
CREATE INDEX "idx_slots_available" ON "pitch_slots" USING btree ("is_booked") WHERE "pitch_slots"."is_booked" = false;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_booking_slot_id_pitch_slots_id_fk" FOREIGN KEY ("booking_slot_id") REFERENCES "public"."pitch_slots"("id") ON DELETE set null ON UPDATE no action;