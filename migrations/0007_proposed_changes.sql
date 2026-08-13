CREATE TABLE "proposed_changes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"spec_file_id" uuid NOT NULL,
	"base_revision" integer NOT NULL,
	"proposed_content" text NOT NULL,
	"instruction" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone,
	CONSTRAINT "proposed_changes_status_valid" CHECK ("proposed_changes"."status" IN ('pending', 'accepted', 'rejected')),
	CONSTRAINT "proposed_changes_base_revision_positive" CHECK ("proposed_changes"."base_revision" >= 1),
	CONSTRAINT "proposed_changes_content_not_blank" CHECK ("proposed_changes"."proposed_content" ~ '[^[:space:]]'),
	CONSTRAINT "proposed_changes_instruction_not_blank" CHECK ("proposed_changes"."instruction" ~ '[^[:space:]]'),
	CONSTRAINT "proposed_changes_decision_timestamp_paired" CHECK (CASE WHEN "proposed_changes"."status" = 'pending'
                 THEN "proposed_changes"."decided_at" IS NULL
                 ELSE "proposed_changes"."decided_at" IS NOT NULL
          END)
);
--> statement-breakpoint
ALTER TABLE "proposed_changes" ADD CONSTRAINT "proposed_changes_spec_file_id_spec_files_id_fk" FOREIGN KEY ("spec_file_id") REFERENCES "public"."spec_files"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "proposed_changes_one_pending_per_file" ON "proposed_changes" USING btree ("spec_file_id") WHERE "proposed_changes"."status" = 'pending';