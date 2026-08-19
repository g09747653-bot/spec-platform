import { describe, expect, it } from 'vitest';

import { encodeEvent, type GenerationEvent } from '@/modules/web/api/stream-protocol';

import { translator } from '../i18n/translate';

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

/**
 * The English translator the reader writes its one sentence through (task 143).
 *
 * Real rather than stubbed, so a disconnect notice whose dictionary entry went missing fails here
 * instead of rendering its own key at the top of a failed generation.
 */
const t = translator('en');

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

/**
 * A connection that delivers its events and then stays open, silent, for ever.
 *
 * The case the idle deadline exists for, and — since round 4 — the ordinary shape of a slow local
 * generation: the run is alive and producing nothing yet, so the reader must drop this connection and
 * find the run again rather than sit on it (Р-2).
 */
function stalls(events: readonly GenerationEvent[]): Response {
  const encoder = new TextEncoder();

  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      events.forEach((event) => {
        controller.enqueue(encoder.encode(encodeEvent(event)));
      });
      // Never closed and never errored: an open socket carrying nothing.
    },
  });

  return new Response(body, { status: 200 });
}

/**
 * A connection that says nothing but `heartbeat` for a while, then produces (round 5, Р-4; А-9).
 *
 * The shape of every long local generation: the run is alive, the socket is fine, and there is no
 * text yet because the model is still reading the prompt or reasoning. The beats are what tell the
 * reader those two facts apart from a far end that has gone away.
 *
 * It honours the abort signal, because that is the one behaviour of `fetch` this file's `stop()`
 * depends on: without it a stopped reader would go on consuming beats for ever.
 */
function beating(options: {
  beatMs: number;
  beats: number;
  lead?: readonly GenerationEvent[];
  then?: readonly GenerationEvent[];
  signal?: AbortSignal | null;
}): Response {
  const encoder = new TextEncoder();
  const write = (
    controller: ReadableStreamDefaultController<Uint8Array>,
    event: GenerationEvent,
  ) => {
    controller.enqueue(encoder.encode(encodeEvent(event)));
  };

  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      (options.lead ?? [run()]).forEach((event) => {
        write(controller, event);
      });

      let beats = 0;
      const timer = setInterval(() => {
        if (beats < options.beats) {
          beats += 1;
          write(controller, { type: 'heartbeat' });
          return;
        }

        clearInterval(timer);
        (options.then ?? []).forEach((event) => {
          write(controller, event);
        });
        controller.close();
      }, options.beatMs);

      options.signal?.addEventListener('abort', () => {
        clearInterval(timer);
        controller.error(new Error('aborted'));
      });
    },
  });

  return new Response(body, { status: 200 });
}

interface Call {
  url: string;
  method: string;
}

/** A fetch that answers each call from a queue and records what was asked for. */
function fakeFetch(responses: ((init?: RequestInit) => Response)[]): {
  fetchImpl: typeof fetch;
  calls: Call[];
} {
  const calls: Call[] = [];
  let index = 0;

  const fetchImpl = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    calls.push({ url, method: init?.method ?? 'GET' });

    const next = responses[index];
    index += 1;

    if (next === undefined) return Promise.reject(new Error('no response queued'));
    return Promise.resolve(next(init));
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

function reader(responses: ((init?: RequestInit) => Response)[]) {
  const { fetchImpl, calls } = fakeFetch(responses);
  const states: StreamState[] = [];

  const stream = createResumableStream({
    t,
    fetchImpl,
    sleep: () => Promise.resolve(),
    backoff: [0, 0, 0],
    onState: (state) => states.push(state),
  });

  return { stream, calls, states };
}

/**
 * Scaled-down twins of the production pair (15 s beat, 45 s deadline).
 *
 * The ratio here is sixteen beats to a deadline rather than three, and deliberately so: a worker
 * running this suite alongside eighty others does not get its timers when it asks for them, and a
 * beat that slips past the deadline would read as a defect in the reader rather than as load on the
 * machine. Sixteen missed slots in a row is not slip. (Production keeps three, because there the
 * beat is 15 seconds and nothing slips by 45.)
 */
const BEAT_MS = 25;
const IDLE_MS = 400;

/**
 * The same reader against a real clock.
 *
 * Everywhere else the deadline is a fake `sleep` that resolves at once, which is what makes those
 * tests instant — but it also means they cannot say anything about *when* the deadline fires. These
 * three properties are about exactly that, so here the timers are real.
 */
function timedReader(responses: ((init?: RequestInit) => Response)[]) {
  const { fetchImpl, calls } = fakeFetch(responses);
  const states: StreamState[] = [];

  const stream = createResumableStream({
    t,
    fetchImpl,
    backoff: [0, 0, 0],
    idleTimeoutMs: IDLE_MS,
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

  /**
   * Round 5, Р-4 (А-9). A heartbeat's whole effect happened before the reducer saw it — the read
   * that carried it reset the idle deadline. Here it must do nothing else at all: any change to
   * text, sequence or attempt would be a transport event editing the durable position, which is the
   * one thing Р-2 forbids it.
   */
  it('leaves everything exactly as it was when a heartbeat arrives', () => {
    const before = [run(1), delta(0, 'half a document'), { type: 'research', status: 'started' }]
      .map((event) => event as GenerationEvent)
      .reduce(applyEvent, initialStreamState);

    const after = [{ type: 'heartbeat' } as const, { type: 'heartbeat' } as const].reduce(
      applyEvent,
      before,
    );

    expect(after).toEqual(before);
    expect(after.sequence).toBe(0);
    expect(after.attempt).toBe(1);
    expect(after.status).toBe('streaming');
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

  /**
   * Round 4, Р-2 (D-95). The generation endpoint no longer cancels a run when its reader drops, so a
   * reconnect finds a producer that is still going. These are the reader's half of that: what it does
   * with a connection that goes quiet, and how long it is prepared to wait.
   */
  describe('a run that outlives its connections', () => {
    it('drops a silent connection and resumes it, rather than waiting on it for ever', async () => {
      const { stream, calls } = reader([
        () => stalls([run(), delta(0, 'the first tokens, ')]),
        () => streamOf([run(), delta(1, 'then the rest.'), complete()]),
      ]);

      const final = await stream.start('session-1');

      expect(calls[1]?.url).toBe('/api/generations/run-1/stream?from=0&attempt=1');
      expect(final.status).toBe('complete');
      expect(final.text).toBe('the first tokens, then the rest.');
    });

    /**
     * The generation this whole round is about: chunks arriving further apart than the reader's idle
     * deadline. Each connection carries one delta and then goes quiet, so the reader reconnects far
     * more times than the backoff ladder is long — and still gets its revision, because a connection
     * that moved the run forward is evidence of a live producer, not of a broken one.
     */
    it('keeps waiting while the run keeps producing, however many connections that spans', async () => {
      const slow = Array.from(
        { length: 6 },
        (_unused, index) => () => stalls([run(), delta(index, `chunk ${String(index)}. `)]),
      );

      const { stream, calls, states } = reader([
        ...slow,
        () => streamOf([run(), delta(6, 'done.'), complete()]),
      ]);

      const final = await stream.start('session-1');

      // Seven connections against a ladder of three: the ladder measures silence, not patience.
      expect(calls).toHaveLength(7);
      expect(final.status).toBe('complete');
      expect(final.text).toBe('chunk 0. chunk 1. chunk 2. chunk 3. chunk 4. chunk 5. done.');
      // And it never announced a failure on the way — the user sees reconnecting, not "try again".
      expect(states.some((state) => state.status === 'failed')).toBe(false);
    });

    it('still gives up when reconnecting finds nothing new — a stale run is not a live one', async () => {
      const nothingNew = () => stalls([run()]);
      const { stream, calls } = reader([nothingNew, nothingNew, nothingNew, nothingNew]);

      const final = await stream.start('session-1');

      expect(calls).toHaveLength(4);
      expect(final.status).toBe('failed');
      expect(final.error).toMatchObject({ code: 'STREAM_DISCONNECTED', retryable: true });
    });

    it('takes the revision from a reconnect that finds the run already finished', async () => {
      const { stream } = reader([
        () => stalls([run()]),
        () => streamOf([run(), delta(0, 'the whole document'), complete()]),
      ]);

      const final = await stream.start('session-1');

      expect(final).toMatchObject({ status: 'complete', specFileId: 'file-1', revisionNumber: 1 });
    });

    it('shows the failure a reconnect finds, without another reconnect', async () => {
      const { stream, calls } = reader([
        () => stalls([run()]),
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
        () => streamOf([complete()]),
      ]);

      const final = await stream.start('session-1');

      expect(calls).toHaveLength(2);
      expect(final.status).toBe('failed');
      expect(final.error?.code).toBe('GENERATION_FAILED');
    });

    it('stops on the user’s say-so even while the producer is alive (round 2, Д-1)', async () => {
      const { stream, calls } = reader([
        () => {
          stream.stop();
          return stalls([run(), delta(0, 'half a document')]);
        },
        () => streamOf([complete()]),
      ]);

      const final = await stream.start('session-1');

      expect(calls).toHaveLength(1);
      expect(final.status).toBe('idle');
      // Stopping keeps what was rendered; it is the only evidence of what the run produced.
      expect(final.text).toBe('half a document');
    });
  });

  /**
   * Round 5, Р-4 (А-9). What the M9п gate's Edit step needed and did not have: minutes of silence
   * from a producer that is working, told apart from a connection whose far end is gone. Real
   * timers here — the point of each case is the deadline, and a fake `sleep` would assert nothing
   * about it.
   */
  describe('a producer that is silent but alive', () => {
    it('waits through silence many deadlines long while the beats keep coming', async () => {
      // Three deadlines' worth of a producer with nothing to show for itself but its own liveness.
      const { stream, calls, states } = timedReader([
        (init) =>
          beating({
            beatMs: BEAT_MS,
            beats: (3 * IDLE_MS) / BEAT_MS,
            then: [delta(0, 'the proposal, at last'), complete()],
            signal: init?.signal ?? null,
          }),
      ]);

      const final = await stream.start('session-1');

      // One connection, start to finish: nothing was ever treated as dropped.
      expect(calls).toHaveLength(1);
      expect(final.status).toBe('complete');
      expect(final.text).toBe('the proposal, at last');
      // And no error card while it waited — the page said "waiting", not "try again".
      expect(states.some((state) => state.status === 'failed')).toBe(false);
      expect(states.some((state) => state.status === 'reconnecting')).toBe(false);
    });

    it('still calls a producer that sends nothing at all dead, on the same deadline', async () => {
      const silent = () => stalls([run()]);
      const { stream, calls } = timedReader([silent, silent, silent, silent]);

      const final = await stream.start('session-1');

      // Four connections — the first plus a ladder of three — then the state the user can act from.
      expect(calls).toHaveLength(4);
      expect(final.status).toBe('failed');
      expect(final.error).toMatchObject({ code: 'STREAM_DISCONNECTED', retryable: true });
    });

    it('stops on the user’s say-so mid-beat, and does not reconnect', async () => {
      const { stream, calls } = timedReader([
        (init) => beating({ beatMs: BEAT_MS, beats: 10_000, signal: init?.signal ?? null }),
        () => streamOf([complete()]),
      ]);

      setTimeout(() => {
        stream.stop();
      }, BEAT_MS * 4);

      const final = await stream.start('session-1');

      expect(calls).toHaveLength(1);
      expect(final.status).toBe('idle');
    });
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
