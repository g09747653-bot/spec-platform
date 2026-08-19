-- The loop's core schema (task 152; бандл A0 §Data Model).
--
-- Transcribed from the A0 solution's DDL. Two deliberate strengthenings, both about the disk being
-- the source of truth and the database being an index of it:
--
--   * `tasks.status` and `milestones.status` carry `NOT NULL DEFAULT 'PENDING'` — a row imported
--     from a `task_*.json` that omitted its status is a PENDING task, not a refused import;
--   * every foreign key is declared `ON DELETE CASCADE` exactly as A0 writes it, and connections
--     enable `foreign_keys` (see `db/open.ts`) so the cascades are real rather than decorative.
--
-- Identifiers are TEXT and come from the handoff files, never from the database: a project rebuilt
-- from `handoff/` after the SQLite file is deleted must land on the same ids it had before.

CREATE TABLE projects (
    project_id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    status TEXT NOT NULL CHECK (status IN ('ACTIVE', 'PAUSED', 'COMPLETED', 'FAILED'))
);

CREATE TABLE milestones (
    milestone_id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    depends_on TEXT,
    position INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'PENDING'
        CHECK (status IN ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'FAILED')),
    FOREIGN KEY (project_id) REFERENCES projects (project_id) ON DELETE CASCADE
);

CREATE TABLE tasks (
    task_id TEXT PRIMARY KEY,
    milestone_id TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    tech_stack TEXT NOT NULL
        CHECK (tech_stack IN ('nodejs', 'python', 'go', 'rust', 'generic')),
    files_to_edit TEXT NOT NULL,
    unit_test_cmd TEXT,
    e2e_test_cmd TEXT,
    expected_artifacts TEXT NOT NULL,
    depends_on TEXT,
    position INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'PENDING'
        CHECK (status IN ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'FAILED', 'BLOCKED', 'PAUSED')),
    FOREIGN KEY (milestone_id) REFERENCES milestones (milestone_id) ON DELETE CASCADE
);

CREATE TABLE reports (
    report_id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL,
    executor_id TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('SUCCESS', 'FAILED', 'BLOCKED')),
    tests_total INTEGER DEFAULT 0,
    tests_passed INTEGER DEFAULT 0,
    tests_failed INTEGER DEFAULT 0,
    errors TEXT,
    block_reason TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (task_id) REFERENCES tasks (task_id) ON DELETE CASCADE
);

CREATE TABLE agent_logs (
    log_id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id TEXT NOT NULL,
    task_id TEXT,
    agent_role TEXT NOT NULL,
    message TEXT NOT NULL,
    log_level TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES projects (project_id) ON DELETE CASCADE,
    FOREIGN KEY (task_id) REFERENCES tasks (task_id) ON DELETE CASCADE
);

CREATE TABLE agent_decisions (
    decision_id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    task_id TEXT,
    title TEXT NOT NULL,
    rationale TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES projects (project_id) ON DELETE CASCADE,
    FOREIGN KEY (task_id) REFERENCES tasks (task_id) ON DELETE CASCADE
);

-- The feed reads the tail of one project's log on every page load and on every reconnect; without
-- this it is a full scan of the noisiest table in the schema.
CREATE INDEX agent_logs_project_recent ON agent_logs (project_id, log_id DESC);

CREATE INDEX milestones_of_project ON milestones (project_id, position);
CREATE INDEX tasks_of_milestone ON tasks (milestone_id, position);
CREATE INDEX reports_of_task ON reports (task_id, created_at);
