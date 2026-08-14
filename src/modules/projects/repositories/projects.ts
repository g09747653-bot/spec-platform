import { and, desc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';

import type { SchemaDatabase } from '@/db';
import { projects, sessions, workflowState } from '@/db/schema';
import { queryOneRow } from '@/db/sql';

import type { OwnerScope } from '@/db/owner-scope';

/** What the creation statement returns. Validated, because raw SQL is a boundary like any other. */
const CreatedProjectRow = z.object({
  project_id: z.uuid(),
  session_id: z.uuid(),
});

/**
 * What the project list needs, and nothing more (FR-002 AC-1).
 *
 * `stage` and `substage` are plain strings here on purpose. `projects` may not import `workflow`
 * (constitution A1 — the allowed-edge table), and the alternative — re-exporting the stage union
 * through some intermediate module — would be that import wearing a hat. The column's value is
 * already constrained to the stage vocabulary by a CHECK constraint, and the presentation layer
 * narrows it with `workflow`'s own predicate before rendering the rail (task 19).
 */
export interface ProjectSummary {
  id: string;
  name: string;
  stage: string;
  substage: string | null;
  updatedAt: Date;
}

/** One project with its session and workflow position, as a session page resumes from (FR-017). */
export interface ProjectDetail extends ProjectSummary {
  createdAt: Date;
  sessionId: string;
  initialPrompt: string;
  summary: string | null;
  qualityEnabled: boolean;
  version: number;
}

/**
 * Postgres rejects a malformed uuid with an error rather than an empty result, which would turn a
 * hand-typed URL into a 500. A non-uuid identifier cannot name a row, so it is simply not found.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Project reads and writes, every one of them scoped to an owner (NFR-005; D-13).
 *
 * The repository is constructed with a database handle and exposes methods whose **first parameter
 * is the `OwnerScope`**. The scope is not advisory: `owner_id = :userId` goes into the SQL of every
 * statement below, including the writes, so a foreign project is indistinguishable from a missing
 * one at the query level (AR-2) rather than by a comparison a caller might skip.
 */
export function createProjectRepository(db: SchemaDatabase) {
  return {
    /** Only the signed-in user's projects, most recently touched first (FR-002 AC-1). */
    async list(scope: OwnerScope): Promise<ProjectSummary[]> {
      const rows = await db
        .select({
          id: projects.id,
          name: projects.name,
          stage: workflowState.stage,
          substage: workflowState.substage,
          updatedAt: projects.updatedAt,
        })
        .from(projects)
        .innerJoin(sessions, eq(sessions.projectId, projects.id))
        .innerJoin(workflowState, eq(workflowState.sessionId, sessions.id))
        .where(eq(projects.ownerId, scope.userId))
        .orderBy(desc(projects.updatedAt));

      return rows;
    },

    /**
     * Creates the project, its session carrying the prompt verbatim, and its workflow state at
     * `interview` (FR-002 AC-2; FR-003 AC-1).
     *
     * One statement, three inserts: the production driver is Neon's HTTP driver, which has no
     * interactive transactions (D-16), so atomicity comes from chaining the inserts through CTEs.
     * A failure anywhere leaves no project behind — the alternative, three round-trips, could leave
     * a project with no session, which every later query treats as a broken row.
     */
    async createFromPrompt(
      scope: OwnerScope,
      input: { name: string; prompt: string },
    ): Promise<{ projectId: string; sessionId: string }> {
      const created = await queryOneRow(
        db,
        sql`
        WITH new_project AS (
          INSERT INTO ${projects} (owner_id, name)
          VALUES (${scope.userId}, ${input.name})
          RETURNING id
        ), new_session AS (
          INSERT INTO ${sessions} (project_id, initial_prompt)
          SELECT id, ${input.prompt} FROM new_project
          RETURNING id, project_id
        ), new_state AS (
          INSERT INTO ${workflowState} (session_id, stage, substage)
          SELECT id, 'interview', NULL FROM new_session
          RETURNING session_id
        )
        SELECT new_session.project_id AS project_id, new_session.id AS session_id
        FROM new_session JOIN new_state ON new_state.session_id = new_session.id
      `,
        CreatedProjectRow,
      );

      return { projectId: created.project_id, sessionId: created.session_id };
    },

    /** The project with its session and workflow position, or `null` when it is not this owner's. */
    async findById(scope: OwnerScope, projectId: string): Promise<ProjectDetail | null> {
      if (!UUID.test(projectId)) return null;

      const [row] = await db
        .select({
          id: projects.id,
          name: projects.name,
          createdAt: projects.createdAt,
          updatedAt: projects.updatedAt,
          sessionId: sessions.id,
          initialPrompt: sessions.initialPrompt,
          summary: sessions.summary,
          qualityEnabled: sessions.qualityEnabled,
          stage: workflowState.stage,
          substage: workflowState.substage,
          version: workflowState.version,
        })
        .from(projects)
        .innerJoin(sessions, eq(sessions.projectId, projects.id))
        .innerJoin(workflowState, eq(workflowState.sessionId, sessions.id))
        .where(and(eq(projects.id, projectId), eq(projects.ownerId, scope.userId)));

      return row ?? null;
    },

    /**
     * Renames the project and nothing else (task 76; FR-002 AC-3).
     *
     * The statement sets one column. That is the whole of AC-3 — "SHALL leave all spec content,
     * revisions, and workflow state unchanged" — expressed as the absence of any other write rather
     * than as a promise: there is no code path here that could touch a second table.
     *
     * `updated_at` moves, because the list orders by it and a rename *is* activity on the project.
     * That is metadata about the project, not content of it.
     */
    async rename(scope: OwnerScope, projectId: string, name: string): Promise<boolean> {
      if (!UUID.test(projectId)) return false;

      const updated = await db
        .update(projects)
        .set({ name, updatedAt: new Date() })
        .where(and(eq(projects.id, projectId), eq(projects.ownerId, scope.userId)))
        .returning({ id: projects.id });

      return updated.length > 0;
    },

    /**
     * Deletes the project permanently (task 76; FR-002 AC-5; DR-6; DR-7).
     *
     * One `DELETE`, and the database does the rest: every table below a project carries
     * `ON DELETE CASCADE` to `projects.id`, so sessions, workflow state, spec files, revisions,
     * reviews, proposals, rounds, answers, needs, generation runs, export records and attachment rows
     * all go with it. Deleting them here, one table at a time, would be the same rule written twice —
     * and the second copy would be the one that forgets a table added later.
     *
     * The stored **objects** are not the database's to delete; the caller collects their keys first
     * and removes them after (IR-005-AC-3).
     */
    async remove(scope: OwnerScope, projectId: string): Promise<boolean> {
      if (!UUID.test(projectId)) return false;

      const deleted = await db
        .delete(projects)
        .where(and(eq(projects.id, projectId), eq(projects.ownerId, scope.userId)))
        .returning({ id: projects.id });

      return deleted.length > 0;
    },

    /**
     * Moves the project's last-updated time, used by the list (FR-002 AC-1).
     *
     * Returns whether a row was touched, so a caller that has not already resolved ownership cannot
     * mistake "not yours" for "done".
     */
    async touch(scope: OwnerScope, projectId: string): Promise<boolean> {
      if (!UUID.test(projectId)) return false;

      const updated = await db
        .update(projects)
        .set({ updatedAt: new Date() })
        .where(and(eq(projects.id, projectId), eq(projects.ownerId, scope.userId)))
        .returning({ id: projects.id });

      return updated.length > 0;
    },
  };
}

export type ProjectRepository = ReturnType<typeof createProjectRepository>;
