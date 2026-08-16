import { describe, expect, it } from 'vitest';

import { PromptOverCapacityError, UNPACKED_TARGET } from '../capacity';
import {
  createFailoverClient,
  MAX_RATE_LIMIT_WAIT_MS,
  type ProviderFailure,
} from '../failover-client';
import type { ProviderEntry } from '../provider-registry';
import {
  AllProvidersFailedError,
  isRateLimited,
  retryAfterMs,
  type AttemptStart,
  type ProviderId,
} from '../types';

import { fakeChain, fakeEntry } from './provider-fakes';

/**
 * The failover client (tasks 43 and 48; NFR-004; FR-018; IR-001; SC-4).
 *
 * Every case runs against hand-built providers — no network, no SDK, no credential (IR-001-AC-5,
 * NFR-012 AC-5). The chain is exercised at lengths 1, 2 and 3 including full exhaustion, because a
 * deployment configured with a single provider must not be a code path nobody has run: with only one
 * vendor funded, that is the shape production is in.
 */

const TIMEOUT_MS = 60_000;

interface Recorder {
  chunks: string[];
  attempts: AttemptStart[];
  failures: ProviderFailure[];
}

function recorder(): Recorder {
  return { chunks: [], attempts: [], failures: [] };
}

function run(
  providers: ReturnType<typeof fakeChain>,
  log: Recorder,
  options: { timeoutMs?: number; signal?: AbortSignal } = {},
) {
  const client = createFailoverClient({
    providers,
    timeoutMs: options.timeoutMs ?? TIMEOUT_MS,
    onProviderFailure: (failure) => log.failures.push(failure),
  });

  return client.generateStreaming({
    messages: [{ role: 'user', content: 'write something' }],
    runId: 'run-1',
    onChunk: (chunk) => log.chunks.push(chunk),
    onAttempt: (attempt) => log.attempts.push(attempt),
    signal: options.signal,
  });
}

const attemptedProviders = (log: Recorder): ProviderId[] =>
  log.attempts.map((attempt) => attempt.provider);

describe('the happy path', () => {
  it('streams from the first provider and reports which one served the call', async () => {
    const log = recorder();
    const result = await run(fakeChain(['google', { document: 'hello world' }]), log);

    expect(result.text).toBe('hello world');
    expect(result.providerUsed).toBe('google');
    expect(result.attempts).toBe(1);
    expect(log.chunks.join('')).toBe('hello world');
    expect(log.failures).toEqual([]);
  });

  it('announces the first attempt without asking anyone to discard anything', async () => {
    const log = recorder();
    await run(fakeChain(['google', {}]), log);

    expect(log.attempts).toEqual([
      { attempt: 1, provider: 'google', discardsPreviousOutput: false },
    ]);
  });
});

describe('failover ordering', () => {
  it('completes via the next provider when the primary refuses, with no user intervention', async () => {
    const log = recorder();
    const result = await run(
      fakeChain(
        ['anthropic', { failAfterChunks: 0 }],
        ['openai', { document: 'from the second provider' }],
      ),
      log,
    );

    expect(result.providerUsed).toBe('openai');
    expect(result.attempts).toBe(2);
    expect(result.text).toBe('from the second provider');
  });

  it('attempts providers in exactly the configured order', async () => {
    const log = recorder();
    await run(
      fakeChain(
        ['openai', { failAfterChunks: 0 }],
        ['google', { failAfterChunks: 0 }],
        ['anthropic', { document: 'third time lucky' }],
      ),
      log,
    );

    expect(attemptedProviders(log)).toEqual(['openai', 'google', 'anthropic']);
    expect(log.failures.map((failure) => failure.provider)).toEqual(['openai', 'google']);
  });

  it('reverses the order when the configuration does, with no code change', async () => {
    const log = recorder();
    await run(
      fakeChain(
        ['anthropic', { failAfterChunks: 0 }],
        ['openai', { failAfterChunks: 0 }],
        ['google', { document: 'last' }],
      ),
      log,
    );

    const reversed = recorder();
    await run(
      fakeChain(
        ['google', { failAfterChunks: 0 }],
        ['openai', { failAfterChunks: 0 }],
        ['anthropic', { document: 'last' }],
      ),
      reversed,
    );

    expect(attemptedProviders(log)).toEqual(['anthropic', 'openai', 'google']);
    expect(attemptedProviders(reversed)).toEqual(['google', 'openai', 'anthropic']);
  });
});

describe('exhaustion', () => {
  it('surfaces failure only after every configured provider has been attempted', async () => {
    const log = recorder();

    await expect(
      run(
        fakeChain(
          ['anthropic', { failAfterChunks: 0 }],
          ['openai', { failAfterChunks: 0 }],
          ['google', { failAfterChunks: 0 }],
        ),
        log,
      ),
    ).rejects.toBeInstanceOf(AllProvidersFailedError);

    expect(attemptedProviders(log)).toEqual(['anthropic', 'openai', 'google']);
  });

  it('exhausts a chain of one without degenerating into a special case', async () => {
    const log = recorder();

    await expect(run(fakeChain(['google', { failAfterChunks: 0 }]), log)).rejects.toMatchObject({
      name: 'AllProvidersFailedError',
      attempts: 1,
    });

    expect(attemptedProviders(log)).toEqual(['google']);
  });

  it('exhausts a chain of two', async () => {
    const log = recorder();

    await expect(
      run(fakeChain(['google', { failAfterChunks: 0 }], ['openai', { failAfterChunks: 2 }]), log),
    ).rejects.toMatchObject({ attempts: 2 });
  });

  it('fails immediately, and without pretending otherwise, on an empty chain', async () => {
    const log = recorder();

    await expect(run(fakeChain(), log)).rejects.toMatchObject({
      name: 'AllProvidersFailedError',
      attempts: 0,
    });
  });

  it('names no provider and carries no stack in what the user is shown (FR-018 AC-7)', async () => {
    const log = recorder();

    try {
      await run(
        fakeChain(['anthropic', { failAfterChunks: 0 }], ['google', { failAfterChunks: 0 }]),
        log,
      );
      expect.unreachable('the chain was exhausted');
    } catch (error) {
      const { message } = error as AllProvidersFailedError;

      for (const vendor of ['anthropic', 'openai', 'google', 'gemini', 'claude', 'gpt']) {
        expect(message.toLowerCase()).not.toContain(vendor);
      }
      expect(message).not.toContain('at ');
      expect(message).not.toContain('fake');
    }
  });

  it('still tells the server which providers failed, where it is safe to know', async () => {
    const log = recorder();

    await expect(
      run(
        fakeChain(['anthropic', { failAfterChunks: 0 }], ['google', { failAfterChunks: 0 }]),
        log,
      ),
    ).rejects.toBeInstanceOf(AllProvidersFailedError);

    expect(log.failures).toHaveLength(2);
    expect(log.failures[0]?.provider).toBe('anthropic');
    expect(log.failures[0]?.reason).toBe('error');
    expect(log.failures[1]?.attempt).toBe(2);
  });
});

describe('mid-stream failure: discard and restart (D-9; FR-018 AC-5)', () => {
  it('signals a discard when the abandoned attempt had already streamed', async () => {
    const log = recorder();

    await run(
      fakeChain(
        ['anthropic', { document: 'one two three four five six', failAfterChunks: 5 }],
        ['google', { document: 'a clean second attempt' }],
      ),
      log,
    );

    expect(log.attempts).toEqual([
      { attempt: 1, provider: 'anthropic', discardsPreviousOutput: false },
      { attempt: 2, provider: 'google', discardsPreviousOutput: true },
    ]);
  });

  it('does not ask for a discard when the abandoned attempt streamed nothing', async () => {
    const log = recorder();

    await run(
      fakeChain(['anthropic', { failAfterChunks: 0 }], ['google', { document: 'clean' }]),
      log,
    );

    expect(log.attempts[1]?.discardsPreviousOutput).toBe(false);
  });

  it('never returns text from two providers concatenated', async () => {
    const log = recorder();

    const result = await run(
      fakeChain(
        ['anthropic', { document: 'PARTIAL partial partial partial', failAfterChunks: 2 }],
        ['google', { document: 'the whole document' }],
      ),
      log,
    );

    expect(result.text).toBe('the whole document');
    expect(result.text).not.toContain('PARTIAL');
    // The abandoned deltas did reach the client — which is exactly why the restart signal exists.
    expect(log.chunks.join('')).toContain('PARTIAL');
    expect(log.attempts[1]?.discardsPreviousOutput).toBe(true);
  });

  it('resets the discard flag once a later attempt starts clean', async () => {
    const log = recorder();

    await run(
      fakeChain(
        ['anthropic', { document: 'one two three', failAfterChunks: 2 }],
        ['openai', { failAfterChunks: 0 }],
        ['google', { document: 'finally' }],
      ),
      log,
    );

    expect(log.attempts.map((attempt) => attempt.discardsPreviousOutput)).toEqual([
      false,
      true,
      false,
    ]);
  });
});

describe('the per-provider timeout', () => {
  it('gives up on a hanging provider and advances down the chain', async () => {
    const log = recorder();

    const result = await run(fakeChain(['anthropic', { hang: true }], ['google', {}]), log, {
      timeoutMs: 20,
    });

    expect(result.providerUsed).toBe('google');
    expect(log.failures[0]).toMatchObject({ provider: 'anthropic', reason: 'timeout' });
  });

  it('bounds each provider separately rather than the request as a whole', async () => {
    const log = recorder();

    await expect(
      run(fakeChain(['anthropic', { hang: true }], ['openai', { hang: true }]), log, {
        timeoutMs: 20,
      }),
    ).rejects.toBeInstanceOf(AllProvidersFailedError);

    expect(log.failures.map((failure) => failure.reason)).toEqual(['timeout', 'timeout']);
  });
});

describe('a caller who gives up', () => {
  it('is not treated as a provider failure, and does not burn the rest of the chain', async () => {
    const log = recorder();
    const controller = new AbortController();

    const pending = run(fakeChain(['anthropic', { hang: true }], ['google', {}]), log, {
      signal: controller.signal,
    });

    controller.abort(new Error('client disconnected'));

    await expect(pending).rejects.toThrow();
    expect(attemptedProviders(log)).toEqual(['anthropic']);
    expect(log.failures).toEqual([]);
  });

  it('refuses before the first provider when the signal is already aborted', async () => {
    const log = recorder();

    await expect(
      run(fakeChain(['google', {}]), log, { signal: AbortSignal.abort() }),
    ).rejects.toThrow();

    expect(log.attempts).toEqual([]);
  });
});

describe('the entries the client consumes', () => {
  it('carry nothing vendor-shaped, which is what keeps the interface neutral (task 42 AC-1)', () => {
    const entry = fakeEntry('google');

    // `capacity` joined the shape with А-8 and is two numbers of tokens — a fact about a window,
    // which every vendor has, rather than anything shaped like one vendor's.
    expect(Object.keys(entry).sort()).toEqual(['capacity', 'id', 'model', 'priority', 'stream']);
    expect(typeof entry.stream).toBe('function');
    expect(Object.keys(entry.capacity).sort()).toEqual(['generationReserveTokens', 'promptTokens']);
  });
});

/**
 * Round 2, Д-5 — a rate limit is not a broken provider.
 *
 * The M6 gate walk failed here. The interview, the review and the generation went out in a tight
 * burst, the free tier pushed back with a 429, and a single-provider chain treated that as "every
 * provider failed" and gave up on the first refusal. Waiting a second and asking again is what the
 * situation actually calls for — and it is the only failure where the *same* provider is the right
 * next thing to try.
 */
describe('rate limiting (round 2, Д-5)', () => {
  class RateLimited extends Error {
    readonly status = 429;
    constructor() {
      super('429 Too Many Requests');
      this.name = 'RateLimited';
    }
  }

  /** A provider that refuses with 429 the first `times` times, then succeeds. */
  function flaky(id: ProviderId, times: number): ProviderEntry {
    let seen = 0;

    return {
      id,
      model: `${id}-test-model`,
      priority: 1,
      capacity: UNPACKED_TARGET.capacity,
      stream: ({ onDelta }) => {
        seen += 1;
        if (seen <= times) return Promise.reject(new RateLimited());
        onDelta('done');
        return Promise.resolve('done');
      },
    };
  }

  const waits: number[] = [];

  const client = (providers: readonly ProviderEntry[]) =>
    createFailoverClient({
      providers,
      timeoutMs: TIMEOUT_MS,
      rateLimitBackoff: [1, 2, 4],
      sleep: (ms) => {
        waits.push(ms);
        return Promise.resolve();
      },
    });

  const generate = (providers: readonly ProviderEntry[]) =>
    client(providers).generateStreaming({
      messages: [{ role: 'user', content: 'write something' }],
      runId: 'run-1',
    });

  it('re-asks the same provider after a wait, and succeeds (the gate case)', async () => {
    waits.length = 0;

    const result = await generate([flaky('google', 2)]);

    expect(result.text).toBe('done');
    // Two refusals, two waits, then the answer — on a one-provider chain.
    expect(waits).toEqual([1, 2]);
    expect(result.attempts).toBe(3);
  });

  it('gives up after the retries are spent, and says the service is busy — not that it broke', async () => {
    waits.length = 0;

    await expect(generate([flaky('google', 99)])).rejects.toMatchObject({
      name: 'AllProvidersFailedError',
      overloaded: true,
    });

    // Three waits: the backoff ladder, exactly once through.
    expect(waits).toEqual([1, 2, 4]);
  });

  /*
   * The distinction that keeps the message honest: one genuine fault anywhere and the exhaustion is
   * not "busy". Telling a user to wait a minute for a bad key would be worse than saying nothing.
   */
  it('does not claim overload when any failure was a real fault', async () => {
    const log = recorder();
    const chain = fakeChain(['google', { failAfterChunks: 0 }], ['openai', { failAfterChunks: 0 }]);

    await expect(run(chain, log)).rejects.toMatchObject({ overloaded: false });
  });

  it('does not burn the backoff on an ordinary failure', async () => {
    waits.length = 0;

    await expect(generate(fakeChain(['google', { failAfterChunks: 0 }]))).rejects.toBeInstanceOf(
      AllProvidersFailedError,
    );

    // No waits at all: a broken provider is not worth re-asking three times.
    expect(waits).toEqual([]);
  });

  /**
   * Round 3 — the case the local provider was added for (D-90).
   *
   * A daily quota is a rate limit that does not leak: waiting the ladder out changes nothing, and on a
   * one-provider chain the walk simply stops, which is what happened to the M6 gate. A second provider
   * that costs nothing and lives on the same machine turns that into a slower answer instead of no
   * answer. Note what the chain does *not* do — it does not skip the retries because they look futile.
   * The provider is asked its full ladder first, because a per-minute limit and a per-day one look
   * identical from here, and only one of them is worth waiting out.
   */
  it('falls over to the local provider once the funded one is out of quota', async () => {
    waits.length = 0;

    const result = await generate([
      flaky('google', 99),
      fakeEntry('ollama', { document: 'local answer' }, 2),
    ]);

    expect(result.providerUsed).toBe('ollama');
    expect(result.text).toBe('local answer');
    // Four refusals from Google — the first plus the ladder — and then the fifth attempt answers.
    expect(waits).toEqual([1, 2, 4]);
    expect(result.attempts).toBe(5);
  });

  it('reports the rate limit as its own reason, for the operator', async () => {
    const failures: ProviderFailure[] = [];

    const limited = createFailoverClient({
      providers: [flaky('google', 99)],
      timeoutMs: TIMEOUT_MS,
      rateLimitBackoff: [1],
      sleep: () => Promise.resolve(),
      onProviderFailure: (failure) => failures.push(failure),
    });

    await expect(
      limited.generateStreaming({ messages: [{ role: 'user', content: 'x' }], runId: 'run-1' }),
    ).rejects.toBeInstanceOf(AllProvidersFailedError);

    expect(failures.map((failure) => failure.reason)).toEqual(['rate-limited', 'rate-limited']);
  });
});

describe('isRateLimited (round 2, Д-5)', () => {
  it('recognises the two statuses that mean "try later"', () => {
    expect(isRateLimited({ status: 429 })).toBe(true);
    expect(isRateLimited({ statusCode: 503 })).toBe(true);
    expect(isRateLimited(new Error('429 Too Many Requests'))).toBe(true);
    expect(isRateLimited(new Error('model is overloaded'))).toBe(true);
    expect(isRateLimited(new Error('quota exceeded for this project'))).toBe(true);
  });

  it('follows the cause chain, because SDKs wrap', () => {
    expect(isRateLimited(new Error('call failed', { cause: { status: 429 } }))).toBe(true);
  });

  /*
   * The shape production actually throws, captured from a live call during the gate remediation.
   * Google answers an overloaded model with 503 and the words "high demand" — not "rate limit" — and
   * the AI SDK wraps it in a RetryError that carries `lastError` and `errors`, never `cause`. A
   * detector that walked only `cause` and matched only the phrase "rate limit" would have passed
   * every unit test above and fired on nothing.
   */
  describe('the shapes production throws', () => {
    const apiCallError = {
      name: 'AI_APICallError',
      message:
        'This model is currently experiencing high demand. Spikes in demand are usually temporary. Please try again later.',
      statusCode: 503,
      isRetryable: true,
    };

    it('recognises the provider error itself', () => {
      expect(isRateLimited(apiCallError)).toBe(true);
    });

    it('recognises it through the SDK RetryError, which uses lastError', () => {
      expect(
        isRateLimited({
          name: 'AI_RetryError',
          message: 'Failed after 3 attempts.',
          lastError: apiCallError,
          errors: [apiCallError],
        }),
      ).toBe(true);
    });

    it('recognises it through the errors array alone', () => {
      expect(isRateLimited({ name: 'AI_RetryError', errors: [apiCallError] })).toBe(true);
    });

    it('survives a cycle in the wrapping', () => {
      const outer: Record<string, unknown> = { name: 'outer', message: 'nope' };
      outer.cause = outer;

      expect(isRateLimited(outer)).toBe(false);
    });
  });

  /*
   * Ambiguity reads as "not a rate limit". A false positive costs the user seven seconds of waiting
   * before an error they were going to get anyway — and, worse, tells them to try again when
   * trying again cannot help.
   */
  it('is not fooled by ordinary faults', () => {
    expect(isRateLimited({ status: 401 })).toBe(false);
    expect(isRateLimited(new Error('invalid api key'))).toBe(false);
    expect(isRateLimited(new Error('ECONNRESET'))).toBe(false);
    expect(isRateLimited(null)).toBe(false);
    expect(isRateLimited(undefined)).toBe(false);
  });
});

/**
 * Round 2, Д-5 — honouring the provider's own number.
 *
 * The live diagnosis found Google answering a free-tier overrun with `limit: 20` requests per minute
 * and `Please retry in 31.550265287s`. A fixed one-second ladder would retry three times inside a
 * window the provider had already told us was thirty seconds wide, and then report failure.
 */
describe('retryAfterMs (round 2, Д-5)', () => {
  /** The live shape, as an Error — which is what an SDK actually throws. */
  class QuotaError extends Error {
    readonly statusCode = 429;
    constructor(message: string) {
      super(message);
      this.name = 'AI_APICallError';
    }
  }

  const quotaError = new QuotaError(
    'You exceeded your current quota, please check your plan and billing details.\n' +
      '* Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_free_tier_requests, limit: 20, model: gemini-3.5-flash\n' +
      'Please retry in 31.550265287s.',
  );

  it('reads the delay the provider asked for', () => {
    expect(retryAfterMs(quotaError)).toBe(31_551);
  });

  it('finds it through the SDK wrapper', () => {
    expect(retryAfterMs({ name: 'AI_RetryError', lastError: quotaError })).toBe(31_551);
  });

  it('reads a Retry-After header when that is how it was stated', () => {
    expect(retryAfterMs({ responseHeaders: { 'retry-after': '20' } })).toBe(20_000);
  });

  it('is null when the provider said nothing about timing', () => {
    expect(retryAfterMs({ statusCode: 503, message: 'high demand' })).toBeNull();
    expect(retryAfterMs(new Error('boom'))).toBeNull();
  });

  it('still recognises the quota error as a rate limit', () => {
    expect(isRateLimited(quotaError)).toBe(true);
  });

  it('waits what the provider asked for, capped', async () => {
    const waits: number[] = [];
    let asked = 0;

    const client = createFailoverClient({
      providers: [
        {
          id: 'google',
          model: 'test',
          priority: 1,
          capacity: UNPACKED_TARGET.capacity,
          stream: () => {
            asked += 1;
            return Promise.reject(asked === 1 ? quotaError : new Error('done differently'));
          },
        },
      ],
      timeoutMs: TIMEOUT_MS,
      rateLimitBackoff: [1_000, 2_000, 4_000],
      sleep: (ms) => {
        waits.push(ms);
        return Promise.resolve();
      },
    });

    await expect(
      client.generateStreaming({ messages: [{ role: 'user', content: 'x' }], runId: 'run-1' }),
    ).rejects.toBeInstanceOf(AllProvidersFailedError);

    // 31.551s beats the 1s rung, and sits under the 35s ceiling.
    expect(waits).toEqual([31_551]);
  });

  it('does not wait longer than the ceiling, whatever the provider claims', async () => {
    const waits: number[] = [];

    const client = createFailoverClient({
      providers: [
        {
          id: 'google',
          model: 'test',
          priority: 1,
          capacity: UNPACKED_TARGET.capacity,
          stream: () => Promise.reject(new QuotaError('Please retry in 600s.')),
        },
      ],
      timeoutMs: TIMEOUT_MS,
      rateLimitBackoff: [1_000],
      sleep: (ms) => {
        waits.push(ms);
        return Promise.resolve();
      },
    });

    await expect(
      client.generateStreaming({ messages: [{ role: 'user', content: 'x' }], runId: 'run-1' }),
    ).rejects.toBeInstanceOf(AllProvidersFailedError);

    expect(waits).toEqual([MAX_RATE_LIMIT_WAIT_MS]);
  });
});

/**
 * The window is part of the chain now (task 130; амендмент А-8; D-146).
 *
 * A chain is a chain of *different windows*, so "the messages" stopped being one thing: the same
 * session state is an ordinary prompt for a hosted model and must be packed for a local one. Two
 * contracts meet here and are deliberately treated differently — a caller that asked to be packed to
 * a capacity and overshot it has a defect that will repeat identically, while a caller that stated a
 * fixed prompt has simply outgrown this link.
 *
 * What neither may do is reach the provider. A model handed more than it can read does not refuse;
 * it truncates from the front and answers confidently from what is left.
 */
describe('capacity at the boundary (А-8)', () => {
  const small = (tokens: number): ProviderEntry => ({
    ...fakeEntry('ollama', { document: 'local answer' }),
    capacity: { promptTokens: tokens, generationReserveTokens: 64 },
  });

  const oversize = { role: 'user' as const, content: 'x'.repeat(40_000) };

  it('builds the prompt once per attempt, from the capacity of the provider being tried', async () => {
    const seen: { provider: ProviderId; promptTokens: number }[] = [];

    const client = createFailoverClient({
      providers: [
        { ...fakeEntry('ollama', { failAfterChunks: 0 }), capacity: small(1_000).capacity },
        fakeEntry('google', { document: 'hosted answer' }, 2),
      ],
      timeoutMs: TIMEOUT_MS,
    });

    const result = await client.generateStreaming({
      messages: (target) => {
        seen.push({ provider: target.provider, promptTokens: target.capacity.promptTokens });
        return [{ role: 'user', content: 'a prompt that fits either window' }];
      },
      runId: 'run-1',
    });

    // Two attempts, two windows: the caller is asked again, for the link that is about to read it.
    expect(seen).toEqual([
      { provider: 'ollama', promptTokens: 1_000 },
      { provider: 'google', promptTokens: UNPACKED_TARGET.capacity.promptTokens },
    ]);
    expect(result.providerUsed).toBe('google');
  });

  it('never streams a prompt past the provider’s window: the next link answers instead', async () => {
    const failures: ProviderFailure[] = [];

    const client = createFailoverClient({
      providers: [small(10), fakeEntry('google', { document: 'hosted answer' }, 2)],
      timeoutMs: TIMEOUT_MS,
      onProviderFailure: (failure) => failures.push(failure),
    });

    const result = await client.generateStreaming({ messages: [oversize], runId: 'run-1' });

    expect(result.providerUsed).toBe('google');
    expect(failures.map((failure) => failure.reason)).toEqual(['over-capacity']);
    // The skipped link did not consume an attempt: the request was answered on the first one made.
    expect(result.attempts).toBe(1);
  });

  it('reports exhaustion when no link in the chain can hold the prompt', async () => {
    const client = createFailoverClient({
      providers: [small(10), { ...small(20), id: 'ollama' }],
      timeoutMs: TIMEOUT_MS,
    });

    await expect(
      client.generateStreaming({ messages: [oversize], runId: 'run-1' }),
    ).rejects.toBeInstanceOf(AllProvidersFailedError);
  });

  it('raises rather than failing over when a packer overshoots the capacity it was handed', async () => {
    const client = createFailoverClient({
      providers: [small(10), fakeEntry('google', { document: 'hosted answer' }, 2)],
      timeoutMs: TIMEOUT_MS,
    });

    await expect(
      client.generateStreaming({ messages: () => [oversize], runId: 'run-1' }),
    ).rejects.toBeInstanceOf(PromptOverCapacityError);
  });
});
