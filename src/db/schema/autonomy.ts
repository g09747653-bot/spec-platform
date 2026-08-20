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

import {
  AUTONOMOUS_RUN_STATUSES,
  AUTONOMOUS_STEP_OUTCOMES,
  AUTONOMOUS_STOP_REASONS,
} from '@/modules/projects/autonomy';

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
    /**
     * How the last claimed step ended — and **null means it never ended** (task 170).
     *
     * Written as `NULL` by the claim and settled by the step on its way out, so a process killed
     * mid-move leaves the one shape nothing else can produce: a step that was counted and whose
     * outcome nobody ever wrote. That is what tells «my last move landed and the session did not
     * budge» — a loop — from «my last move never happened» — a restart. Without the distinction a
     * stack restart *spends* an idle slot, and the M15а walk measured the price: both runs restarted
     * mid-journey ended as `stalled`.
     *
     * Three settled values rather than a boolean, because the loop detector treats them differently
     * and a boolean would have made that difference live in the reader's head:
     *
     * - `landed` — the move went through. Idleness after this one is a real loop.
     * - `refused` — an endpoint said no in a way worth another tick (a lost version race). Bounded
     *   by idleness, as it has always been.
     * - `fruitless-ask` — the interviewer produced no round. Bounded by `fruitless_asks` below and
     *   deliberately *not* by idleness.
     */
    stepOutcome: text('step_outcome'),
    /**
     * Consecutive `ask-round` moves that came back with no round (task 170).
     *
     * Its own counter, because it is its own event. An interviewer that answers «nothing worth
     * asking» has not moved the session — but neither has it walked in a circle: the model is asked
     * again and may answer differently, which is precisely what a person does by pressing the button
     * a second time. Counting it as idleness capped the driver at two tries and ended the run with
     * «I was going round in circles», which is not what happened; counting it here bounds the
     * retrying honestly and ends with the reason that is true — the door needs an answered round and
     * the interviewer is not producing one.
     */
    fruitlessAsks: integer('fruitless_asks').notNull().default(0),
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
      'autonomous_runs_step_outcome_valid',
      sql`${table.stepOutcome} IS NULL OR ${table.stepOutcome} IN (${list(AUTONOMOUS_STEP_OUTCOMES)})`,
    ),
    check(
      'autonomous_runs_counts_non_negative',
      sql`${table.steps} >= 0 AND ${table.idleSteps} >= 0 AND ${table.fruitlessAsks} >= 0
          AND ${table.version} >= 0`,
    ),
  ],
);

export type AutonomousRunRow = typeof autonomousRuns.$inferSelect;
