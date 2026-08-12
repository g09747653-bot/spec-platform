CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text,
	"name" text,
	"email_verified" timestamp with time zone,
	"image" text,
	"provider_account_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"initial_prompt" text NOT NULL,
	"summary" text,
	"quality_enabled" boolean DEFAULT false NOT NULL,
	"completion_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_project_id_unique" UNIQUE("project_id")
);
--> statement-breakpoint
CREATE TABLE "workflow_state" (
	"session_id" uuid PRIMARY KEY NOT NULL,
	"stage" text NOT NULL,
	"substage" text,
	"pending_action" jsonb,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workflow_state_stage_valid" CHECK ("workflow_state"."stage" IN ('interview', 'constitution', 'requirements', 'solution', 'tasks', 'quality', 'complete')),
	CONSTRAINT "workflow_state_substage_valid" CHECK (("workflow_state"."stage" IN ('interview', 'complete') AND "workflow_state"."substage" IS NULL)
          OR ("workflow_state"."stage" IN ('constitution', 'requirements', 'solution', 'tasks', 'quality')
              AND "workflow_state"."substage" IS NOT NULL
              AND "workflow_state"."substage" IN ('collect', 'generate', 'review')))
);
--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_state" ADD CONSTRAINT "workflow_state_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "projects_owner_id_idx" ON "projects" USING btree ("owner_id");