import { and, eq, sql } from 'drizzle-orm';
import { z } from 'zod';

import type { SchemaDatabase } from '@/db';
import { workflowState } from '@/db/schema';
import { queryRows } from '@/db/sql';

import {
  isSpecStage,
  isStage,
  isSubstage,
  type Stage,
  type StagePosition,
  type Substage,
} from '../model/stages';

/**
 * Persistence for the workflow position (FR-007 AC-1; task 19).
 *
 * `workflow` is the only module permitted to write `workflow_state` (solution.md — `workflow`), so this
 * is the only place that statement exists. The engine itself — gates, the transition table — stays pure
 * and is unit-testable without any of this (NFR-012 AC-1/AC-2); this module is the thin edge that reads
 * and writes rows.
 *
 * Reads are validated: a stage is a string in the database, and the domain type is a union. The CHECK
 * constraint makes an invalid value impossible, so a parse failure here means the schema and the model
 * have drifted — which is exactly when a loud failure is wanted.
 */

const StateRow = z.object({
  stage: z.string(),
  substage: z.string().nullable(),
  pending_action: z.unknown(),
  version: z.number().int().positive(),
});

/** A position plus the row's concurrency token and pending action. */
export type WorkflowPosition = StagePosition & {
  version: number;
  pendingAction: unknown;
};

/**
 * Narrows a stored row into the domain union.
 *
 * The CHECK constraints of task 11 make every failure below unreachable through normal writes, which is
 * exactly why they throw rather than coerce: reaching one means the schema and the stage model have
 * drifted apart, and silently repairing that would hide the drift.
 */
function toPosition(row: z.infer<typeof StateRow>): WorkflowPosition {
  const { stage, substage } = row;
  const common = { version: row.version, pendingAction: row.pending_action ?? null };

  if (!isStage(stage)) {
    throw new Error(`workflow_state.stage holds an unknown stage: ${stage}`);
  }

  if (substage === null) {
    if (isSpecStage(stage)) {
      throw new Error(`workflow_state: stage ${stage} requires a substage`);
    }

    return { stage, substage: null, ...common };
  }

  if (!isSubstage(substage)) {
    throw new Error(`workflow_state.substage holds an unknown substage: ${substage}`);
  }

  if (!isSpecStage(stage)) {
    throw new Error(`workflow_state: stage ${stage} has no substages`);
  }

  return { stage, substage, ...common };
}

export function createWorkflowStateRepository(db: SchemaDatabase) {
  return {
    /**
     * The whole position in one query (task 19 AC-2): stage, substage, pending action and version.
     * A page rendering the rail after a reload needs exactly this and nothing more (FR-017 AC-1).
     */
    async find(sessionId: string): Promise<WorkflowPosition | null> {
      const rows = await queryRows(
        db,
        sql`
          SELECT stage, substage, pending_action, version
          FROM ${workflowState}
          WHERE session_id = ${sessionId}::uuid
        `,
        StateRow,
      );

      const row = rows[0];
      return row === undefined ? null : toPosition(row);
    },

    /**
     * Moves the session to a new position, guarded by the version it was read at.
     *
     * Optimistic concurrency, not a lock: two requests that both try to advance the same session cannot
     * both succeed, because the second one's `version` no longer matches and the update touches no row
     * (solution.md — `workflow`: a concurrent transition fails with `CONFLICT`). Returns `null` in that
     * case so the caller refetches rather than double-advancing.
     */
    async advance(
      sessionId: string,
      to: StagePosition,
      expectedVersion: number,
      pendingAction: unknown = null,
    ): Promise<WorkflowPosition | null> {
      const updated = await db
        .update(workflowState)
        .set({
          stage: to.stage,
          substage: to.substage,
          version: expectedVersion + 1,
          pendingAction,
          updatedAt: new Date(),
        })
        .where(
          and(eq(workflowState.sessionId, sessionId), eq(workflowState.version, expectedVersion)),
        )
        .returning({
          stage: workflowState.stage,
          substage: workflowState.substage,
          version: workflowState.version,
          pendingAction: workflowState.pendingAction,
        });

      const row = updated[0];
      if (row === undefined) return null;

      return toPosition({
        stage: row.stage,
        substage: row.substage,
        pending_action: row.pendingAction,
        version: row.version,
      });
    },

    /**
     * Replaces the pending action without moving the position — presenting a question round,
     * consuming an answered one (FR-017 AC-3/AC-4).
     *
     * Same optimistic token as `advance`, and it bumps the version too: a pending-action claim
     * and a transition racing each other must produce one winner and one `CONFLICT`, or two
     * requests could each believe their card is the pending one.
     */
    async setPendingAction(
      sessionId: string,
      pendingAction: unknown,
      expectedVersion: number,
    ): Promise<WorkflowPosition | null> {
      const updated = await db
        .update(workflowState)
        .set({
          pendingAction,
          version: expectedVersion + 1,
          updatedAt: new Date(),
        })
        .where(
          and(eq(workflowState.sessionId, sessionId), eq(workflowState.version, expectedVersion)),
        )
        .returning({
          stage: workflowState.stage,
          substage: workflowState.substage,
          version: workflowState.version,
          pendingAction: workflowState.pendingAction,
        });

      const row = updated[0];
      if (row === undefined) return null;

      return toPosition({
        stage: row.stage,
        substage: row.substage,
        pending_action: row.pendingAction,
        version: row.version,
      });
    },
  };
}

export type WorkflowStateRepository = ReturnType<typeof createWorkflowStateRepository>;

export type { Stage, Substage };
