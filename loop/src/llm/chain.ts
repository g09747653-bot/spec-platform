import { buildProviders, type ProviderCredentials } from './providers.ts';
import {
  AllProvidersFailedError,
  NoProviderConfiguredError,
  type LlmProvider,
  type LlmProviderId,
  type LlmRequest,
} from './types.ts';

/**
 * The failover chain (task 156).
 *
 * Availability is a property of this layer, never of the intake: the intake asks once and learns
 * afterwards which provider served it. The same rule the platform's own chain follows, and for the
 * same reason — a caller that handles provider failure is a caller that has vendor knowledge in it.
 */

export interface Chain {
  /** In attempt order. Empty when nothing is configured. */
  readonly providers: readonly LlmProvider[];
  generate(request: LlmRequest): Promise<{ text: string; provider: LlmProviderId }>;
}

export interface ChainOptions extends ProviderCredentials {
  order: readonly LlmProviderId[];
  /** Told what failed and where, for the log feed. Never reaches a browser. */
  onProviderFailure?: (failure: {
    provider: LlmProviderId;
    attempt: number;
    error: string;
  }) => void;
}

export function createChain(options: ChainOptions): Chain {
  const providers = buildProviders(options.order, options);

  return {
    providers,

    async generate(request) {
      if (providers.length === 0) throw new NoProviderConfiguredError();

      let last: unknown;

      for (const [index, provider] of providers.entries()) {
        try {
          const text = await provider.generate(request);
          /*
           * An empty answer is a failure of *this* link, not a result. A provider that returns
           * nothing has told us nothing, and passing it on would make the intake write an assignment
           * with an empty description while reporting success.
           */
          if (text.trim() === '') throw new Error('провайдер вернул пустой ответ');

          return { text, provider: provider.id };
        } catch (error) {
          last = error;
          options.onProviderFailure?.({
            provider: provider.id,
            attempt: index + 1,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      throw new AllProvidersFailedError(providers.length, last);
    },
  };
}
