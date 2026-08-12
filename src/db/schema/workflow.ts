import { sql } from 'drizzle-orm';
import { check, integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import {
  SPEC_STAGES,
  STAGES,
  SUBSTAGELESS_STAGES,
  SUBSTAGES,
} from '@/modules/workflow/model/stages';

import { sessions } from './projects';

/** Renders a tuple of stage names as a SQL value list. The inputs are compile-time constants. */
const list = (values: readonly string[]) => sql.raw(values.map((value) => `'${value}'`).join(', '));

/**
 * The persisted position of a session in the workflow (FR-007 AC-1; solution.md — `workflow`).
 *
 * `workflow_state` is the one table only the `workflow` module may write. Its columns are
 * current-state by design and carry no immutability guarantee (solution.md — Entity Notes).
 *
 * Two CHECK constraints keep the stage model honest at the storage layer, derived from the same
 * tuples the transition table is built over (no second spelling of a stage name):
 *
 * - `stage` is one of the seven states of constitution A2;
 * - a spec stage always carries a substage, and `interview`/`complete` never do — constitution A2
 *   gives the interview no `collect/generate/review` substages, and a row claiming otherwise is a
 *   defect the database refuses rather than a state the engine has to interpret.
 *
 * `version` is the optimistic-concurrency token: a transition writes `version + 1` and fails with
 * `CONFLICT` if another request moved first, so two concurrent requests cannot double-advance.
 */
export const workflowState = pgTable(
  'workflow_state',
  {
    sessionId: uuid('session_id')
      .primaryKey()
      .references(() => sessions.id, { onDelete: 'cascade' }),
    stage: text('stage').notNull(),
    substage: text('substage'),
    /** The decision or question set awaiting the user, re-rendered verbatim on resume (FR-017). */
    pendingAction: jsonb('pending_action'),
    version: integer('version').notNull().default(1),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [
    check('workflow_state_stage_valid', sql`${table.stage} IN (${list(STAGES)})`),
    check(
      'workflow_state_substage_valid',
      // `substage IS NOT NULL` is load-bearing, not redundant: `NULL IN (...)` evaluates to NULL,
      // and a CHECK constraint accepts NULL. Without it, a spec stage with no substage — the exact
      // row this constraint exists to refuse — would be stored.
      sql`(${table.stage} IN (${list(SUBSTAGELESS_STAGES)}) AND ${table.substage} IS NULL)
          OR (${table.stage} IN (${list(SPEC_STAGES)})
              AND ${table.substage} IS NOT NULL
              AND ${table.substage} IN (${list(SUBSTAGES)}))`,
    ),
  ],
);

export type WorkflowStateRow = typeof workflowState.$inferSelect;
