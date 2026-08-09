CREATE EXTENSION IF NOT EXISTS "postgis";--> statement-breakpoint
CREATE TYPE "public"."Environment" AS ENUM('Indoor', 'Outdoor');--> statement-breakpoint
CREATE TYPE "public"."GenderRule" AS ENUM('Men Only', 'Women Only', 'Mixed');--> statement-breakpoint
CREATE TYPE "public"."MatchStatus" AS ENUM('Open', 'Full', 'InProgress', 'Completed', 'Cancelled');--> statement-breakpoint
CREATE TYPE "public"."MatchType" AS ENUM('Casual', 'Competitive');--> statement-breakpoint
CREATE TYPE "public"."PitchSize" AS ENUM('5v5', '7v7', '8v8', '11v11');--> statement-breakpoint
CREATE TYPE "public"."ReferenceType" AS ENUM('MATCH_FEE', 'TOPUP', 'REFUND', 'PRIZE');--> statement-breakpoint
CREATE TYPE "public"."SkillLevel" AS ENUM('Beginner', 'Intermediate', 'Advanced');--> statement-breakpoint
CREATE TYPE "public"."SurfaceType" AS ENUM('Grass', 'Artificial');--> statement-breakpoint
CREATE TYPE "public"."Team" AS ENUM('Home', 'Away');--> statement-breakpoint
CREATE TYPE "public"."TransactionStatus" AS ENUM('Pending', 'Completed', 'Failed', 'Reversed');--> statement-breakpoint
CREATE TYPE "public"."TransactionType" AS ENUM('CREDIT', 'DEBIT');--> statement-breakpoint
CREATE TYPE "public"."UserRole" AS ENUM('Player', 'VenueOwner', 'Admin');--> statement-breakpoint
CREATE TABLE "match_messages" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"match_id" varchar(36) NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "match_players" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"match_id" varchar(36) NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"team" "Team",
	"is_host" boolean DEFAULT false NOT NULL,
	"no_show" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "matches" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"host_id" varchar(36) NOT NULL,
	"pitch_id" varchar(36) NOT NULL,
	"title" varchar(255) NOT NULL,
	"match_type" "MatchType" NOT NULL,
	"gender_rule" "GenderRule" NOT NULL,
	"status" "MatchStatus" DEFAULT 'Open' NOT NULL,
	"scheduled_at" timestamp with time zone NOT NULL,
	"duration_mins" integer NOT NULL,
	"price_per_player" numeric(10, 2) NOT NULL,
	"max_players" integer NOT NULL,
	"location" "geography(Point, 4326)",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pitches" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"venue_id" varchar(36) NOT NULL,
	"name" varchar(255) NOT NULL,
	"size" "PitchSize" NOT NULL,
	"surface_type" "SurfaceType" NOT NULL,
	"environment" "Environment" NOT NULL,
	"hourly_rate" numeric(10, 2) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"type" "TransactionType" NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"reference_type" "ReferenceType" NOT NULL,
	"reference_id" varchar(36),
	"idempotency_key" varchar(255) NOT NULL,
	"status" "TransactionStatus" DEFAULT 'Pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "transactions_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"phone" varchar(20) NOT NULL,
	"full_name" varchar(255),
	"handle" varchar(50),
	"avatar_url" text,
	"preferred_location" varchar(255),
	"preferred_position" varchar(100),
	"skill_level" "SkillLevel",
	"role" "UserRole" DEFAULT 'Player' NOT NULL,
	"wallet_balance" numeric(12, 2) DEFAULT '0' NOT NULL,
	"karma_score" integer DEFAULT 0 NOT NULL,
	"rating" double precision DEFAULT 0 NOT NULL,
	"no_show_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_phone_unique" UNIQUE("phone"),
	CONSTRAINT "users_handle_unique" UNIQUE("handle")
);
--> statement-breakpoint
CREATE TABLE "venues" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"owner_id" varchar(36) NOT NULL,
	"name" varchar(255) NOT NULL,
	"city" varchar(100) NOT NULL,
	"address" text NOT NULL,
	"amenities" json DEFAULT '[]'::json NOT NULL,
	"rating" double precision DEFAULT 0 NOT NULL,
	"is_approved" boolean DEFAULT false NOT NULL,
	"location" "geography(Point, 4326)",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "match_messages" ADD CONSTRAINT "match_messages_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_messages" ADD CONSTRAINT "match_messages_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_players" ADD CONSTRAINT "match_players_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_players" ADD CONSTRAINT "match_players_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_host_id_users_id_fk" FOREIGN KEY ("host_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_pitch_id_pitches_id_fk" FOREIGN KEY ("pitch_id") REFERENCES "public"."pitches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pitches" ADD CONSTRAINT "pitches_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "venues" ADD CONSTRAINT "venues_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "match_messages_match_idx" ON "match_messages" USING btree ("match_id");--> statement-breakpoint
CREATE UNIQUE INDEX "match_players_match_user_idx" ON "match_players" USING btree ("match_id","user_id");--> statement-breakpoint
CREATE INDEX "matches_status_idx" ON "matches" USING btree ("status");--> statement-breakpoint
CREATE INDEX "matches_scheduled_at_idx" ON "matches" USING btree ("scheduled_at");--> statement-breakpoint
CREATE INDEX "transactions_user_created_idx" ON "transactions" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "venues_city_idx" ON "venues" USING btree ("city");