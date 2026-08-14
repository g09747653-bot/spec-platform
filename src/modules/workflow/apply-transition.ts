import { eq, sql } from 'drizzle-orm';

import type { SchemaDatabase } from '@/db';
import { sessions } from '@/db/schema';

import { evaluateTransition } from './evaluate-transition';
import type { StagePosition } from './model/stages';
import type { ReasonCode, TransitionResult } from './reason-codes';
import {
  createWorkflowStateRepository,
  type WorkflowPosition,
} from './repositories/workflow-state';
import { assembleWorkflowSnapshot, type SnapshotAssemblyOptions } from './snapshot-assembler';

/**
 * Evaluate, then persist — in that order, always (task 28; solution.md — `applyTransition`).
 *
 * The race between reading state and writing it is closed by the version token: the snapshot is
 * assembled at `version` and the update fires only `WHERE version = <that version>`. If another
 * request advanced the session in between, the update touches no row and the outcome is
 * `conflict` — the caller refetches rather than double-advancing (FR-007 AC-6). The gate verdict
 * therefore always describes exactly the state that was persisted against, never a stale one.
 *
 * Rejections are values (solution.md — workflow error handling): a refused gate returns the typed
 * reason and leaves `workflow_state` untouched; nothing is written unless `evaluateTransition`
 * allowed it.
 */
export type ApplyTransitionOutcome =
  | { status: 'applied'; position: WorkflowPosition }
  | { status: 'rejected'; reason: ReasonCode; result: TransitionResult }
  | { status: 'conflict' }
  | { status: 'not-found' };

export async function applyTransition(
  db: SchemaDatabase,
  sessionId: string,
  to: StagePosition,
  options: SnapshotAssemblyOptions,
): Promise<ApplyTransitionOutcome> {
  const assembled = await assembleWorkflowSnapshot(db, sessionId, options);
  if (assembled === null) return { status: 'not-found' };

  const verdict = evaluateTransition(assembled.snapshot, to);
  if (!verdict.allowed) {
    return { status: 'rejected', reason: verdict.reason, result: verdict };
  }

  // A transition consumes whatever card was pending: the new position renders its own state, and
  // resuming re-derives the pending action from that position (FR-017 AC-1).
  const advanced = await createWorkflowStateRepository(db).advance(
    sessionId,
    to,
    assembled.version,
  );
  if (advanced === null) return { status: 'conflict' };

  /*
   * Reaching `complete` is counted (task 78; FR-020 AC-10).
   *
   * A session may leave for `quality` and come back any number of times, so "is complete" is a
   * position and "has been completed" is a history — and the two answer different questions. The
   * increment happens **after** the guarded update, so a transition that lost the version race is
   * not counted: the row it would have counted was never written.
   */
  if (to.stage === 'complete') {
    await db
      .update(sessions)
      .set({ completionCount: sql`${sessions.completionCount} + 1` })
      .where(eq(sessions.id, sessionId));
  }

  return { status: 'applied', position: advanced };
}
