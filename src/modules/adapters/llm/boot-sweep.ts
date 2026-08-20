import type { SchemaDatabase } from '@/db';

import { createGenerationStore, staleRunThresholdMs } from './generation-store';

/**
 * The named reason a swept run carries into the log.
 *
 * `generation_runs` has no reason column and gains none for this: the only consumer of a swept run
 * is the one-run-at-a-time guard, which asks for a status and nothing else. The reason is for the
 * human reading the boot log — the *why* of a run that ends without anybody having failed it.
 */
export const ORPHANED_RUN_REASON = 'producer-died-mid-generation';

export interface SweepDeps {
  db: SchemaDatabase;
  /** `LLM_REQUEST_TIMEOUT_MS`. */
  perProviderTimeoutMs: number;
  /** How many providers `LLM_PROVIDER_ORDER` names. */
  chainLength: number;
  log?: (message: string, detail: Record<string, unknown>) => void;
}

/**
 * Closes generation runs whose producer never came back (task 168; Backlog B-1).
 *
 * Boot is the right moment because it is the only moment at which the answer is knowable without
 * guessing: a run in flight is being written by a live process, and the process that died is by
 * definition not the one now booting. The age bound is what makes that argument survive more than
 * one instance — see `staleRunThresholdMs`.
 *
 * **Failure here is not a boot failure.** A database that is unreachable at start-up is already
 * going to be reported by the first request that needs it, with far better context than a sweep
 * can give; refusing to serve the application over a repair that nothing is waiting for would turn
 * a stale row into an outage.
 */
export async function sweepOrphanedGenerationRuns(deps?: Partial<SweepDeps>): Promise<number> {
  const log =
    deps?.log ??
    ((message, detail) => {
      console.error(message, detail);
    });

  try {
    const resolved = await resolve(deps);

    const swept = await createGenerationStore(resolved.db).sweepStaleRuns(
      staleRunThresholdMs(resolved.perProviderTimeoutMs, resolved.chainLength),
    );

    if (swept.length > 0) {
      log('generation runs swept at boot', {
        reason: ORPHANED_RUN_REASON,
        count: swept.length,
        runs: swept.map((run) => ({
          runId: run.id,
          sessionId: run.sessionId,
          stage: run.stage,
          ageMs: run.ageMs,
        })),
      });
    }

    return swept.length;
  } catch (error) {
    log('generation run sweep failed', { reason: ORPHANED_RUN_REASON, error });
    return 0;
  }
}

/** Fills in whatever the caller did not inject from the process's own configuration. */
async function resolve(deps: Partial<SweepDeps> | undefined): Promise<Omit<SweepDeps, 'log'>> {
  if (
    deps?.db !== undefined &&
    deps.perProviderTimeoutMs !== undefined &&
    deps.chainLength !== undefined
  ) {
    return {
      db: deps.db,
      perProviderTimeoutMs: deps.perProviderTimeoutMs,
      chainLength: deps.chainLength,
    };
  }

  const [{ getEnv }, { getDatabase }] = await Promise.all([
    import('@/config/env'),
    import('@/db/client'),
  ]);
  const env = getEnv();

  return {
    db: deps?.db ?? getDatabase(),
    perProviderTimeoutMs: deps?.perProviderTimeoutMs ?? env.LLM_REQUEST_TIMEOUT_MS,
    chainLength: deps?.chainLength ?? env.LLM_PROVIDER_ORDER.length,
  };
}
