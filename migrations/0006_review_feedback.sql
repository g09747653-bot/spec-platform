CREATE TABLE "review_feedback" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"spec_revision_id" uuid NOT NULL,
	"outcome" text NOT NULL,
	"items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"decision" text,
	"selected_item_ids" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone,
	CONSTRAINT "review_feedback_spec_revision_unique" UNIQUE("spec_revision_id"),
	CONSTRAINT "review_feedback_outcome_valid" CHECK ("review_feedback"."outcome" IN ('pass', 'needs_revision')),
	CONSTRAINT "review_feedback_decision_valid" CHECK ("review_feedback"."decision" IS NULL OR "review_feedback"."decision" IN ('accept', 'ignore', 'request_changes')),
	CONSTRAINT "review_feedback_items_is_array" CHECK (jsonb_typeof("review_feedback"."items") = 'array'),
	CONSTRAINT "review_feedback_items_have_stable_ids" CHECK (NOT jsonb_path_exists(
            "review_feedback"."items",
            '$[*] ? (!exists(@.id) || @.id.type() != "string" || @.id == "")'
          )),
	CONSTRAINT "review_feedback_selection_matches_decision" CHECK (CASE WHEN "review_feedback"."decision" = 'request_changes'
                 THEN "review_feedback"."selected_item_ids" IS NOT NULL
                      AND jsonb_typeof("review_feedback"."selected_item_ids") = 'array'
                      AND jsonb_array_length("review_feedback"."selected_item_ids") > 0
                 ELSE "review_feedback"."selected_item_ids" IS NULL
          END),
	CONSTRAINT "review_feedback_decision_timestamp_paired" CHECK (("review_feedback"."decision" IS NULL AND "review_feedback"."decided_at" IS NULL)
          OR ("review_feedback"."decision" IS NOT NULL AND "review_feedback"."decided_at" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "review_feedback" ADD CONSTRAINT "review_feedback_spec_revision_id_spec_revisions_id_fk" FOREIGN KEY ("spec_revision_id") REFERENCES "public"."spec_revisions"("id") ON DELETE cascade ON UPDATE no action;