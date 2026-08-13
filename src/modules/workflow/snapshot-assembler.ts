import { sql } from 'drizzle-orm';
import { z } from 'zod';

import type { SchemaDatabase } from '@/db';
import {
  answers,
  informationNeeds,
  questionRounds,
  sessions,
  specFiles,
  specRevisions,
  workflowState,
} from '@/db/schema';
import { queryRows } from '@/db/sql';
import { isSpecType } from '@/modules/specs/model/spec-files';

import type { CapabilityId } from './model/capabilities';
import {
  ASKING_STAGES,
  isAskingStage,
  isSpecStage,
  isStage,
  isSubstage,
  SPEC_STAGES,
  type AskingStage,
  type SpecStage,
  type StagePosition,
} from './model/stages';
import type { InformationNeedState, WorkflowSnapshot } from './snapshot';

/**
 * Builds the `WorkflowSnapshot` from persisted state (task 25; solution.md — `WorkflowSnapshot`).
 *
 * This is the one place gate inputs are read from the database. The engine itself never sees a
 * database handle (NFR-012 AC-2); it sees the plain object this module returns. Owner scoping is
 * the caller's duty: every route resolves the session through an `OwnerScope`d repository first
 * and hands an already-authorised session id here — the same contract the workflow-state
 * repository has carried since task 19.
 *
 * **Query budget: at most four statements.** Documented per the task's acceptance criteria:
 *
 * 1. session + workflow position (one join);
 * 2. per-file approval flags (one pass over `spec_files` with correlated lookups);
 * 3. answered rounds per asking stage (a round with at least one answer row);
 * 4. information needs with their satisfaction state.
 *
 * Review decisions read as undecided until the Milestone 4 table exists — the engine fails
 * closed: no stage exit before a review can be decided.
 *
 * Configuration (`roundBudget`) and the capability registry are inputs, not reads: the caller
 * passes them so this module touches neither `process.env` nor module-level state, and tests can
 * assemble against any configuration.
 */
export interface SnapshotAssemblyOptions {
  /** `MAX_ROUNDS_PER_STAGE` as validated at boot (task 27). */
  roundBudget: number;
  /** Registered optional capabilities, from `registeredCapabilityIds()` at the composition root. */
  capabilities: readonly CapabilityId[];
}

export interface AssembledWorkflow {
  snapshot: WorkflowSnapshot;
  /** The optimistic-concurrency token the snapshot was read at (solution.md — workflow_state.version). */
  version: number;
  sessionId: string;
  projectId: string;
}

const SessionStateRow = z.object({
  project_id: z.uuid(),
  grounding_recorded: z.boolean(),
  summary_persisted: z.boolean(),
  quality_enabled: z.boolean(),
  stage: z.string(),
  substage: z.string().nullable(),
  version: z.number().int().positive(),
});

const ApprovalRow = z.object({
  spec_type: z.string(),
  latest_approved: z.boolean(),
  has_approved: z.boolean(),
});

const AnsweredRoundsRow = z.object({
  stage: z.string(),
  answered: z.number().int().nonnegative(),
});

const NeedRow = z.object({
  stage: z.string(),
  name: z.string(),
  satisfied: z.boolean(),
});

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Narrows the stored stage/substage pair exactly as the workflow-state repository does. */
function toPosition(stage: string, substage: string | null): StagePosition {
  if (!isStage(stage)) throw new Error(`workflow_state.stage holds an unknown stage: ${stage}`);

  if (substage === null) {
    if (isSpecStage(stage)) throw new Error(`workflow_state: stage ${stage} requires a substage`);
    return { stage, substage: null };
  }

  if (!isSubstage(substage)) {
    throw new Error(`workflow_state.substage holds an unknown substage: ${substage}`);
  }
  if (!isSpecStage(stage)) throw new Error(`workflow_state: stage ${stage} has no substages`);

  return { stage, substage };
}

const zeroRounds = (): Record<AskingStage, number> =>
  Object.fromEntries(ASKING_STAGES.map((stage) => [stage, 0])) as Record<AskingStage, number>;

const allFalse = (): Record<SpecStage, boolean> =>
  Object.fromEntries(SPEC_STAGES.map((stage) => [stage, false])) as Record<SpecStage, boolean>;

export async function assembleWorkflowSnapshot(
  db: SchemaDatabase,
  sessionId: string,
  options: SnapshotAssemblyOptions,
): Promise<AssembledWorkflow | null> {
  if (!UUID.test(sessionId)) return null;

  // Query 1 — the session and its position. `grounding_recorded` is computed in SQL because the
  // gate's question is "is a non-blank prompt recorded", not "fetch the prompt": the snapshot
  // carries booleans, never content.
  const stateRows = await queryRows(
    db,
    sql`
      SELECT
        ${sessions.projectId} AS project_id,
        (${sessions.initialPrompt} ~ '[^[:space:]]') AS grounding_recorded,
        (${sessions.summary} IS NOT NULL AND ${sessions.summary} ~ '[^[:space:]]') AS summary_persisted,
        ${sessions.qualityEnabled} AS quality_enabled,
        ${workflowState.stage} AS stage,
        ${workflowState.substage} AS substage,
        ${workflowState.version} AS version
      FROM ${sessions}
      JOIN ${workflowState} ON ${workflowState.sessionId} = ${sessions.id}
      WHERE ${sessions.id} = ${sessionId}::uuid
    `,
    SessionStateRow,
  );

  const state = stateRows[0];
  if (state === undefined) return null;

  // Query 2 — approval flags per spec file: whether the latest revision is approved
  // (`approvalGate`) and whether any approved revision exists (`completionGate`). One statement
  // for all files of the project; files that do not exist yet simply produce no row and stay
  // false, which is the fail-closed default.
  const approvalRows = await queryRows(
    db,
    sql`
      SELECT
        ${specFiles.specType} AS spec_type,
        COALESCE(
          (
            SELECT ${specRevisions.approved}
            FROM ${specRevisions}
            WHERE ${specRevisions.specFileId} = ${specFiles.id}
            ORDER BY ${specRevisions.revisionNumber} DESC
            LIMIT 1
          ),
          false
        ) AS latest_approved,
        EXISTS (
          SELECT 1
          FROM ${specRevisions}
          WHERE ${specRevisions.specFileId} = ${specFiles.id}
            AND ${specRevisions.approved} = true
        ) AS has_approved
      FROM ${specFiles}
      WHERE ${specFiles.projectId} = ${state.project_id}::uuid
    `,
    ApprovalRow,
  );

  const specApproved = allFalse();
  const approvedRevisionExists = allFalse();

  for (const row of approvalRows) {
    if (!isSpecType(row.spec_type)) continue;
    specApproved[row.spec_type] = row.latest_approved;
    approvedRevisionExists[row.spec_type] = row.has_approved;
  }

  // Query 3 — answered rounds per stage. "Answered" means at least one answer row exists,
  // whether it came from the card or from a free-text reply (task 36) — both are the user
  // answering, and both are what `collectGate` and `roundBudgetGate` count.
  const roundRows = await queryRows(
    db,
    sql`
      SELECT qr.stage AS stage, count(*)::int AS answered
      FROM ${questionRounds} qr
      WHERE qr.session_id = ${sessionId}::uuid
        AND EXISTS (SELECT 1 FROM ${answers} a WHERE a.round_id = qr.id)
      GROUP BY qr.stage
    `,
    AnsweredRoundsRow,
  );

  const answeredRounds = zeroRounds();
  for (const row of roundRows) {
    if (!isAskingStage(row.stage)) {
      throw new Error(`question_rounds.stage holds an unknown stage: ${row.stage}`);
    }
    answeredRounds[row.stage] = row.answered;
  }

  // Query 4 — the needs register with satisfaction state (FR-005 AC-11: derived from persisted
  // rounds, never from conversational memory).
  const needRows = await queryRows(
    db,
    sql`
      SELECT stage, name, (satisfied_by_round IS NOT NULL) AS satisfied
      FROM ${informationNeeds}
      WHERE session_id = ${sessionId}::uuid
      ORDER BY stage, name
    `,
    NeedRow,
  );

  const needs: InformationNeedState[] = needRows.map((row) => {
    if (!isAskingStage(row.stage)) {
      throw new Error(`information_needs.stage holds an unknown stage: ${row.stage}`);
    }
    return { stage: row.stage, name: row.name, satisfied: row.satisfied };
  });

  const snapshot: WorkflowSnapshot = {
    position: toPosition(state.stage, state.substage),
    groundingInputRecorded: state.grounding_recorded,
    summaryPersisted: state.summary_persisted,
    roundBudget: options.roundBudget,
    answeredRounds,
    informationNeeds: needs,
    specApproved,
    approvedRevisionExists,
    // Review decisions are a Milestone 4 table (task 53); undecided until then — fail closed.
    reviewDecided: allFalse(),
    qualityEnabled: state.quality_enabled,
    capabilities: options.capabilities,
  };

  return {
    snapshot,
    version: state.version,
    sessionId,
    projectId: state.project_id,
  };
}
