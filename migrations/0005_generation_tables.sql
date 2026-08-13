CREATE TABLE "generation_chunks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"sequence" integer NOT NULL,
	"delta" text NOT NULL,
	CONSTRAINT "generation_chunks_run_sequence_unique" UNIQUE("run_id","sequence"),
	CONSTRAINT "generation_chunks_sequence_non_negative" CHECK ("generation_chunks"."sequence" >= 0),
	CONSTRAINT "generation_chunks_delta_not_empty" CHECK (length("generation_chunks"."delta") > 0)
);
--> statement-breakpoint
CREATE TABLE "generation_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"stage" text NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"provider_used" text,
	"attempt" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"first_token_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	CONSTRAINT "generation_runs_stage_valid" CHECK ("generation_runs"."stage" IN ('interview', 'constitution', 'requirements', 'solution', 'tasks', 'quality')),
	CONSTRAINT "generation_runs_status_valid" CHECK ("generation_runs"."status" IN ('running', 'restarted', 'complete', 'failed')),
	CONSTRAINT "generation_runs_attempt_positive" CHECK ("generation_runs"."attempt" >= 1),
	CONSTRAINT "generation_runs_completion_paired" CHECK (("generation_runs"."status" = 'complete' AND "generation_runs"."completed_at" IS NOT NULL AND "generation_runs"."provider_used" IS NOT NULL)
          OR ("generation_runs"."status" <> 'complete' AND "generation_runs"."completed_at" IS NULL))
);
--> statement-breakpoint
ALTER TABLE "generation_chunks" ADD CONSTRAINT "generation_chunks_run_id_generation_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."generation_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generation_runs" ADD CONSTRAINT "generation_runs_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;