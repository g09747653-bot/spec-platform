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
 */
export function register(): void {
  getEnv();
  assertPromptRegistry();
  assertMethodologyConfigs();
}
