-- ===========================================================================================
-- The conversation's own turns (task 132; checklist rows `1.2-3` and `1.2-4`).
--
-- One table for two kinds of message, because they are one kind of thing — prose written at a
-- position, by the user or by the interviewer:
--
--   * `chat`   — a free-chat exchange. It lived in the browser until now, so a reload dropped it;
--                the reference product's saved session contains its chat verbatim (А-12).
--   * `bridge` — the interviewer's short commentary between two rounds, naming the contradictions
--                it found and what the next round will probe (Эталон §1.2).
--
-- `stage`/`substage` are recorded at write time and never updated: the feed's `data-msg-stage` is
-- supposed to say what the session was doing when a message was written, and a position stamped at
-- render time says where the session is now instead.
--
-- No trigger. These rows are append-only by construction — nothing in the product updates one —
-- and the immutability machinery of `spec_revisions` exists because approval mutates that row,
-- which is a problem this table does not have.
-- ===========================================================================================
CREATE TABLE "session_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"role" text NOT NULL,
	"origin" text NOT NULL,
	"stage" text NOT NULL,
	"substage" text,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "session_messages_role_valid" CHECK ("session_messages"."role" IN ('user', 'assistant')),
	CONSTRAINT "session_messages_origin_valid" CHECK ("session_messages"."origin" IN ('chat', 'bridge')),
	CONSTRAINT "session_messages_stage_valid" CHECK ("session_messages"."stage" IN ('interview', 'constitution', 'requirements', 'solution', 'tasks', 'quality', 'complete')),
	CONSTRAINT "session_messages_substage_valid" CHECK (("session_messages"."stage" IN ('interview', 'complete') AND "session_messages"."substage" IS NULL)
          OR ("session_messages"."stage" IN ('constitution', 'requirements', 'solution', 'tasks', 'quality')
              AND "session_messages"."substage" IS NOT NULL
              AND "session_messages"."substage" IN ('collect', 'generate', 'review'))),
	CONSTRAINT "session_messages_body_not_blank" CHECK ("session_messages"."body" ~ '[^[:space:]]')
);
--> statement-breakpoint
ALTER TABLE "session_messages" ADD CONSTRAINT "session_messages_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "session_messages_session_created_idx" ON "session_messages" USING btree ("session_id","created_at");