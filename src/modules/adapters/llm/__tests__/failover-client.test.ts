import { describe, expect, it } from 'vitest';

import { createFailoverClient, type ProviderFailure } from '../failover-client';
import type { ProviderEntry } from '../provider-registry';
import {
  AllProvidersFailedError,
  isRateLimited,
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

    expect(Object.keys(entry).sort()).toEqual(['id', 'model', 'priority', 'stream']);
    expect(typeof entry.stream).toBe('function');
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
