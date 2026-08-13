import { sql } from 'drizzle-orm';
import { check, integer, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';

import { ASKING_STAGES } from '@/modules/workflow/model/stages';

import { sessions } from './projects';

/** Renders a tuple of names as a SQL value list. The inputs are compile-time constants. */
const list = (values: readonly string[]) => sql.raw(values.map((value) => `'${value}'`).join(', '));

/** The lifecycle of a generation run. `restarted` is the mid-stream failover state (D-9). */
export const RUN_STATUSES = ['running', 'restarted', 'complete', 'failed'] as const;

export type RunStatus = (typeof RUN_STATUSES)[number];

/**
 * A generation run — and, by design, its own audit trail (task 44; solution.md — Observability).
 *
 * `first_token_at - created_at` is the latency series behind SC-1 (≤ 3 s to first token, p95) and
 * `completed_at - created_at` is total generation duration. Both are null for a run that failed before
 * producing output, which is exactly the population the p95 must exclude — so the metric needs no
 * separate instrumentation and no product analytics.
 *
 * `provider_used` and `attempt` record what the failover chain actually did. A rising attempt count is
 * how a degrading provider becomes visible before users report it.
 */
export const generationRuns = pgTable(
  'generation_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => sessions.id, { onDelete: 'cascade' }),
    stage: text('stage').notNull(),
    status: text('status').notNull().default('running'),
    /** Null until an attempt succeeds: an unfinished run has not been served by anyone yet. */
    providerUsed: text('provider_used'),
    /** 1-based position in the chain of the attempt in flight, or of the one that succeeded. */
    attempt: integer('attempt').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    /** Stamped on the first delta of the **successful** attempt, once (SC-1). */
    firstTokenAt: timestamp('first_token_at', { withTimezone: true, mode: 'date' }),
    completedAt: timestamp('completed_at', { withTimezone: true, mode: 'date' }),
  },
  (table) => [
    check('generation_runs_stage_valid', sql`${table.stage} IN (${list(ASKING_STAGES)})`),
    check('generation_runs_status_valid', sql`${table.status} IN (${list(RUN_STATUSES)})`),
    check('generation_runs_attempt_positive', sql`${table.attempt} >= 1`),
    /*
     * A completed run has a completion time and a provider; an unfinished one has neither. Stated as
     * a constraint because "complete" is what the resume endpoint answers on, and a run that claims
     * completion without a timestamp would make that answer a guess.
     */
    check(
      'generation_runs_completion_paired',
      sql`(${table.status} = 'complete' AND ${table.completedAt} IS NOT NULL AND ${table.providerUsed} IS NOT NULL)
          OR (${table.status} <> 'complete' AND ${table.completedAt} IS NULL)`,
    ),
    /*
     * There is deliberately **no** `first_token_at >= created_at` constraint.
     *
     * The two timestamps come from different clocks: `created_at` is the database's `now()`, while
     * `first_token_at` is stamped by the application at the moment it saw the model's first delta. On
     * a deployment where the app and the database are different machines, a few milliseconds of skew
     * would make that comparison fail — and it would fail by rejecting the stamp mid-generation, in
     * the middle of a user's request, to protect a metric. A latency series is worth measuring; it is
     * not worth failing a generation over (D-47).
     */
  ],
);

/**
 * The durable chunk log (D-7).
 *
 * It exists for **resume**, not for history: a reconnecting client replays everything above the
 * sequence it last rendered, and the rows are pruned once the run reaches `complete` and its revision
 * is persisted (solution.md — Entity Notes). Keeping them would turn a streaming feature into a second
 * copy of every document.
 *
 * `(run_id, sequence)` is unique and sequences restart at zero for each attempt — a failover discards
 * the previous attempt's rows rather than continuing past them, so the log can never interleave two
 * providers' output (FR-018 AC-5).
 */
export const generationChunks = pgTable(
  'generation_chunks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    runId: uuid('run_id')
      .notNull()
      .references(() => generationRuns.id, { onDelete: 'cascade' }),
    sequence: integer('sequence').notNull(),
    delta: text('delta').notNull(),
  },
  (table) => [
    unique('generation_chunks_run_sequence_unique').on(table.runId, table.sequence),
    check('generation_chunks_sequence_non_negative', sql`${table.sequence} >= 0`),
    /* An empty delta is a batch that should never have been written, not a record of silence. */
    check('generation_chunks_delta_not_empty', sql`length(${table.delta}) > 0`),
  ],
);

export type GenerationRunRow = typeof generationRuns.$inferSelect;
export type GenerationChunkRow = typeof generationChunks.$inferSelect;
