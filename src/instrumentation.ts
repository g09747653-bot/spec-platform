import { getEnv } from '@/config/env';

/**
 * Runs once when the server starts, before it accepts traffic.
 *
 * Parsing the environment here means a misconfigured deployment fails loudly at boot rather than
 * halfway through a user's generation (IR-X2). `next.config.ts` performs the same check at build
 * and CLI start-up, so the failure is caught in every launch path.
 */
export function register(): void {
  getEnv();
}
