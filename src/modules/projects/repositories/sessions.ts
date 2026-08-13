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
  /** Plain strings: `projects` may not import `workflow` (see the note on `ProjectSummary`). */
  stage: string;
  substage: string | null;
  version: number;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

export type SessionRepository = ReturnType<typeof createSessionRepository>;
