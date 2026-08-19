import { and, eq, sql } from 'drizzle-orm';
import { z } from 'zod';

import type { SchemaDatabase } from '@/db';
import { projects, sessions, workflowState } from '@/db/schema';
import { queryOneRow, queryRows } from '@/db/sql';

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
  /** The primary chat's methodology (task 132), so the list names its position as that graph does. */
  methodologyId: string;
  updatedAt: Date;
  /**
   * The project's primary chat — its earliest session, which is the Generate conversation that
   * produced the bundle (А-6). Every project has one; Edit chats are added beside it.
   */
  sessionId: string;
  /**
   * How many chats the project holds. The list links straight into the chat when there is only one,
   * so a project that has never been edited opens exactly where it always did.
   */
  sessionCount: number;
}

/**
 * One project with its **primary** session and workflow position (FR-017).
 *
 * Since А-6 a project holds many chats, so "the project's session" had to become a definite one
 * rather than the only one: it is the earliest, which is the Generate chat, because an Edit chat can
 * only be created against a bundle that already exists. Callers that need a *particular* chat — the
 * session page, every session endpoint — identify it by session id and go through
 * `SessionRepository`; this is for the callers that mean "the conversation that produced this
 * bundle": the export, the refinement language, the attachment set.
 */
export interface ProjectDetail extends ProjectSummary {
  createdAt: Date;
  initialPrompt: string;
  summary: string | null;
  qualityEnabled: boolean;
  /** The primary chat's model choice (task 121); `null` is Auto — the failover chain (А-3). */
  modelId: string | null;
  /** How many times the session has reached `complete` (FR-020) — the feed's sealing count. */
  completionCount: number;
  /**
   * How the primary chat's interview speaks (У-5; task 106) and what it asks about (task 144).
   *
   * Read here because an Edit chat inherits both from the bundle's own conversation: a project
   * interviewed in plain words, in the concrete style, cannot switch register the moment its owner
   * edits it — that would read as two different interviewers on one project.
   */
  audienceProfile: string;
  interviewStyle: string;
  /** The language every generated word answers in (У-1; task 108); `null` when undetermined. */
  contentLanguage: string | null;
  version: number;
}

/**
 * Postgres rejects a malformed uuid with an error rather than an empty result, which would turn a
 * hand-typed URL into a 500. A non-uuid identifier cannot name a row, so it is simply not found.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The project's primary chat, as a join.
 *
 * `LATERAL … ORDER BY created_at ASC LIMIT 1` rather than a plain join, because a project now has
 * several sessions and a plain join would multiply every row it touches. The tiebreak on `id` makes
 * the choice total: two chats created in the same millisecond must still resolve to *one* primary,
 * or the project list would reorder itself between renders of the same data.
 */
const PRIMARY_SESSION = sql`
  JOIN LATERAL (
    SELECT ${sessions}.id, ${sessions}.initial_prompt, ${sessions}.summary,
           ${sessions}.quality_enabled, ${sessions}.methodology_id, ${sessions}.model_id,
           ${sessions}.completion_count, ${sessions}.content_language,
           ${sessions}.audience_profile, ${sessions}.interview_style
    FROM ${sessions}
    WHERE ${sessions}.project_id = ${projects}.id
    ORDER BY ${sessions}.created_at ASC, ${sessions}.id ASC
    LIMIT 1
  ) AS primary_session ON TRUE
`;

const ProjectSummaryRow = z.object({
  id: z.uuid(),
  name: z.string(),
  updated_at: z.coerce.date(),
  session_id: z.uuid(),
  stage: z.string(),
  substage: z.string().nullable(),
  methodology_id: z.string(),
  session_count: z.union([z.number(), z.string()]),
});

const ProjectDetailRow = ProjectSummaryRow.extend({
  created_at: z.coerce.date(),
  initial_prompt: z.string(),
  summary: z.string().nullable(),
  quality_enabled: z.boolean(),
  model_id: z.string().nullable(),
  completion_count: z.number().int(),
  audience_profile: z.string(),
  interview_style: z.string(),
  content_language: z.string().nullable(),
  version: z.number().int(),
});

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
    /**
     * Only the signed-in user's projects, most recently touched first (FR-002 AC-1).
     *
     * The join is to the **primary** chat, not to every chat: since А-6 a plain inner join would
     * return one row per conversation, so a project that had been edited twice would appear three
     * times in the list. `PRIMARY_SESSION` picks the earliest, and `session_count` comes along
     * because it decides where the row's link goes — into the chat when there is only one, into the
     * project's chat list when there are more.
     */
    async list(scope: OwnerScope): Promise<ProjectSummary[]> {
      const rows = await queryRows(
        db,
        sql`
          SELECT
            ${projects}.id,
            ${projects}.name,
            ${projects}.updated_at,
            primary_session.id AS session_id,
            ${workflowState}.stage,
            ${workflowState}.substage,
            primary_session.methodology_id,
            (SELECT count(*) FROM ${sessions} WHERE ${sessions}.project_id = ${projects}.id)
              AS session_count
          FROM ${projects}
          ${PRIMARY_SESSION}
          JOIN ${workflowState} ON ${workflowState}.session_id = primary_session.id
          WHERE ${projects}.owner_id = ${scope.userId}::uuid
          ORDER BY ${projects}.updated_at DESC
        `,
        ProjectSummaryRow,
      );

      return rows.map((row) => ({
        id: row.id,
        name: row.name,
        stage: row.stage,
        substage: row.substage,
        methodologyId: row.methodology_id,
        updatedAt: row.updated_at,
        sessionId: row.session_id,
        sessionCount: Number(row.session_count),
      }));
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
      input: {
        name: string;
        prompt: string;
        audience: string;
        /** Which questions the interview asks (task 144). A plain string, like `audience`. */
        style: string;
        contentLanguage: string | null;
        /**
         * The session's methodology, and the position its graph starts at (task 117).
         *
         * Optional, and absent means the parity workflow entered at `interview` — which is what
         * every caller written before methodologies existed meant, and what the column defaults to.
         */
        methodologyId?: string;
        entryStage?: string;
        entrySubstage?: string | null;
      },
    ): Promise<{ projectId: string; sessionId: string }> {
      /*
       * The fallbacks are the *schema's* defaults restated, not a workflow decision: `projects` may
       * not import `workflow` (or the methodology registry that speaks its vocabulary), so a caller
       * that has a methodology in hand passes its entry position as plain strings, and a caller that
       * does not gets what the columns would have held anyway.
       */
      const methodologyId = input.methodologyId ?? 'myspec-greenfield-v1';
      const entryStage = input.entryStage ?? 'interview';
      const entrySubstage = input.entrySubstage ?? null;

      const created = await queryOneRow(
        db,
        sql`
        WITH new_project AS (
          INSERT INTO ${projects} (owner_id, name)
          VALUES (${scope.userId}, ${input.name})
          RETURNING id
        ), new_session AS (
          INSERT INTO ${sessions} (project_id, title, initial_prompt, audience_profile, interview_style, content_language, methodology_id)
          SELECT id, ${input.name}, ${input.prompt}, ${input.audience}, ${input.style}, ${input.contentLanguage}, ${methodologyId} FROM new_project
          RETURNING id, project_id
        ), new_state AS (
          INSERT INTO ${workflowState} (session_id, stage, substage)
          SELECT id, ${entryStage}, ${entrySubstage} FROM new_session
          RETURNING session_id
        )
        SELECT new_session.project_id AS project_id, new_session.id AS session_id
        FROM new_session JOIN new_state ON new_state.session_id = new_session.id
      `,
        CreatedProjectRow,
      );

      return { projectId: created.project_id, sessionId: created.session_id };
    },

    /** The project with its primary chat and that chat's position, or `null` if not this owner's. */
    async findById(scope: OwnerScope, projectId: string): Promise<ProjectDetail | null> {
      if (!UUID.test(projectId)) return null;

      const rows = await queryRows(
        db,
        sql`
          SELECT
            ${projects}.id,
            ${projects}.name,
            ${projects}.created_at,
            ${projects}.updated_at,
            primary_session.id AS session_id,
            primary_session.initial_prompt,
            primary_session.summary,
            primary_session.quality_enabled,
            primary_session.methodology_id,
            primary_session.model_id,
            primary_session.completion_count,
            primary_session.audience_profile,
            primary_session.interview_style,
            primary_session.content_language,
            ${workflowState}.stage,
            ${workflowState}.substage,
            ${workflowState}.version,
            (SELECT count(*) FROM ${sessions} WHERE ${sessions}.project_id = ${projects}.id)
              AS session_count
          FROM ${projects}
          ${PRIMARY_SESSION}
          JOIN ${workflowState} ON ${workflowState}.session_id = primary_session.id
          WHERE ${projects}.id = ${projectId}::uuid
            AND ${projects}.owner_id = ${scope.userId}::uuid
        `,
        ProjectDetailRow,
      );

      const row = rows[0];
      if (row === undefined) return null;

      return {
        id: row.id,
        name: row.name,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        sessionId: row.session_id,
        sessionCount: Number(row.session_count),
        initialPrompt: row.initial_prompt,
        summary: row.summary,
        qualityEnabled: row.quality_enabled,
        methodologyId: row.methodology_id,
        modelId: row.model_id,
        completionCount: row.completion_count,
        audienceProfile: row.audience_profile,
        interviewStyle: row.interview_style,
        contentLanguage: row.content_language,
        stage: row.stage,
        substage: row.substage,
        version: row.version,
      };
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
