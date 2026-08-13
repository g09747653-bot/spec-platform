CREATE TABLE "answers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"round_id" uuid NOT NULL,
	"question_id" text,
	"selected_option_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"free_text" text,
	"answered_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "answers_round_question_unique" UNIQUE("round_id","question_id"),
	CONSTRAINT "answers_selected_option_ids_is_array" CHECK (jsonb_typeof("answers"."selected_option_ids") = 'array'),
	CONSTRAINT "answers_carry_substance" CHECK (jsonb_array_length("answers"."selected_option_ids") > 0
          OR ("answers"."free_text" IS NOT NULL AND "answers"."free_text" ~ '[^[:space:]]'))
);
--> statement-breakpoint
CREATE TABLE "information_needs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"stage" text NOT NULL,
	"name" text NOT NULL,
	"satisfied_by_round" uuid,
	CONSTRAINT "information_needs_session_stage_name_unique" UNIQUE("session_id","stage","name"),
	CONSTRAINT "information_needs_stage_valid" CHECK ("information_needs"."stage" IN ('interview', 'constitution', 'requirements', 'solution', 'tasks', 'quality')),
	CONSTRAINT "information_needs_name_not_blank" CHECK ("information_needs"."name" ~ '[^[:space:]]')
);
--> statement-breakpoint
CREATE TABLE "question_rounds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"stage" text NOT NULL,
	"round_number" integer NOT NULL,
	"questions" jsonb NOT NULL,
	"presented_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "question_rounds_session_stage_round_unique" UNIQUE("session_id","stage","round_number"),
	CONSTRAINT "question_rounds_stage_valid" CHECK ("question_rounds"."stage" IN ('interview', 'constitution', 'requirements', 'solution', 'tasks', 'quality')),
	CONSTRAINT "question_rounds_round_number_positive" CHECK ("question_rounds"."round_number" >= 1),
	CONSTRAINT "question_rounds_questions_is_object" CHECK (jsonb_typeof("question_rounds"."questions") = 'object')
);
--> statement-breakpoint
ALTER TABLE "answers" ADD CONSTRAINT "answers_round_id_question_rounds_id_fk" FOREIGN KEY ("round_id") REFERENCES "public"."question_rounds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "information_needs" ADD CONSTRAINT "information_needs_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "information_needs" ADD CONSTRAINT "information_needs_satisfied_by_round_question_rounds_id_fk" FOREIGN KEY ("satisfied_by_round") REFERENCES "public"."question_rounds"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_rounds" ADD CONSTRAINT "question_rounds_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;