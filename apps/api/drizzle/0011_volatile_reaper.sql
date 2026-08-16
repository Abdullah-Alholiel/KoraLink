CREATE TYPE "public"."DisputeStatus" AS ENUM('opened', 'under_review', 'resolved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."DisputeType" AS ENUM('no_show', 'double_booking', 'pitch_condition', 'unrecognized_charge', 'other');--> statement-breakpoint
CREATE TYPE "public"."ReportStatus" AS ENUM('open', 'reviewing', 'resolved', 'dismissed');--> statement-breakpoint
CREATE TYPE "public"."SettlementStatus" AS ENUM('pending', 'paid', 'failed');--> statement-breakpoint
CREATE TYPE "public"."VerificationStatus" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
ALTER TYPE "public"."ReferenceType" ADD VALUE 'SETTLEMENT';--> statement-breakpoint
ALTER TYPE "public"."ReferenceType" ADD VALUE 'PAYOUT';--> statement-breakpoint
ALTER TYPE "public"."ReferenceType" ADD VALUE 'ADJUSTMENT';--> statement-breakpoint
CREATE TABLE "app_settings" (
	"key" varchar(100) PRIMARY KEY NOT NULL,
	"value" json NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"admin_id" varchar(36) NOT NULL,
	"action" varchar(100) NOT NULL,
	"entity_type" varchar(100) NOT NULL,
	"entity_id" varchar(36),
	"before" json,
	"after" json,
	"ip" varchar(45),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dispute_messages" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"dispute_id" varchar(36) NOT NULL,
	"author_id" varchar(36) NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "disputes" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"match_id" varchar(36),
	"reporter_id" varchar(36) NOT NULL,
	"respondent_id" varchar(36),
	"type" "DisputeType" NOT NULL,
	"status" "DisputeStatus" DEFAULT 'opened' NOT NULL,
	"evidence" json DEFAULT '[]'::json NOT NULL,
	"decision" text,
	"decided_by" varchar(36),
	"internal_note" text,
	"policy_ref" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"reporter_id" varchar(36) NOT NULL,
	"subject_type" varchar(50) NOT NULL,
	"subject_id" varchar(36) NOT NULL,
	"reason" text NOT NULL,
	"status" "ReportStatus" DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settlements" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"venue_id" varchar(36) NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"status" "SettlementStatus" DEFAULT 'pending' NOT NULL,
	"payout_ref" varchar(255),
	"paid_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "venue_verifications" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"venue_id" varchar(36) NOT NULL,
	"legal_entity_name" varchar(255) NOT NULL,
	"commercial_reg" varchar(50),
	"tax_id" varchar(50),
	"iban" varchar(34),
	"manager_name" varchar(255),
	"manager_phone" varchar(20),
	"status" "VerificationStatus" DEFAULT 'pending' NOT NULL,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reviewed_by" varchar(36),
	"reviewed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "pitches" ADD COLUMN "is_active" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "pitches" ADD COLUMN "images" json DEFAULT '[]'::json NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "banned_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "suspended_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "verification_status" "VerificationStatus" DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "last_seen_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_admin_id_users_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispute_messages" ADD CONSTRAINT "dispute_messages_dispute_id_disputes_id_fk" FOREIGN KEY ("dispute_id") REFERENCES "public"."disputes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispute_messages" ADD CONSTRAINT "dispute_messages_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_reporter_id_users_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_respondent_id_users_id_fk" FOREIGN KEY ("respondent_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_reporter_id_users_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "venue_verifications" ADD CONSTRAINT "venue_verifications_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "venue_verifications" ADD CONSTRAINT "venue_verifications_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_logs_admin_idx" ON "audit_logs" USING btree ("admin_id");--> statement-breakpoint
CREATE INDEX "audit_logs_entity_idx" ON "audit_logs" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "audit_logs_created_idx" ON "audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "dispute_messages_dispute_idx" ON "dispute_messages" USING btree ("dispute_id");--> statement-breakpoint
CREATE INDEX "disputes_status_idx" ON "disputes" USING btree ("status");--> statement-breakpoint
CREATE INDEX "disputes_match_idx" ON "disputes" USING btree ("match_id");--> statement-breakpoint
CREATE INDEX "reports_status_idx" ON "reports" USING btree ("status");--> statement-breakpoint
CREATE INDEX "settlements_venue_idx" ON "settlements" USING btree ("venue_id");--> statement-breakpoint
CREATE INDEX "venue_verifications_venue_idx" ON "venue_verifications" USING btree ("venue_id");