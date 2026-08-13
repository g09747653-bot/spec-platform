import { describe, expect, it } from 'vitest';

import { encodeEvent, type GenerationEvent } from '@/modules/web/api/stream-protocol';

import {
  applyEvent,
  createResumableStream,
  initialStreamState,
  type StreamState,
} from './resumable-stream';

/**
 * The resumable reader (task 46; FR-008 AC-2; FR-017; SC-3, SC-5; D-8).
 *
 * The properties under test are the ones a dropped connection actually threatens: nothing rendered is
 * lost, nothing is rendered twice, a failover clears the screen rather than splicing two documents
 * together, and a reconnect happens on its own. All of it runs against a fake `fetch` — no server, no
 * timers to wait on, and every scenario reproducible on demand.
 */

/** Builds a response whose body yields the given events, optionally cutting off partway. */
function streamOf(
  events: readonly GenerationEvent[],
  options: { cutAfter?: number } = {},
): Response {
  const encoder = new TextEncoder();
  const limit = options.cutAfter ?? events.length;

  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      events.slice(0, limit).forEach((event) => {
        controller.enqueue(encoder.encode(encodeEvent(event)));
      });

      if (limit < events.length) controller.error(new Error('connection reset'));
      else controller.close();
    },
  });

  return new Response(body, { status: 200 });
}

interface Call {
  url: string;
  method: string;
}

/** A fetch that answers each call from a queue and records what was asked for. */
function fakeFetch(responses: (() => Response)[]): { fetchImpl: typeof fetch; calls: Call[] } {
  const calls: Call[] = [];
  let index = 0;

  const fetchImpl = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    calls.push({ url, method: init?.method ?? 'GET' });

    const next = responses[index];
    index += 1;

    if (next === undefined) return Promise.reject(new Error('no response queued'));
    return Promise.resolve(next());
  }) as typeof fetch;

  return { fetchImpl, calls };
}

const run = (attempt = 1): GenerationEvent => ({
  type: 'run',
  runId: 'run-1',
  stage: 'constitution',
  attempt,
});
const delta = (sequence: number, text: string): GenerationEvent => ({
  type: 'delta',
  sequence,
  text,
});
const complete = (): GenerationEvent => ({
  type: 'complete',
  specFileId: 'file-1',
  revisionNumber: 1,
});

function reader(responses: (() => Response)[]) {
  const { fetchImpl, calls } = fakeFetch(responses);
  const states: StreamState[] = [];

  const stream = createResumableStream({
    fetchImpl,
    sleep: () => Promise.resolve(),
    backoff: [0, 0, 0],
    onState: (state) => states.push(state),
  });

  return { stream, calls, states };
}

describe('applyEvent', () => {
  it('appends deltas in order and tracks the highest rendered sequence', () => {
    const state = [delta(0, 'Hello '), delta(1, 'world')].reduce(applyEvent, initialStreamState);

    expect(state.text).toBe('Hello world');
    expect(state.sequence).toBe(1);
  });

  it('ignores a delta at or below what is already rendered', () => {
    const state = [delta(0, 'a'), delta(1, 'b'), delta(1, 'b'), delta(0, 'a')].reduce(
      applyEvent,
      initialStreamState,
    );

    expect(state.text).toBe('ab');
    expect(state.sequence).toBe(1);
  });

  it('throws away everything rendered on a restart (D-9)', () => {
    const state = [
      run(1),
      delta(0, 'from the first provider'),
      { type: 'restart', reason: 'provider_failover', attempt: 2 } as const,
      delta(0, 'from the second provider'),
    ].reduce(applyEvent, initialStreamState);

    expect(state.text).toBe('from the second provider');
    expect(state.text).not.toContain('first provider');
    expect(state.attempt).toBe(2);
    expect(state.sequence).toBe(0);
  });

  it('accepts sequence zero again after a restart, rather than treating it as a duplicate', () => {
    const before = [run(1), delta(0, 'one'), delta(1, 'two')].reduce(
      applyEvent,
      initialStreamState,
    );
    const after = applyEvent(before, { type: 'restart', reason: 'provider_failover', attempt: 2 });

    expect(applyEvent(after, delta(0, 'fresh')).text).toBe('fresh');
  });

  it('records the pending card on completion and the sanitised failure on error', () => {
    const done = applyEvent(initialStreamState, complete());
    expect(done).toMatchObject({ status: 'complete', specFileId: 'file-1', revisionNumber: 1 });

    const failed = applyEvent(initialStreamState, {
      type: 'error',
      code: 'GENERATION_FAILED',
      message: 'Generation did not complete.',
      retryable: true,
    });
    expect(failed.status).toBe('failed');
    expect(failed.error?.retryable).toBe(true);
  });

  it('drives the research indicator without touching the document', () => {
    const started = applyEvent(applyEvent(initialStreamState, delta(0, 'x')), {
      type: 'research',
      status: 'started',
    });

    expect(started.researching).toBe(true);
    expect(started.text).toBe('x');
    expect(applyEvent(started, { type: 'research', status: 'finished' }).researching).toBe(false);
  });
});

describe('following a stream', () => {
  it('opens the generation stream with POST and renders incrementally', async () => {
    const { stream, calls, states } = reader([
      () => streamOf([run(), delta(0, 'Hello '), delta(1, 'world'), complete()]),
    ]);

    const final = await stream.start('session-1');

    expect(calls[0]).toEqual({ url: '/api/sessions/session-1/generate', method: 'POST' });
    expect(final.status).toBe('complete');
    expect(final.text).toBe('Hello world');
    // Rendered as it arrived, not only at the end — the state was published per event.
    expect(states.map((state) => state.text)).toContain('Hello ');
  });

  it('reconnects to the resume endpoint when the connection drops, asking for what it lacks', async () => {
    const { stream, calls } = reader([
      () => streamOf([run(), delta(0, 'first half. ')], { cutAfter: 2 }),
      () => streamOf([run(), delta(1, 'second half.'), complete()]),
    ]);

    const final = await stream.start('session-1');

    expect(calls).toHaveLength(2);
    expect(calls[1]?.method).toBe('GET');
    expect(calls[1]?.url).toBe('/api/generations/run-1/stream?from=0&attempt=1');
    expect(final.text).toBe('first half. second half.');
    expect(final.status).toBe('complete');
  });

  it('loses nothing and duplicates nothing when the reconnect replays an overlap', async () => {
    const { stream } = reader([
      () => streamOf([run(), delta(0, 'one '), delta(1, 'two ')], { cutAfter: 3 }),
      // The server replays from the requested sequence; the client has already rendered batch 1.
      () => streamOf([run(), delta(1, 'two '), delta(2, 'three'), complete()]),
    ]);

    const final = await stream.start('session-1');

    expect(final.text).toBe('one two three');
  });

  it('survives a second disconnection', async () => {
    const { stream, calls } = reader([
      () => streamOf([run(), delta(0, 'a')], { cutAfter: 2 }),
      () => streamOf([run(), delta(1, 'b')], { cutAfter: 2 }),
      () => streamOf([run(), delta(2, 'c'), complete()]),
    ]);

    const final = await stream.start('session-1');

    expect(calls).toHaveLength(3);
    expect(calls[2]?.url).toBe('/api/generations/run-1/stream?from=1&attempt=1');
    expect(final.text).toBe('abc');
  });

  it('re-reads from zero when the resumed run has moved to a later attempt', async () => {
    const { stream, calls } = reader([
      () => streamOf([run(1), delta(0, 'abandoned text')], { cutAfter: 2 }),
      () =>
        streamOf([
          run(2),
          { type: 'restart', reason: 'provider_failover', attempt: 2 },
          delta(0, 'the real document'),
          complete(),
        ]),
    ]);

    const final = await stream.start('session-1');

    expect(calls[1]?.url).toContain('attempt=1');
    expect(final.text).toBe('the real document');
    expect(final.attempt).toBe(2);
  });

  it('gives up with a retryable error once the backoff is exhausted', async () => {
    const drop = () => streamOf([run(), delta(0, 'x')], { cutAfter: 2 });
    const { stream } = reader([drop, drop, drop, drop]);

    const final = await stream.start('session-1');

    expect(final.status).toBe('failed');
    expect(final.error).toMatchObject({ code: 'STREAM_DISCONNECTED', retryable: true });
  });

  it('fails without reconnecting when the first connection never named a run', async () => {
    const { stream, calls } = reader([() => new Response(null, { status: 500 })]);

    const final = await stream.start('session-1');

    expect(calls).toHaveLength(1);
    expect(final.status).toBe('failed');
  });

  it('stops reconnecting once the caller stops it', async () => {
    const { stream, calls } = reader([
      () => {
        stream.stop();
        return streamOf([run(), delta(0, 'x')], { cutAfter: 2 });
      },
      () => streamOf([complete()]),
    ]);

    await stream.start('session-1');

    expect(calls).toHaveLength(1);
  });

  it('resumes an existing run directly, which is the page-reload path', async () => {
    const { stream, calls } = reader([() => streamOf([run(), delta(3, 'tail'), complete()])]);

    const final = await stream.resume('run-9', 2, 1);

    expect(calls[0]).toEqual({
      url: '/api/generations/run-9/stream?from=2&attempt=1',
      method: 'GET',
    });
    expect(final.text).toBe('tail');
  });

  it('surfaces a server-sent error as a terminal state, not as a reconnect', async () => {
    const { stream, calls } = reader([
      () =>
        streamOf([
          run(),
          {
            type: 'error',
            code: 'GENERATION_FAILED',
            message: 'Generation did not complete.',
            retryable: true,
          },
        ]),
    ]);

    const final = await stream.start('session-1');

    expect(calls).toHaveLength(1);
    expect(final.status).toBe('failed');
    expect(final.error?.code).toBe('GENERATION_FAILED');
  });
});
