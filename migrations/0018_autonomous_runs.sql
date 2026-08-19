-- ===========================================================================================
-- The autonomous run — the subject of Программа А (task 145; А-7, А-16).
--
-- A chat is driven autonomously exactly while it holds a `running` row here, and stands manually
-- exactly where the driver left it once that row is `stopped`. There is no boolean on `sessions`
-- beside it: a flag and a run answer the same question in two places, and they disagree the first
-- time a run is stopped.
--
-- Termination is written into the record rather than promised by the policy:
--   * `steps` is counted against a ceiling;
--   * `fingerprint` digests everything a move could have changed and `idle_steps` counts the
--     consecutive steps that changed none of it — which is the shape a runaway loop actually takes;
--   * `version` serialises steps and is what makes Stop authoritative against a step in flight.
--
-- The three status CHECKs are equivalences, not implications: `running`/`ended_at IS NULL` and
-- `stopped`/`stop_reason IS NOT NULL` are two spellings of one fact each, and a one-directional
-- constraint leaves the other spelling free to disagree. The partial UNIQUE index is the structural
-- half of the same idea — a session cannot hold two drivers because the database will not hold two.
--
-- `session_messages.origin` gains `driver`: the driver's one-line account of an answer it gave or a
-- decision it took. An origin rather than a prefix on the prose, so «written by the machine acting
-- for you» is a fact a walk and a badge can read rather than one a human has to re-read to recover.
-- ===========================================================================================
CREATE TABLE "autonomous_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"stop_reason" text,
	"steps" integer DEFAULT 0 NOT NULL,
	"idle_steps" integer DEFAULT 0 NOT NULL,
	"fingerprint" text,
	"version" integer DEFAULT 0 NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	CONSTRAINT "autonomous_runs_status_valid" CHECK ("autonomous_runs"."status" IN ('running', 'stopped')),
	CONSTRAINT "autonomous_runs_stop_reason_valid" CHECK ("autonomous_runs"."stop_reason" IS NULL OR "autonomous_runs"."stop_reason" IN ('completed', 'stopped-by-user', 'seed-too-thin', 'needs-unanswered', 'revision-budget', 'step-budget', 'stalled', 'gate-refused', 'provider-failed', 'human-decision-pending')),
	CONSTRAINT "autonomous_runs_ended_with_status" CHECK (("autonomous_runs"."status" = 'running') = ("autonomous_runs"."ended_at" IS NULL)),
	CONSTRAINT "autonomous_runs_stopped_names_reason" CHECK (("autonomous_runs"."status" = 'stopped') = ("autonomous_runs"."stop_reason" IS NOT NULL)),
	CONSTRAINT "autonomous_runs_counts_non_negative" CHECK ("autonomous_runs"."steps" >= 0 AND "autonomous_runs"."idle_steps" >= 0 AND "autonomous_runs"."version" >= 0)
);
--> statement-breakpoint
ALTER TABLE "session_messages" DROP CONSTRAINT "session_messages_origin_valid";--> statement-breakpoint
ALTER TABLE "autonomous_runs" ADD CONSTRAINT "autonomous_runs_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "autonomous_runs_session_id_idx" ON "autonomous_runs" USING btree ("session_id");--> statement-breakpoint
CREATE UNIQUE INDEX "autonomous_runs_one_live_per_session" ON "autonomous_runs" USING btree ("session_id") WHERE "autonomous_runs"."status" = 'running';--> statement-breakpoint
ALTER TABLE "session_messages" ADD CONSTRAINT "session_messages_origin_valid" CHECK ("session_messages"."origin" IN ('chat', 'bridge', 'driver'));