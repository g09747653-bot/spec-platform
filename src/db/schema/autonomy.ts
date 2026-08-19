import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { AUTONOMOUS_RUN_STATUSES, AUTONOMOUS_STOP_REASONS } from '@/modules/projects/autonomy';

import { sessions } from './projects';

/** Renders a tuple of names as a SQL value list. The inputs are compile-time constants. */
const list = (values: readonly string[]) => sql.raw(values.map((value) => `'${value}'`).join(', '));

/**
 * One autonomous run over one session (task 145; А-7 «Программа А»).
 *
 * A run is the whole of the mode: while a row here is `running`, the driver is walking this chat;
 * when it is `stopped`, the chat is an ordinary chat standing exactly where the driver left it. That
 * is why the mode has no column of its own on `sessions` — see the note in `modules/projects/autonomy.ts`.
 *
 * Four of the columns exist so that **termination is a property of the record rather than a hope**:
 *
 * - `steps` counts moves and is checked against a ceiling. A run that reaches it stops and says so.
 * - `fingerprint` is a digest of everything about the session a move could have changed, and
 *   `idle_steps` counts consecutive steps that did not change it. Two in a row is a loop, and a loop
 *   is caught by measuring it rather than by trusting the policy not to write one.
 * - `version` is the same optimistic-concurrency token `workflow_state` carries, and it does the
 *   same two jobs: it serialises steps (a second tick that races the first loses and does nothing),
 *   and it is what makes Stop authoritative against a step already in flight — the step re-reads
 *   this row immediately before it dispatches, and a stopped run has already moved on.
 *
 * The three CHECKs are equivalences rather than implications on purpose: `running` and `ended_at`
 * are two spellings of one fact, as are `stopped` and `stop_reason`, and a constraint that only
 * forbids one direction leaves the other spelling free to disagree.
 *
 * The partial UNIQUE index is the structural half of the same idea: a session cannot have two
 * drivers, and it cannot because the database will not hold two, not because every caller remembers
 * to check.
 */
export const autonomousRuns = pgTable(
  'autonomous_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => sessions.id, { onDelete: 'cascade' }),
    status: text('status').notNull().default('running'),
    /** Null while the run is live; one of the named endings once it is not. */
    stopReason: text('stop_reason'),
    /** Moves dispatched by this run. The ceiling is configuration; the count is a fact. */
    steps: integer('steps').notNull().default(0),
    /** Consecutive steps that left `fingerprint` unchanged — the loop detector's whole state. */
    idleSteps: integer('idle_steps').notNull().default(0),
    /** A digest of the session state the last step observed; null before the first step. */
    fingerprint: text('fingerprint'),
    /** Optimistic concurrency, exactly as `workflow_state.version` (D-15). */
    version: integer('version').notNull().default(0),
    startedAt: timestamp('started_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    endedAt: timestamp('ended_at', { withTimezone: true, mode: 'date' }),
  },
  (table) => [
    index('autonomous_runs_session_id_idx').on(table.sessionId),
    /*
      One live driver per session, enforced where it cannot be forgotten. Partial, so the history of
      stopped runs is unbounded — a chat may be driven, stopped, and driven again.
    */
    uniqueIndex('autonomous_runs_one_live_per_session')
      .on(table.sessionId)
      .where(sql`${table.status} = 'running'`),
    check(
      'autonomous_runs_status_valid',
      sql`${table.status} IN (${list(AUTONOMOUS_RUN_STATUSES)})`,
    ),
    check(
      'autonomous_runs_stop_reason_valid',
      sql`${table.stopReason} IS NULL OR ${table.stopReason} IN (${list(AUTONOMOUS_STOP_REASONS)})`,
    ),
    check(
      'autonomous_runs_ended_with_status',
      sql`(${table.status} = 'running') = (${table.endedAt} IS NULL)`,
    ),
    check(
      'autonomous_runs_stopped_names_reason',
      sql`(${table.status} = 'stopped') = (${table.stopReason} IS NOT NULL)`,
    ),
    check(
      'autonomous_runs_counts_non_negative',
      sql`${table.steps} >= 0 AND ${table.idleSteps} >= 0 AND ${table.version} >= 0`,
    ),
  ],
);

export type AutonomousRunRow = typeof autonomousRuns.$inferSelect;
