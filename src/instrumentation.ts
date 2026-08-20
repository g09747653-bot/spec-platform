import { getEnv } from '@/config/env';
import { assertMethodologyConfigs } from '@/modules/methodologies';
import { assertPromptRegistry } from '@/modules/prompts/registry';

/**
 * Runs once when the server starts, before it accepts traffic.
 *
 * Parsing the environment here means a misconfigured deployment fails loudly at boot rather than
 * halfway through a user's generation (IR-X2). `next.config.ts` performs the same checks at build
 * and CLI start-up, so a failure is caught in every launch path.
 *
 * The prompt registry is validated for the same reason (task 41): a prompt asset and its declared
 * variables disagreeing is a boot failure, never a malformed request to a provider.
 *
 * The generation sweep (task 168) is the one piece of *repair* here, and it is deliberately not a
 * check: a run orphaned by a dead producer is a fact about the database, not about this
 * deployment's configuration, so it is fixed rather than reported and the boot continues either
 * way (see `sweepOrphanedGenerationRuns`).
 */
export function register(): void {
  getEnv();
  assertPromptRegistry();
  assertMethodologyConfigs();

  /*
   * Node runtime only. The sweep needs the database driver, and the edge bundle — which this hook
   * is also invoked in when a proxy is present — has no place for `pg`. A dynamic import keeps the
   * dependency out of that bundle entirely rather than merely unused in it.
   */
  /* eslint-disable-next-line no-restricted-properties --
   * `NEXT_RUNTIME` is not configuration and has no place in the env schema: it is the framework
   * naming the bundle this module was loaded into, and it differs between two loads of the same
   * deployment. Reading it here is the documented way to target a runtime from this hook.
   */
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    void import('@/modules/adapters/llm/boot-sweep').then(async ({ sweepOrphanedGenerationRuns }) =>
      sweepOrphanedGenerationRuns(),
    );
  }
}
