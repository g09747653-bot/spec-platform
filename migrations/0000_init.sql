-- Initial migration (task 6).
--
-- Deliberately empty: Milestone 0 delivers the migration pipeline, not the data model.
-- Applying it creates Drizzle's migration journal, which is what makes every later
-- migration ordered and idempotent.
--
-- The tables themselves arrive with their milestones:
--   task 11 — users, projects, sessions, workflow_state
--   task 16 — spec_files, spec_revisions (+ the column-scoped immutability trigger, D-11)
SELECT 1;
