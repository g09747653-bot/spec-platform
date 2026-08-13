import { describe, expect, it } from 'vitest';

import { createFailoverClient, type ProviderFailure } from '../failover-client';
import { AllProvidersFailedError, type AttemptStart, type ProviderId } from '../types';

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
