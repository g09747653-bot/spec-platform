-- Where a project's files actually are (task 160).
--
-- The loop indexes projects by the id its bundle carries, and the directory that holds them is a
-- different fact: `<WORKSPACE_ROOT_PATH>/<whatever the operator called it>`. Until now nothing
-- needed the second one, because every entry point was handed a directory by the caller. «Красный
-- CI» needs it: the dashboard's Возобновить button has a project on screen and has to name the
-- directory whose freeze it is lifting, and asking a browser to supply a host path would be the
-- one thing the workspace boundary exists to prevent.
--
-- Nullable, because a database recovered from a `handoff/` tree learns it on the first import and a
-- row written before this migration has not been imported since.

ALTER TABLE projects ADD COLUMN workspace_dir TEXT;
