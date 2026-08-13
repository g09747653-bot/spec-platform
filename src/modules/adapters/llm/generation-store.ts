import { sql } from 'drizzle-orm';
import { z } from 'zod';

import type { SchemaDatabase } from '@/db';
import { generationChunks, generationRuns, projects, sessions } from '@/db/schema';
import type { OwnerScope } from '@/db/owner-scope';
import { queryOneRow, queryRows } from '@/db/sql';

import type { ChunkStore, RecordedChunk } from './stream-recorder';
import type { ProviderId } from './types';

/**
 * `generation_runs` and `generation_chunks`, in the module solution.md assigns them to (task 44).
 *
 * Two responsibilities, deliberately in one file because they are one table's worth of truth:
 *
 * - the **`ChunkStore`** the `StreamRecorder` writes through, which knows a run id and nothing about
 *   users, because by the time a stream is running ownership has already been established;
 * - the **owner-scoped read** the resume endpoint needs (task 47), which resolves run → session →
 *   project → owner *in SQL*. A run belonging to someone else is therefore indistinguishable from one
 *   that never existed (NFR-005 AC-2; AR-2).
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const RUN_STATUSES = ['running', 'restarted', 'complete', 'failed'] as const;

const RunRow = z.object({
  id: z.uuid(),
  session_id: z.uuid(),
  project_id: z.uuid(),
  stage: z.string(),
  status: z.enum(RUN_STATUSES),
  provider_used: z.string().nullable(),
  attempt: z.number().int().positive(),
  created_at: z.coerce.date(),
  first_token_at: z.coerce.date().nullable(),
  completed_at: z.coerce.date().nullable(),
});

const ChunkRow = z.object({
  sequence: z.number().int().nonnegative(),
  delta: z.string(),
});

export interface GenerationRun {
  id: string;
  sessionId: string;
  projectId: string;
  stage: string;
  status: (typeof RUN_STATUSES)[number];
  providerUsed: string | null;
  attempt: number;
  createdAt: Date;
  firstTokenAt: Date | null;
  completedAt: Date | null;
}

function toRun(row: z.infer<typeof RunRow>): GenerationRun {
  return {
    id: row.id,
    sessionId: row.session_id,
    projectId: row.project_id,
    stage: row.stage,
    status: row.status,
    providerUsed: row.provider_used,
    attempt: row.attempt,
    createdAt: row.created_at,
    firstTokenAt: row.first_token_at,
    completedAt: row.completed_at,
  };
}

export function createGenerationStore(db: SchemaDatabase) {
  const store: ChunkStore = {
    async append(runId: string, chunk: RecordedChunk): Promise<void> {
      await db.execute(sql`
        INSERT INTO ${generationChunks} (run_id, sequence, delta)
        VALUES (${runId}::uuid, ${chunk.sequence}, ${chunk.delta})
      `);
    },

    async discardAll(runId: string): Promise<void> {
      await db.execute(sql`DELETE FROM ${generationChunks} WHERE run_id = ${runId}::uuid`);
    },

    async stampFirstToken(runId: string, at: Date): Promise<void> {
      // `IS NULL` makes the stamp idempotent within an attempt: the first delta wins, and a retry of
      // the same write cannot move the latency measurement (SC-1).
      await db.execute(sql`
        UPDATE ${generationRuns}
        SET first_token_at = ${at.toISOString()}::timestamptz
        WHERE id = ${runId}::uuid AND first_token_at IS NULL
      `);
    },

    async clearFirstToken(runId: string): Promise<void> {
      await db.execute(sql`
        UPDATE ${generationRuns} SET first_token_at = NULL WHERE id = ${runId}::uuid
      `);
    },

    async prune(runId: string): Promise<void> {
      await db.execute(sql`DELETE FROM ${generationChunks} WHERE run_id = ${runId}::uuid`);
    },
  };

  return {
    ...store,

    /** Opens a run. The gate has already been checked; this row is what the client resumes against. */
    async createRun(sessionId: string, stage: string): Promise<GenerationRun> {
      const row = await queryOneRow(
        db,
        sql`
          WITH created AS (
            INSERT INTO ${generationRuns} (session_id, stage)
            VALUES (${sessionId}::uuid, ${stage})
            RETURNING id, session_id, stage, status, provider_used, attempt,
                      created_at, first_token_at, completed_at
          )
          SELECT created.*, ${sessions}.project_id
          FROM created JOIN ${sessions} ON ${sessions}.id = created.session_id
        `,
        RunRow,
      );

      return toRun(row);
    },

    /** Records that the chain moved on: a new attempt, and the previous one's output discarded. */
    async markRestarted(runId: string, attempt: number): Promise<void> {
      await db.execute(sql`
        UPDATE ${generationRuns}
        SET status = 'restarted', attempt = ${attempt}
        WHERE id = ${runId}::uuid AND status <> 'complete'
      `);
    },

    async markComplete(runId: string, provider: ProviderId, attempt: number): Promise<void> {
      await db.execute(sql`
        UPDATE ${generationRuns}
        SET status = 'complete', provider_used = ${provider}, attempt = ${attempt},
            completed_at = now()
        WHERE id = ${runId}::uuid
      `);
    },

    async markFailed(runId: string, attempt: number): Promise<void> {
      await db.execute(sql`
        UPDATE ${generationRuns}
        SET status = 'failed', attempt = ${attempt}
        WHERE id = ${runId}::uuid
      `);
    },

    /**
     * The run, if this owner owns it.
     *
     * The join is the authorization. Nothing is replayed before it succeeds, which is what makes a
     * foreign `runId` answer `NOT_FOUND` rather than another user's document (task 47 AC-1).
     */
    async findRunForOwner(scope: OwnerScope, runId: string): Promise<GenerationRun | null> {
      if (!UUID.test(runId)) return null;

      const rows = await queryRows(
        db,
        sql`
          SELECT ${generationRuns}.id, ${generationRuns}.session_id, ${sessions}.project_id,
                 ${generationRuns}.stage, ${generationRuns}.status, ${generationRuns}.provider_used,
                 ${generationRuns}.attempt, ${generationRuns}.created_at,
                 ${generationRuns}.first_token_at, ${generationRuns}.completed_at
          FROM ${generationRuns}
          JOIN ${sessions} ON ${sessions}.id = ${generationRuns}.session_id
          JOIN ${projects} ON ${projects}.id = ${sessions}.project_id
          WHERE ${generationRuns}.id = ${runId}::uuid
            AND ${projects}.owner_id = ${scope.userId}::uuid
        `,
        RunRow,
      );

      const row = rows[0];
      return row === undefined ? null : toRun(row);
    },

    /**
     * The run's liveness, without the ownership join.
     *
     * The resume stream polls this while it follows a run in flight (D-15: one long-running function
     * per generation, so a second invocation cannot share the first one's stream in memory — the
     * durable log is the channel between them). Ownership was settled before the first read; asking
     * again on every poll would be three joins a second for an answer that cannot change.
     */
    async statusOf(
      runId: string,
    ): Promise<{ status: GenerationRun['status']; attempt: number } | null> {
      if (!UUID.test(runId)) return null;

      const rows = await queryRows(
        db,
        sql`SELECT status, attempt FROM ${generationRuns} WHERE id = ${runId}::uuid`,
        z.object({ status: z.enum(RUN_STATUSES), attempt: z.number().int().positive() }),
      );

      return rows[0] ?? null;
    },

    /** Everything the client has not rendered yet, in order. */
    async chunksAfter(runId: string, sequence: number): Promise<RecordedChunk[]> {
      return queryRows(
        db,
        sql`
          SELECT sequence, delta FROM ${generationChunks}
          WHERE run_id = ${runId}::uuid AND sequence > ${sequence}
          ORDER BY sequence ASC
        `,
        ChunkRow,
      );
    },
  };
}

export type GenerationStore = ReturnType<typeof createGenerationStore>;
