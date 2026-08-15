-- ===========================================================================================
-- A project holds many chats (amendment А-6; tasks 118 and 120).
--
-- One migration, because the three changes are one change: dropping the UNIQUE is what lets an
-- Edit session exist, and an Edit session is what makes "which chat is this row about?" a question
-- the project page and the revision history both have to answer.
-- ===========================================================================================
ALTER TABLE "sessions" DROP CONSTRAINT "sessions_project_id_unique";--> statement-breakpoint
CREATE INDEX "sessions_project_id_idx" ON "sessions" USING btree ("project_id");--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "archived" boolean DEFAULT false NOT NULL;--> statement-breakpoint

-- `title` arrives with a default, so the column is NOT NULL from the first statement and existing
-- rows need no window in which they are nameless. The backfill that follows replaces the default
-- with the project's own name: before this migration a project *was* its session, so that name is
-- what the chat has always been called, and the placeholder is only ever what a row gets when
-- nobody had better words for it (D-20's `Untitled project`, one level down).
ALTER TABLE "sessions" ADD COLUMN "title" text DEFAULT 'Untitled chat' NOT NULL;--> statement-breakpoint
UPDATE "sessions" SET "title" = "projects"."name"
  FROM "projects"
  WHERE "projects"."id" = "sessions"."project_id" AND "projects"."name" ~ '[^[:space:]]';--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_title_not_blank" CHECK ("sessions"."title" ~ '[^[:space:]]');--> statement-breakpoint

-- The cross-file edit a proposal belongs to (task 118), named by the generation run that produced
-- it. Null for every M4 refinement, then and now. Deferred for the same reason as below.
ALTER TABLE "proposed_changes" ADD COLUMN "edit_batch_id" uuid;--> statement-breakpoint
ALTER TABLE "proposed_changes" ADD CONSTRAINT "proposed_changes_edit_batch_id_generation_runs_id_fk" FOREIGN KEY ("edit_batch_id") REFERENCES "public"."generation_runs"("id") DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
CREATE INDEX "proposed_changes_edit_batch_id_idx" ON "proposed_changes" USING btree ("edit_batch_id");--> statement-breakpoint

-- ===========================================================================================
-- Which chat wrote this revision (task 118).
--
-- **`DEFERRABLE INITIALLY DEFERRED`**, and the reason is a diamond. `SET NULL` is unavailable: it
-- would be an UPDATE of a column the trigger below freezes, so deleting a project would fail on its
-- own history. `CASCADE` is worse: deleting a chat would delete the bundle it wrote. That leaves the
-- default, `NO ACTION` — and the default is checked as soon as the statement's triggers run, which
-- during a project delete is *while the cascade is still going*: `projects` fans out to `sessions`
-- and to `spec_files → spec_revisions`, and if the sessions go first the check fires against
-- revisions that are about to be deleted but are not yet. DR-6's project delete failed on exactly
-- that, in the first suite that ran after the column was added.
--
-- Deferring the check to commit makes the order irrelevant: by then the whole cascade has run and
-- both sides are gone. Deleting a session out from under history it wrote is still refused, which
-- is the property worth keeping.
-- ===========================================================================================
ALTER TABLE "spec_revisions" ADD COLUMN "source_session_id" uuid;--> statement-breakpoint
ALTER TABLE "spec_revisions" ADD CONSTRAINT "spec_revisions_source_session_id_sessions_id_fk" FOREIGN KEY ("source_session_id") REFERENCES "public"."sessions"("id") DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint

-- ===========================================================================================
-- The immutability trigger gains the new column.
--
-- Migration 0003 says the rule is "stated as its complement … so a column added later is frozen by
-- default rather than mutable by omission" — but the function it wrote enumerates columns, so a
-- column added later was in fact mutable by omission. The comment described the intent; this
-- statement is what makes it true of `source_session_id`. Which chat wrote a revision is exactly as
-- much a fact about the past as the bytes it wrote (DR-2).
-- ===========================================================================================
CREATE OR REPLACE FUNCTION spec_revisions_enforce_immutability() RETURNS trigger AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION 'spec_revisions.id is immutable (DR-2)';
  END IF;

  IF NEW.spec_file_id IS DISTINCT FROM OLD.spec_file_id THEN
    RAISE EXCEPTION 'spec_revisions.spec_file_id is immutable (DR-2)';
  END IF;

  IF NEW.revision_number IS DISTINCT FROM OLD.revision_number THEN
    RAISE EXCEPTION 'spec_revisions.revision_number is immutable (DR-2, DR-3)';
  END IF;

  IF NEW.content IS DISTINCT FROM OLD.content THEN
    RAISE EXCEPTION 'spec_revisions.content is immutable: append a new revision instead (DR-2)';
  END IF;

  IF NEW.origin IS DISTINCT FROM OLD.origin THEN
    RAISE EXCEPTION 'spec_revisions.origin is immutable (A4)';
  END IF;

  IF NEW.derived_from IS DISTINCT FROM OLD.derived_from THEN
    RAISE EXCEPTION 'spec_revisions.derived_from is immutable (A4)';
  END IF;

  IF NEW.context_attachment_ids IS DISTINCT FROM OLD.context_attachment_ids THEN
    RAISE EXCEPTION 'spec_revisions.context_attachment_ids is immutable (DR-12)';
  END IF;

  IF NEW.source_session_id IS DISTINCT FROM OLD.source_session_id THEN
    RAISE EXCEPTION 'spec_revisions.source_session_id is immutable (DR-2, task 118)';
  END IF;

  IF NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'spec_revisions.created_at is immutable (DR-2)';
  END IF;

  -- Approval is one-way: a revision the user approved cannot be quietly unapproved, which is what
  -- makes an approved revision safe to export (FR-009 AC-3, FR-012 AC-1).
  IF OLD.approved AND NOT NEW.approved THEN
    RAISE EXCEPTION 'spec_revisions.approved may only move false -> true (DR-2)';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
