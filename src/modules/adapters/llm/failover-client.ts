import type { ProviderEntry } from './provider-registry';
import {
  AllProvidersFailedError,
  isRateLimited,
  retryAfterMs,
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
  /** Waits between rate-limit retries of the *same* provider. Injectable so tests do not sleep. */
  rateLimitBackoff?: readonly number[];
  sleep?: (ms: number) => Promise<void>;
}

export interface ProviderFailure {
  provider: ProviderId;
  attempt: number;
  reason: 'error' | 'timeout' | 'rate-limited';
  /** Present for logging only; never rendered. */
  cause?: unknown;
}

/**
 * How long to wait before re-asking a provider that said "too fast" (round 2, Д-5).
 *
 * A rate limit is the one failure where the *same* provider is likely to succeed shortly, so moving
 * straight down the chain is the wrong response: with a single-provider chain — which is this
 * deployment — it means giving up immediately. The M6 gate walk did exactly that: the interview, the
 * review and the generation went out in a tight burst, the free tier pushed back, and the user was
 * told generation had failed.
 *
 * Three waits, ~7 s in total, well inside the per-provider timeout. Long enough for a
 * per-minute bucket to leak, short enough that nobody watches a spinner wondering.
 */
export const DEFAULT_RATE_LIMIT_BACKOFF: readonly number[] = [1_000, 2_000, 4_000];

/**
 * The longest we will wait on a provider's say-so.
 *
 * Google's free tier asks for ~31s after a per-minute overrun, which is worth waiting; a provider
 * asking for five minutes is not, because a wait long enough to look like a hang is its own failure.
 */
export const MAX_RATE_LIMIT_WAIT_MS = 35_000;

/** Marks an abort as ours (the per-provider deadline) rather than the caller's. */
class ProviderTimeout extends Error {
  constructor(timeoutMs: number) {
    super(`Provider exceeded the ${String(timeoutMs)} ms request timeout.`);
    this.name = 'ProviderTimeout';
  }
}

export function createFailoverClient(options: FailoverClientOptions): LlmAdapter {
  const { providers, timeoutMs, onProviderFailure } = options;
  const rateLimitBackoff = options.rateLimitBackoff ?? DEFAULT_RATE_LIMIT_BACKOFF;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));

  return {
    async generateStreaming(request: GenerateOptions): Promise<GenerateResult> {
      request.signal?.throwIfAborted();

      let attempts = 0;
      let previousAttemptStreamed = false;
      /*
       * Whether *every* failure so far was a rate limit. One genuine fault anywhere in the chain and
       * the exhaustion is not "busy" — telling a user to wait a minute for a broken key would be a
       * worse answer than telling them nothing.
       */
      let onlyRateLimits = true;
      let sawRateLimit = false;

      // Each provider is asked, and a provider that says "too fast" is asked again after a wait.
      const queue = providers.flatMap((provider) =>
        Array.from({ length: rateLimitBackoff.length + 1 }, () => provider),
      );

      for (let index = 0; index < queue.length; index += 1) {
        const provider = queue[index];
        if (provider === undefined) continue;

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

          const timedOut = controller.signal.reason === timeout;
          const rateLimited = !timedOut && isRateLimited(cause);

          if (rateLimited) sawRateLimit = true;
          else onlyRateLimits = false;

          onProviderFailure?.({
            provider: provider.id,
            attempt: attempts,
            reason: rateLimited ? 'rate-limited' : timedOut ? 'timeout' : 'error',
            cause,
          });

          /*
           * A rate limit is the one failure worth waiting out: the same provider is likely to answer
           * in a moment. Anything else skips the remaining retries of this provider and moves on —
           * re-asking a provider with a bad key three times only makes the user wait longer.
           */
          const retriesLeft = rateLimitBackoff.length - (index % (rateLimitBackoff.length + 1));

          if (rateLimited && retriesLeft > 0) {
            /*
             * The provider's own number beats ours when it gives one. Google answers a free-tier
             * overrun with "Please retry in 31.55s"; sleeping our 1s and asking again would spend a
             * retry inside a window it had already told us was thirty seconds wide.
             *
             * Capped, because a wait long enough to look like a hang is its own failure — and the
             * user can now abandon a slow generation anyway (Д-1).
             */
            const ladder = rateLimitBackoff[index % (rateLimitBackoff.length + 1)] ?? 0;
            const asked = retryAfterMs(cause);
            const wait = Math.min(Math.max(ladder, asked ?? 0), MAX_RATE_LIMIT_WAIT_MS);

            await sleep(wait);
            request.signal?.throwIfAborted();
          } else {
            // Skip this provider's remaining retry slots.
            index += retriesLeft;
          }
        } finally {
          clearTimeout(timer);
          request.signal?.removeEventListener('abort', abortFromCaller);
        }
      }

      // Every configured provider has now been attempted (NFR-004 AC-2).
      throw new AllProvidersFailedError(attempts, sawRateLimit && onlyRateLimits);
    },
  };
}
