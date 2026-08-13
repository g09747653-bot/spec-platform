CREATE TABLE "attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"file_name" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"blob_key" text NOT NULL,
	"parse_status" text DEFAULT 'pending' NOT NULL,
	"parse_reason" text,
	"extracted_text" text,
	"attached_at_stage" text NOT NULL,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attachments_blob_key_unique" UNIQUE("blob_key"),
	CONSTRAINT "attachments_file_name_not_blank" CHECK ("attachments"."file_name" ~ '[^[:space:]]'),
	CONSTRAINT "attachments_size_bytes_positive" CHECK ("attachments"."size_bytes" > 0),
	CONSTRAINT "attachments_parse_status_valid" CHECK ("attachments"."parse_status" IN ('pending', 'ok', 'failed', 'passthrough')),
	CONSTRAINT "attachments_attached_at_stage_valid" CHECK ("attachments"."attached_at_stage" IN ('interview', 'constitution', 'requirements', 'solution', 'tasks', 'quality', 'complete')),
	CONSTRAINT "attachments_extracted_text_matches_status" CHECK (CASE WHEN "attachments"."parse_status" = 'ok'
                 THEN "attachments"."extracted_text" IS NOT NULL
                 ELSE "attachments"."extracted_text" IS NULL
           END),
	CONSTRAINT "attachments_parse_reason_matches_status" CHECK (CASE WHEN "attachments"."parse_status" = 'failed'
                 THEN "attachments"."parse_reason" IS NOT NULL
                 ELSE "attachments"."parse_reason" IS NULL
           END)
);
--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "attachments_session_id_idx" ON "attachments" USING btree ("session_id");