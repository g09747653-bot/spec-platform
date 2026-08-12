CREATE TABLE "spec_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"spec_type" text NOT NULL,
	"file_name" text NOT NULL,
	"current_revision" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "spec_files_project_id_spec_type_unique" UNIQUE("project_id","spec_type"),
	CONSTRAINT "spec_files_spec_type_valid" CHECK ("spec_files"."spec_type" IN ('constitution', 'requirements', 'solution', 'tasks', 'quality')),
	CONSTRAINT "spec_files_file_name_valid" CHECK ("spec_files"."file_name" IN ('constitution.md', 'requirements.md', 'solution.md', 'tasks.md', 'quality.md')),
	CONSTRAINT "spec_files_file_name_matches_spec_type" CHECK ("spec_files"."file_name" = "spec_files"."spec_type" || '.md'),
	CONSTRAINT "spec_files_current_revision_non_negative" CHECK ("spec_files"."current_revision" >= 0)
);
--> statement-breakpoint
CREATE TABLE "spec_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"spec_file_id" uuid NOT NULL,
	"revision_number" integer NOT NULL,
	"content" text NOT NULL,
	"approved" boolean DEFAULT false NOT NULL,
	"origin" text DEFAULT 'parity' NOT NULL,
	"derived_from" uuid,
	"context_attachment_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "spec_revisions_file_revision_unique" UNIQUE("spec_file_id","revision_number"),
	CONSTRAINT "spec_revisions_revision_number_positive" CHECK ("spec_revisions"."revision_number" >= 1),
	CONSTRAINT "spec_revisions_origin_valid" CHECK ("spec_revisions"."origin" IN ('parity', 'enrichment')),
	CONSTRAINT "spec_revisions_origin_derivation_paired" CHECK (("spec_revisions"."origin" = 'parity' AND "spec_revisions"."derived_from" IS NULL)
          OR ("spec_revisions"."origin" = 'enrichment' AND "spec_revisions"."derived_from" IS NOT NULL)),
	CONSTRAINT "spec_revisions_content_not_blank" CHECK ("spec_revisions"."content" ~ '[^[:space:]]'),
	CONSTRAINT "spec_revisions_context_attachment_ids_is_array" CHECK (jsonb_typeof("spec_revisions"."context_attachment_ids") = 'array')
);
--> statement-breakpoint
ALTER TABLE "spec_files" ADD CONSTRAINT "spec_files_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spec_revisions" ADD CONSTRAINT "spec_revisions_spec_file_id_spec_files_id_fk" FOREIGN KEY ("spec_file_id") REFERENCES "public"."spec_files"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spec_revisions" ADD CONSTRAINT "spec_revisions_derived_from_spec_revisions_id_fk" FOREIGN KEY ("derived_from") REFERENCES "public"."spec_revisions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
--> statement-breakpoint
-- ===========================================================================================
-- Column-scoped immutability (DR-2; D-11; task 16).
--
-- A CHECK constraint cannot see the previous row, so the immutability contract is a trigger. The
-- rule is stated as its complement — *everything except `approved` is frozen* — so a column added
-- later is frozen by default rather than mutable by omission.
--
-- Each column raises its own message: a test asserting "content cannot change" must fail for that
-- reason and not because some other column happened to differ.
-- ===========================================================================================
CREATE FUNCTION spec_revisions_enforce_immutability() RETURNS trigger AS $$
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
--> statement-breakpoint
CREATE TRIGGER spec_revisions_immutability
  BEFORE UPDATE ON spec_revisions
  FOR EACH ROW EXECUTE FUNCTION spec_revisions_enforce_immutability();
--> statement-breakpoint
-- ===========================================================================================
-- Deletion is refused except through the project cascade (FR-012 AC-5; DR-6).
--
-- How a cascade is recognised: PostgreSQL deletes the parent row first and then fires the foreign
-- key's cascade on the children, so inside a child's BEFORE DELETE trigger the parent is *already
-- gone*. A direct `DELETE FROM spec_revisions` therefore still sees its `spec_files` row, and a
-- direct `DELETE FROM spec_files` still sees its `projects` row.
--
-- Both tables need the rule. Guarding only revisions would leave a hole: deleting a spec file
-- directly would make its revisions vanish "by cascade", which is exactly the history loss DR-2 and
-- FR-012 AC-5 forbid.
-- ===========================================================================================
CREATE FUNCTION spec_revisions_deny_direct_delete() RETURNS trigger AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM spec_files WHERE id = OLD.spec_file_id) THEN
    RAISE EXCEPTION 'spec_revisions rows are retained for the life of the project (FR-012 AC-5): delete the project instead';
  END IF;

  RETURN OLD;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER spec_revisions_no_direct_delete
  BEFORE DELETE ON spec_revisions
  FOR EACH ROW EXECUTE FUNCTION spec_revisions_deny_direct_delete();
--> statement-breakpoint
CREATE FUNCTION spec_files_deny_direct_delete() RETURNS trigger AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM projects WHERE id = OLD.project_id) THEN
    RAISE EXCEPTION 'spec_files rows are retained for the life of the project (FR-012 AC-5): delete the project instead';
  END IF;

  RETURN OLD;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER spec_files_no_direct_delete
  BEFORE DELETE ON spec_files
  FOR EACH ROW EXECUTE FUNCTION spec_files_deny_direct_delete();
