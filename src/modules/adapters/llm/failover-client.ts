import type { ProviderEntry } from './provider-registry';
import {
  AllProvidersFailedError,
  type GenerateOptions,
  type GenerateResult,
  type LlmAdapter,
  type ProviderId,
} from './types';

/**
 * The failover client (tasks 43 and 48; NFR-004; FR-018; D-6, D-9).
 *
 * Availability is a property of this layer, never of calling code (constitution A3): an agent asks for
 * generation once and learns afterwards which provider served it. Three rules do the work.
 *
 * **One timeout per provider, not per request.** `LLM_REQUEST_TIMEOUT_MS` bounds each attempt. A
 * provider that hangs is a provider that failed, and the chain moves on.
 *
 * **Discard and restart, never concatenate.** If an attempt has already streamed text when it fails,
 * that text is abandoned and the next attempt starts from nothing. Two models' prose spliced together
 * is a worse outcome than a slower generation — it is incoherent, and it would be persisted as if it
 * were a real document (D-9; FR-018 AC-5). The caller is told through `onAttempt`, which is what
 * raises the `restart` event and resets the chunk log to sequence zero.
 *
 * **A user hears about failure only once, and only at the end.** Errors from individual providers are
 * swallowed, counted, and replaced by `AllProvidersFailedError` when — and only when — the chain is
 * exhausted (NFR-004 AC-2). That error carries an attempt count and nothing else: no provider name, no
 * vendor payload, no stack (FR-018 AC-7).
 *
 * A caller who gives up is not a provider failure. If the request's own signal aborts — the browser
 * disconnected, the route handler was torn down — the abort propagates immediately rather than
 * burning the rest of the chain on a stream nobody is reading.
 */
export interface FailoverClientOptions {
  /** The configured chain, in attempt order (task 42's registry). */
  providers: readonly ProviderEntry[];
  /** Per-provider ceiling in milliseconds (`LLM_REQUEST_TIMEOUT_MS`). */
  timeoutMs: number;
  /**
   * Server-side observability hook. Provider identity is fine here — it is what `generation_runs`
   * records and what Sentry is tagged with (NFR-010). It never reaches the browser.
   */
  onProviderFailure?: (failure: ProviderFailure) => void;
}

export interface ProviderFailure {
  provider: ProviderId;
  attempt: number;
  reason: 'error' | 'timeout';
  /** Present for logging only; never rendered. */
  cause?: unknown;
}

/** Marks an abort as ours (the per-provider deadline) rather than the caller's. */
class ProviderTimeout extends Error {
  constructor(timeoutMs: number) {
    super(`Provider exceeded the ${String(timeoutMs)} ms request timeout.`);
    this.name = 'ProviderTimeout';
  }
}

export function createFailoverClient(options: FailoverClientOptions): LlmAdapter {
  const { providers, timeoutMs, onProviderFailure } = options;

  return {
    async generateStreaming(request: GenerateOptions): Promise<GenerateResult> {
      request.signal?.throwIfAborted();

      let attempts = 0;
      let previousAttemptStreamed = false;

      for (const provider of providers) {
        attempts += 1;

        request.onAttempt?.({
          attempt: attempts,
          provider: provider.id,
          discardsPreviousOutput: previousAttemptStreamed,
        });

        let streamedHere = false;
        const controller = new AbortController();
        const abortFromCaller = () => {
          controller.abort(request.signal?.reason);
        };

        request.signal?.addEventListener('abort', abortFromCaller, { once: true });
        const timeout = new ProviderTimeout(timeoutMs);
        const timer = setTimeout(() => {
          controller.abort(timeout);
        }, timeoutMs);

        try {
          const text = await provider.stream({
            messages: request.messages,
            tools: request.tools,
            signal: controller.signal,
            onDelta: (delta) => {
              streamedHere = true;
              request.onChunk?.(delta);
            },
          });

          return { text, providerUsed: provider.id, attempts };
        } catch (cause) {
          // The caller gave up. Nobody is reading the stream, so trying the rest of the chain would
          // spend a second provider's budget on output that goes nowhere.
          if (request.signal?.aborted === true) throw cause;

          previousAttemptStreamed = streamedHere;
          onProviderFailure?.({
            provider: provider.id,
            attempt: attempts,
            reason: controller.signal.reason === timeout ? 'timeout' : 'error',
            cause,
          });
        } finally {
          clearTimeout(timer);
          request.signal?.removeEventListener('abort', abortFromCaller);
        }
      }

      // Every configured provider has now been attempted (NFR-004 AC-2).
      throw new AllProvidersFailedError(attempts);
    },
  };
}
