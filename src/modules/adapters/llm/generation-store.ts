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
     * The session's generation that is still in flight, if there is one (round 5, Р-3).
     *
     * A page loaded while a run is going had no way to know it: nothing resolved the run, so the
     * card offered **Generate** — and clicking it started a *second* run over the same stage, which
     * is exactly the "no duplicates" half of the M3 resume rule. The page now reattaches to this run
     * instead of inviting a duplicate of it.
     *
     * Scoped by session, not by owner, because the caller already resolved the session through an
     * owner-scoped repository — the same contract `assembleWorkflowSnapshot` carries.
     *
     * **"In flight" is the complement of the two terminal statuses, not `running` alone.** A run that
     * has failed over carries `restarted` until the next provider produces something, and on the
     * gate's chain — where the funded provider was refusing every call — *every* run spent most of
     * its life in exactly that state. Asking for `running` therefore answered "nothing is happening"
     * about a generation that was very much happening, which is how a page kept offering Generate
     * over a live run through several gate walks. Terminal is the property worth naming: a run is in
     * flight until it is `complete` or `failed`.
     */
    async activeRunForSession(
      sessionId: string,
    ): Promise<{ runId: string; stage: string; attempt: number } | null> {
      if (!UUID.test(sessionId)) return null;

      const rows = await queryRows(
        db,
        sql`
          SELECT id, stage, attempt
          FROM ${generationRuns}
          WHERE session_id = ${sessionId}::uuid
            AND status NOT IN ('complete', 'failed')
          ORDER BY created_at DESC
          LIMIT 1
        `,
        z.object({
          id: z.uuid(),
          stage: z.string(),
          attempt: z.number().int().positive(),
        }),
      );

      const row = rows[0];
      return row === undefined ? null : { runId: row.id, stage: row.stage, attempt: row.attempt };
    },

    /**
     * Every generation run of a session, oldest first (task 104).
     *
     * A run is a turn of the conversation — the card a document streams into — so the feed reads the
     * whole series rather than only the one in flight. Content is not read: the chunk log is pruned
     * once a run completes and its revision is persisted, so a finished run's block is a marker in
     * the timeline and the document beside it is where the text lives.
     */
    async runsForSession(sessionId: string): Promise<
      {
        runId: string;
        stage: string;
        status: GenerationRun['status'];
        attempt: number;
        createdAt: Date;
      }[]
    > {
      if (!UUID.test(sessionId)) return [];

      const rows = await queryRows(
        db,
        sql`
          SELECT id, stage, status, attempt, created_at
          FROM ${generationRuns}
          WHERE session_id = ${sessionId}::uuid
          ORDER BY created_at ASC
        `,
        z.object({
          id: z.uuid(),
          stage: z.string(),
          status: z.enum(RUN_STATUSES),
          attempt: z.number().int().positive(),
          created_at: z.coerce.date(),
        }),
      );

      return rows.map((row) => ({
        runId: row.id,
        stage: row.stage,
        status: row.status,
        attempt: row.attempt,
        createdAt: row.created_at,
      }));
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

    /**
     * Closes runs orphaned by a dead producer (task 168; Backlog B-1).
     *
     * A terminal status is written by the producer and by nobody else, so a process that dies
     * mid-generation — a crash, a redeploy, a power cut, `local:down` — leaves its run in flight
     * forever. Nothing revisits that row afterwards, and the one-run-at-a-time guard above then
     * refuses **every** later generation of that session: the session is permanently ungeneratable
     * because of a failure that lasted a second. The autonomous loop must not have to steer around
     * that (the M14а gate chose its restart window to avoid exactly this), which is why the repair
     * runs at boot rather than waiting for someone to notice.
     *
     * `failed` rather than `complete`, because that is what happened: no document was produced and
     * no provider served it — and `generation_runs_completion_paired` would reject the alternative
     * anyway. `attempt` is left where the dead process left it; it records what the chain actually
     * did, and this sweep learned nothing new about that.
     *
     * The age bound carries the whole safety argument. A booting instance of a multi-instance
     * deployment sees runs belonging to instances that are alive and streaming, so only a run older
     * than any honest chain could be is declared dead (see `staleRunThresholdMs`).
     */
    async sweepStaleRuns(
      olderThanMs: number,
    ): Promise<{ id: string; sessionId: string; stage: string; ageMs: number }[]> {
      const rows = await queryRows(
        db,
        sql`
          UPDATE ${generationRuns}
          SET status = 'failed'
          WHERE status NOT IN ('complete', 'failed')
            AND created_at < now() - make_interval(secs => ${olderThanMs / 1000})
          RETURNING id, session_id, stage,
                    EXTRACT(EPOCH FROM (now() - created_at)) * 1000 AS age_ms
        `,
        z.object({
          id: z.uuid(),
          session_id: z.uuid(),
          stage: z.string(),
          age_ms: z.coerce.number(),
        }),
      );

      return rows.map((row) => ({
        id: row.id,
        sessionId: row.session_id,
        stage: row.stage,
        ageMs: Math.round(row.age_ms),
      }));
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

/**
 * How old an unfinished run must be before a booting server may declare it dead (task 168).
 *
 * Derived from the configured chain rather than picked as a number, so a deployment that widens
 * `LLM_REQUEST_TIMEOUT_MS` — a local Ollama needs minutes where a hosted provider needs seconds —
 * widens this with it. A fixed constant would have been a second number describing the same
 * machine, and the way that disagreement surfaces is a sweep killing a live generation.
 *
 * The chain budget is `timeout × providers`: every link may burn its full ceiling before the next
 * is tried. Four times that, floored at thirty minutes, is the "decidedly larger than the chain
 * budget" the task asks for — it leaves room for the rate-limit backoffs between attempts and for a
 * request that is slow rather than hung, while still being short enough that a session orphaned by
 * a crash is generatable again after one restart rather than never.
 */
export function staleRunThresholdMs(perProviderTimeoutMs: number, chainLength: number): number {
  return Math.max(30 * 60_000, perProviderTimeoutMs * Math.max(chainLength, 1) * 4);
}

export type GenerationStore = ReturnType<typeof createGenerationStore>;
