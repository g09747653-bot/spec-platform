CREATE TABLE "export_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"mode" text NOT NULL,
	"included_files" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"omitted_files" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "export_records_mode_valid" CHECK ("export_records"."mode" IN ('default', 'quality')),
	CONSTRAINT "export_records_included_is_array" CHECK (jsonb_typeof("export_records"."included_files") = 'array'),
	CONSTRAINT "export_records_omitted_is_array" CHECK (jsonb_typeof("export_records"."omitted_files") = 'array')
);
--> statement-breakpoint
ALTER TABLE "export_records" ADD CONSTRAINT "export_records_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "export_records_project_id_idx" ON "export_records" USING btree ("project_id");