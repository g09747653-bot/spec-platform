import { and, eq, sql } from 'drizzle-orm';
import { z } from 'zod';

import type { SchemaDatabase } from '@/db';
import { projects, sessions, workflowState } from '@/db/schema';
import { queryRows } from '@/db/sql';

import type { OwnerScope } from '@/db/owner-scope';

/** A session resolved together with the project that owns it. */
export interface OwnedSession {
  id: string;
  projectId: string;
  projectName: string;
  initialPrompt: string;
  summary: string | null;
  qualityEnabled: boolean;
  /** Who the interview is addressing (У-5; task 106) — `non-technical` or `technical`. */
  audienceProfile: string;
  /** The language every generated word answers in (У-1; task 108); `null` when undetermined. */
  contentLanguage: string | null;
  /** The methodology whose graph this session walks (task 117). A plain string, for the same reason. */
  methodologyId: string;
  /** The model this chat's agent calls use (task 121); `null` is Auto — the failover chain (А-3). */
  modelId: string | null;
  /** Plain strings: `projects` may not import `workflow` (see the note on `ProjectSummary`). */
  stage: string;
  substage: string | null;
  version: number;
}

/**
 * Everything the session surface renders about one chat (А-6; task 118).
 *
 * `OwnedSession` answers "may this caller act on this session, and where is it?" and is what every
 * endpoint uses. This answers "what does this conversation look like?", which since А-6 is a
 * different question from "what does this project look like": a project holds several chats, each
 * with its own title, its own graph and its own position.
 */
export interface SessionDetail extends OwnedSession {
  title: string;
  archived: boolean;
  /** When the chat began — the timestamp its seed block carries. */
  createdAt: Date;
  completionCount: number;
  /** Whether this is the project's first chat, which is the one unattributed history belongs to. */
  primary: boolean;
}

/** One row of the project's chat list (task 120). */
export interface ProjectChat {
  id: string;
  title: string;
  archived: boolean;
  methodologyId: string;
  stage: string;
  substage: string | null;
  completionCount: number;
  createdAt: Date;
  /**
   * The newest persisted moment of this chat — its feed's last block (task 120).
   *
   * Derived from rows, never from a clock in the browser: the age label the list prints is computed
   * from this and from the **database's** `now()`, so two people looking at the same list see the
   * same number and a clock skewed on one laptop cannot make a chat look a day older than it is.
   */
  lastActivityAt: Date;
  /** Seconds between `lastActivityAt` and the database's own clock, at read time. */
  ageSeconds: number;
}

export interface ChatFilter {
  /** `generate` and `edit` are the two chat classes; absent means both. */
  methodologyIds?: readonly string[];
  archived?: 'active' | 'archived' | 'all';
  /** Case-insensitive substring of the chat's title. */
  search?: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The newest persisted moment of a chat.
 *
 * Three tables, because three of them carry the blocks the feed shows: the rounds it answered, the
 * runs it started, and the revisions it wrote. `created_at` of the session itself is the floor — a
 * chat that has done nothing yet is as old as itself, not infinitely old.
 */
const LAST_ACTIVITY = sql`
  GREATEST(
    ${sessions}.created_at,
    COALESCE((SELECT max(presented_at) FROM question_rounds
              WHERE question_rounds.session_id = ${sessions}.id), ${sessions}.created_at),
    COALESCE((SELECT max(created_at) FROM generation_runs
              WHERE generation_runs.session_id = ${sessions}.id), ${sessions}.created_at),
    COALESCE((SELECT max(created_at) FROM spec_revisions
              WHERE spec_revisions.source_session_id = ${sessions}.id), ${sessions}.created_at)
  )
`;

const SessionDetailRow = z.object({
  id: z.uuid(),
  project_id: z.uuid(),
  project_name: z.string(),
  title: z.string(),
  archived: z.boolean(),
  created_at: z.coerce.date(),
  initial_prompt: z.string(),
  summary: z.string().nullable(),
  quality_enabled: z.boolean(),
  audience_profile: z.string(),
  content_language: z.string().nullable(),
  methodology_id: z.string(),
  model_id: z.string().nullable(),
  completion_count: z.number().int(),
  stage: z.string(),
  substage: z.string().nullable(),
  version: z.number().int(),
  primary_session: z.boolean(),
});

const ProjectChatRow = z.object({
  id: z.uuid(),
  title: z.string(),
  archived: z.boolean(),
  methodology_id: z.string(),
  stage: z.string(),
  substage: z.string().nullable(),
  completion_count: z.number().int(),
  created_at: z.coerce.date(),
  last_activity_at: z.coerce.date(),
  age_seconds: z.union([z.number(), z.string()]),
});

/**
 * Session reads, scoped to an owner (NFR-005 AC-1).
 *
 * A session is two joins from `projects.owner_id`, and that resolution happens **in SQL** as a join
 * predicate rather than by fetching the row and comparing afterwards (solution.md — Security
 * Architecture). The generation and decision endpoints of tasks 20–21 identify their target by
 * session id, so this is the query that stops one user's session id from working in another user's
 * request.
 */
export function createSessionRepository(db: SchemaDatabase) {
  return {
    async findById(scope: OwnerScope, sessionId: string): Promise<OwnedSession | null> {
      if (!UUID.test(sessionId)) return null;

      const [row] = await db
        .select({
          id: sessions.id,
          projectId: projects.id,
          projectName: projects.name,
          initialPrompt: sessions.initialPrompt,
          summary: sessions.summary,
          qualityEnabled: sessions.qualityEnabled,
          audienceProfile: sessions.audienceProfile,
          contentLanguage: sessions.contentLanguage,
          methodologyId: sessions.methodologyId,
          modelId: sessions.modelId,
          stage: workflowState.stage,
          substage: workflowState.substage,
          version: workflowState.version,
        })
        .from(sessions)
        .innerJoin(projects, eq(projects.id, sessions.projectId))
        .innerJoin(workflowState, eq(workflowState.sessionId, sessions.id))
        .where(and(eq(sessions.id, sessionId), eq(projects.ownerId, scope.userId)));

      return row ?? null;
    },

    /**
     * Everything the session surface needs about one chat, or `null` when it is not this owner's.
     *
     * The session page is addressed by session id since А-6, so this replaces the project lookup it
     * used to do: a project no longer resolves to one conversation, and picking "the" session of a
     * project would have quietly shown the wrong chat the moment an Edit chat existed.
     */
    async findDetailById(scope: OwnerScope, sessionId: string): Promise<SessionDetail | null> {
      if (!UUID.test(sessionId)) return null;

      const rows = await queryRows(
        db,
        sql`
          SELECT
            ${sessions}.id,
            ${sessions}.project_id,
            ${projects}.name AS project_name,
            ${sessions}.title,
            ${sessions}.archived,
            ${sessions}.created_at,
            ${sessions}.initial_prompt,
            ${sessions}.summary,
            ${sessions}.quality_enabled,
            ${sessions}.audience_profile,
            ${sessions}.content_language,
            ${sessions}.methodology_id,
            ${sessions}.model_id,
            ${sessions}.completion_count,
            ${workflowState}.stage,
            ${workflowState}.substage,
            ${workflowState}.version,
            ${sessions}.id = (
              SELECT inner_sessions.id FROM ${sessions} AS inner_sessions
              WHERE inner_sessions.project_id = ${sessions}.project_id
              ORDER BY inner_sessions.created_at ASC, inner_sessions.id ASC
              LIMIT 1
            ) AS primary_session
          FROM ${sessions}
          JOIN ${projects} ON ${projects}.id = ${sessions}.project_id
          JOIN ${workflowState} ON ${workflowState}.session_id = ${sessions}.id
          WHERE ${sessions}.id = ${sessionId}::uuid
            AND ${projects}.owner_id = ${scope.userId}::uuid
        `,
        SessionDetailRow,
      );

      const row = rows[0];
      if (row === undefined) return null;

      return {
        id: row.id,
        projectId: row.project_id,
        projectName: row.project_name,
        title: row.title,
        archived: row.archived,
        createdAt: row.created_at,
        initialPrompt: row.initial_prompt,
        summary: row.summary,
        qualityEnabled: row.quality_enabled,
        audienceProfile: row.audience_profile,
        contentLanguage: row.content_language,
        methodologyId: row.methodology_id,
        modelId: row.model_id,
        completionCount: row.completion_count,
        stage: row.stage,
        substage: row.substage,
        version: row.version,
        primary: row.primary_session,
      };
    },

    /**
     * The project's chats, newest activity first (task 120).
     *
     * Filters compose, all three of them in SQL, because a search that only looked at the page it
     * had already loaded would quietly mean "search the Active tab" — and AC-1 requires searching
     * inside Archived to work. `methodologyIds` is how the Generate | Edit tabs are expressed: the
     * caller renders the tab from the registry's chat classes and passes the ids, so this stays a
     * data question and the repository keeps knowing nothing about methodologies.
     */
    async listForProject(
      scope: OwnerScope,
      projectId: string,
      filter: ChatFilter = {},
    ): Promise<ProjectChat[]> {
      if (!UUID.test(projectId)) return [];

      const archived = filter.archived ?? 'active';
      const search = filter.search?.trim() ?? '';
      const methodologyIds = filter.methodologyIds;

      const rows = await queryRows(
        db,
        sql`
          SELECT
            ${sessions}.id,
            ${sessions}.title,
            ${sessions}.archived,
            ${sessions}.methodology_id,
            ${workflowState}.stage,
            ${workflowState}.substage,
            ${sessions}.completion_count,
            ${sessions}.created_at,
            ${LAST_ACTIVITY} AS last_activity_at,
            EXTRACT(EPOCH FROM (now() - ${LAST_ACTIVITY})) AS age_seconds
          FROM ${sessions}
          JOIN ${projects} ON ${projects}.id = ${sessions}.project_id
          JOIN ${workflowState} ON ${workflowState}.session_id = ${sessions}.id
          WHERE ${sessions}.project_id = ${projectId}::uuid
            AND ${projects}.owner_id = ${scope.userId}::uuid
            AND ${
              archived === 'all'
                ? sql`TRUE`
                : sql`${sessions}.archived = ${archived === 'archived'}`
            }
            AND ${
              search === ''
                ? sql`TRUE`
                : sql`${sessions}.title ILIKE ${'%' + escapeLike(search) + '%'} ESCAPE '\\'`
            }
            AND ${
              methodologyIds === undefined
                ? sql`TRUE`
                : /*
                   * A jsonb array unnested in SQL, not a bound array parameter: Drizzle expands an
                   * array argument into one placeholder per element, so `= ANY($5)` arrives holding
                   * a single string and Postgres refuses it as a malformed array literal. The same
                   * pattern `markNeedsSatisfied` uses, for the same reason.
                   */
                  sql`${sessions}.methodology_id IN (
                      SELECT jsonb_array_elements_text(${JSON.stringify([...methodologyIds])}::jsonb)
                    )`
            }
          ORDER BY ${LAST_ACTIVITY} DESC, ${sessions}.id ASC
        `,
        ProjectChatRow,
      );

      return rows.map((row) => ({
        id: row.id,
        title: row.title,
        archived: row.archived,
        methodologyId: row.methodology_id,
        stage: row.stage,
        substage: row.substage,
        completionCount: row.completion_count,
        createdAt: row.created_at,
        lastActivityAt: row.last_activity_at,
        ageSeconds: Math.max(0, Math.round(Number(row.age_seconds))),
      }));
    },

    /**
     * Creates a chat on an existing project, together with its workflow state (task 118).
     *
     * One statement, two inserts, for the reason `createFromPrompt` gives: the production driver has
     * no interactive transactions (D-16), and a session with no `workflow_state` row is a broken
     * session every later query has to guard against.
     */
    async createChat(
      scope: OwnerScope,
      input: {
        projectId: string;
        title: string;
        prompt: string;
        methodologyId: string;
        entryStage: string;
        entrySubstage: string | null;
        audience: string;
        contentLanguage: string | null;
      },
    ): Promise<{ sessionId: string } | null> {
      if (!UUID.test(input.projectId)) return null;

      const rows = await queryRows(
        db,
        sql`
          WITH owned AS (
            SELECT ${projects}.id FROM ${projects}
            WHERE ${projects}.id = ${input.projectId}::uuid
              AND ${projects}.owner_id = ${scope.userId}::uuid
          ), new_session AS (
            INSERT INTO ${sessions}
              (project_id, title, initial_prompt, audience_profile, content_language, methodology_id)
            SELECT id, ${input.title}, ${input.prompt}, ${input.audience},
                   ${input.contentLanguage}, ${input.methodologyId}
            FROM owned
            RETURNING id
          ), new_state AS (
            INSERT INTO ${workflowState} (session_id, stage, substage)
            SELECT id, ${input.entryStage}, ${input.entrySubstage} FROM new_session
            RETURNING session_id
          )
          SELECT new_session.id AS id
          FROM new_session JOIN new_state ON new_state.session_id = new_session.id
        `,
        z.object({ id: z.uuid() }),
      );

      const row = rows[0];
      return row === undefined ? null : { sessionId: row.id };
    },

    /**
     * Archives or restores a chat (task 120 AC-1).
     *
     * An UPDATE of one boolean, and that is the whole of "archiving is reversible and never
     * deletes": there is no path here that could remove a row, and restoring is the same call with
     * the other value.
     */
    /**
     * Records which model this chat's agent calls use (task 121).
     *
     * `null` is Auto and is a real value, so the column is set rather than cleared-by-omission: a
     * user who picks Auto after picking a model is making a choice, and it is the same choice the
     * session started with.
     */
    async setModel(scope: OwnerScope, sessionId: string, modelId: string | null): Promise<boolean> {
      if (!UUID.test(sessionId)) return false;

      const rows = await queryRows(
        db,
        sql`
          UPDATE ${sessions} SET model_id = ${modelId}
          FROM ${projects}
          WHERE ${sessions}.id = ${sessionId}::uuid
            AND ${projects}.id = ${sessions}.project_id
            AND ${projects}.owner_id = ${scope.userId}::uuid
          RETURNING ${sessions}.id AS id
        `,
        z.object({ id: z.uuid() }),
      );

      return rows.length > 0;
    },

    async setArchived(scope: OwnerScope, sessionId: string, archived: boolean): Promise<boolean> {
      if (!UUID.test(sessionId)) return false;

      const rows = await queryRows(
        db,
        sql`
          UPDATE ${sessions} SET archived = ${archived}
          FROM ${projects}
          WHERE ${sessions}.id = ${sessionId}::uuid
            AND ${projects}.id = ${sessions}.project_id
            AND ${projects}.owner_id = ${scope.userId}::uuid
          RETURNING ${sessions}.id AS id
        `,
        z.object({ id: z.uuid() }),
      );

      return rows.length > 0;
    },

    /**
     * Persists the interview summary (task 38; FR-006 AC-1(c)).
     *
     * The owner predicate rides in the UPDATE itself — the same statement-level scoping every
     * repository write carries (NFR-005 AC-1). A blank summary is refused here as the last line
     * of defence: the gate condition is "a summary exists", and persisting whitespace would
     * satisfy the letter while defeating the point.
     */
    async updateSummary(scope: OwnerScope, sessionId: string, summary: string): Promise<boolean> {
      if (!UUID.test(sessionId) || summary.trim() === '') return false;

      const rows = await queryRows(
        db,
        sql`
          UPDATE ${sessions} SET summary = ${summary.trim()}
          FROM ${projects}
          WHERE ${sessions.id} = ${sessionId}::uuid
            AND ${projects.id} = ${sessions.projectId}
            AND ${projects.ownerId} = ${scope.userId}
          RETURNING ${sessions.id} AS id
        `,
        z.object({ id: z.uuid() }),
      );

      return rows.length > 0;
    },
  };
}

/**
 * Neutralises the wildcards of `ILIKE` so a search for `100%` finds `100%`.
 *
 * Without it the search box is a small pattern language nobody documented: `%` matches everything
 * and `_` matches anything, so a title containing either becomes unfindable by typing it.
 */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`);
}

export type SessionRepository = ReturnType<typeof createSessionRepository>;
