import { sql } from 'drizzle-orm';
import { z } from 'zod';

import type { SchemaDatabase } from '@/db';
import { autonomousRuns } from '@/db/schema';
import { queryRows } from '@/db/sql';
import {
  AUTONOMOUS_RUN_STATUSES,
  AUTONOMOUS_STOP_REASONS,
  type AutonomousRunStatus,
  type AutonomousStopReason,
} from '../autonomy';

/**
 * Persistence for the driver's run (task 145; see `db/schema/autonomy.ts`).
 *
 * Ownership is the caller's, exactly as it is for rounds, answers and messages: every route resolves
 * the session through the `OwnerScope`d repository first and only then writes by the id that lookup
 * returned. A session id from a request body never reaches this file untested.
 *
 * Every write that changes a live run is **guarded by `version`**, and that is not bookkeeping: it
 * is the whole of the sovereignty property. Two ticks racing each other, and a Stop racing a step,
 * are the same race, and it has one winner because the loser's `WHERE version = …` matches nothing.
 * A caller that gets `null` back re-reads rather than retrying blind.
 */
export interface AutonomousRun {
  id: string;
  sessionId: string;
  status: AutonomousRunStatus;
  stopReason: AutonomousStopReason | null;
  steps: number;
  idleSteps: number;
  fingerprint: string | null;
  version: number;
  startedAt: Date;
  endedAt: Date | null;
}

const RunRow = z.object({
  id: z.uuid(),
  session_id: z.uuid(),
  status: z.enum(AUTONOMOUS_RUN_STATUSES),
  stop_reason: z.enum(AUTONOMOUS_STOP_REASONS).nullable(),
  steps: z.coerce.number().int(),
  idle_steps: z.coerce.number().int(),
  fingerprint: z.string().nullable(),
  version: z.coerce.number().int(),
  started_at: z.coerce.date(),
  ended_at: z.coerce.date().nullable(),
});

const toRun = (row: z.infer<typeof RunRow>): AutonomousRun => ({
  id: row.id,
  sessionId: row.session_id,
  status: row.status,
  stopReason: row.stop_reason,
  steps: row.steps,
  idleSteps: row.idle_steps,
  fingerprint: row.fingerprint,
  version: row.version,
  startedAt: row.started_at,
  endedAt: row.ended_at,
});

const COLUMNS = sql`id, session_id, status, stop_reason, steps, idle_steps, fingerprint, version, started_at, ended_at`;

export function createAutonomousRunRepository(db: SchemaDatabase) {
  return {
    /**
     * Starts a run, or returns `null` because one is already live.
     *
     * `ON CONFLICT DO NOTHING` against the partial unique index rather than a read-then-write: the
     * check and the insert are one statement, so two simultaneous starts cannot both see «no run»
     * and both create one. The empty result is the honest answer to «did I start it?» — no.
     */
    async start(sessionId: string): Promise<AutonomousRun | null> {
      const rows = await queryRows(
        db,
        sql`
          INSERT INTO ${autonomousRuns} (session_id)
          VALUES (${sessionId}::uuid)
          ON CONFLICT DO NOTHING
          RETURNING ${COLUMNS}
        `,
        RunRow,
      );

      const row = rows[0];
      return row === undefined ? null : toRun(row);
    },

    /** The live run of this session, or `null` when the chat is an ordinary one. */
    async findLive(sessionId: string): Promise<AutonomousRun | null> {
      const rows = await queryRows(
        db,
        sql`
          SELECT ${COLUMNS}
          FROM ${autonomousRuns}
          WHERE session_id = ${sessionId}::uuid AND status = 'running'
          LIMIT 1
        `,
        RunRow,
      );

      const row = rows[0];
      return row === undefined ? null : toRun(row);
    },

    /**
     * The run this session last had, live or not — what the page shows after a run is over.
     *
     * Newest first by `started_at`, then by `id`, so the answer is total: a chat driven, stopped and
     * driven again inside one millisecond still has one latest run rather than an arbitrary one.
     */
    async findLatest(sessionId: string): Promise<AutonomousRun | null> {
      const rows = await queryRows(
        db,
        sql`
          SELECT ${COLUMNS}
          FROM ${autonomousRuns}
          WHERE session_id = ${sessionId}::uuid
          ORDER BY started_at DESC, id DESC
          LIMIT 1
        `,
        RunRow,
      );

      const row = rows[0];
      return row === undefined ? null : toRun(row);
    },

    /**
     * Records one taken step against the version the caller read.
     *
     * The counters move together because they are one observation: a step happened, and the session
     * either looks different afterwards or it does not. Splitting them into two writes would let a
     * crash between them leave a run that has taken a step it will never count as idle.
     */
    async recordStep(input: {
      runId: string;
      expectedVersion: number;
      fingerprint: string;
      idleSteps: number;
    }): Promise<AutonomousRun | null> {
      const rows = await queryRows(
        db,
        sql`
          UPDATE ${autonomousRuns}
          SET steps = steps + 1,
              idle_steps = ${input.idleSteps},
              fingerprint = ${input.fingerprint},
              version = version + 1
          WHERE id = ${input.runId}::uuid
            AND status = 'running'
            AND version = ${input.expectedVersion}
          RETURNING ${COLUMNS}
        `,
        RunRow,
      );

      const row = rows[0];
      return row === undefined ? null : toRun(row);
    },

    /**
     * Ends the run with a named reason.
     *
     * Unversioned **on purpose**, and it is the one place in this file that is: Stop is the human's
     * word, and making it lose a race to a step the driver started would be the product deciding
     * that its own move outranks the person watching it. A step that had already read `running` finds
     * this row `stopped` at its guard and dispatches nothing (see `recordStep`'s `status` predicate).
     *
     * Idempotent: stopping a run that is already stopped answers with the row as it stands, so a
     * double-click and a stop-then-complete race both end with one recorded reason — the first one.
     */
    async stop(runId: string, reason: AutonomousStopReason): Promise<AutonomousRun | null> {
      const rows = await queryRows(
        db,
        sql`
          UPDATE ${autonomousRuns}
          SET status = 'stopped',
              stop_reason = ${reason},
              ended_at = now(),
              version = version + 1
          WHERE id = ${runId}::uuid AND status = 'running'
          RETURNING ${COLUMNS}
        `,
        RunRow,
      );

      const updated = rows[0];
      if (updated !== undefined) return toRun(updated);

      const existing = await queryRows(
        db,
        sql`SELECT ${COLUMNS} FROM ${autonomousRuns} WHERE id = ${runId}::uuid`,
        RunRow,
      );

      const row = existing[0];
      return row === undefined ? null : toRun(row);
    },
  };
}

export type AutonomousRunRepository = ReturnType<typeof createAutonomousRunRepository>;
