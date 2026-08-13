import { describe, expect, it } from 'vitest';

import { createStreamRecorder, type ChunkStore, type RecordedChunk } from '../stream-recorder';

/**
 * The durable chunk log's writer (task 44; D-7; SC-1).
 *
 * The store is a fake that records calls, so these cases assert the *policy* — when a batch is
 * written, what a restart throws away, when the stamp lands — without a database. The tables
 * themselves are exercised against PGlite in `src/db/schema/generation.test.ts`.
 */

interface Recorded {
  appended: RecordedChunk[];
  emitted: RecordedChunk[];
  stamps: Date[];
  cleared: number;
  discarded: number;
  pruned: number;
}

function fakeStore(): { store: ChunkStore; log: Recorded } {
  const log: Recorded = {
    appended: [],
    emitted: [],
    stamps: [],
    cleared: 0,
    discarded: 0,
    pruned: 0,
  };

  const store: ChunkStore = {
    append: (_runId, chunk) => {
      log.appended.push(chunk);
      return Promise.resolve();
    },
    discardAll: () => {
      log.discarded += 1;
      log.appended.length = 0;
      return Promise.resolve();
    },
    stampFirstToken: (_runId, at) => {
      log.stamps.push(at);
      return Promise.resolve();
    },
    clearFirstToken: () => {
      log.cleared += 1;
      return Promise.resolve();
    },
    prune: () => {
      log.pruned += 1;
      return Promise.resolve();
    },
  };

  return { store, log };
}

/** A recorder that only flushes when told to, so batching is asserted rather than raced. */
function recorderFor(log: Recorded, store: ChunkStore, overrides = {}) {
  return createStreamRecorder({
    runId: 'run-1',
    store,
    onBatch: (chunk) => log.emitted.push(chunk),
    batchMs: 60_000,
    batchBytes: 2048,
    ...overrides,
  });
}

describe('batching', () => {
  it('appends batches, not tokens', async () => {
    const { store, log } = fakeStore();
    const recorder = recorderFor(log, store);

    for (const word of 'the quick brown fox jumps over the lazy dog'.split(' ')) {
      recorder.delta(`${word} `);
    }
    await recorder.flush();

    expect(log.appended).toHaveLength(1);
    expect(log.appended[0]?.delta).toBe('the quick brown fox jumps over the lazy dog ');
  });

  it('flushes as soon as the size threshold is crossed', async () => {
    const { store, log } = fakeStore();
    const recorder = recorderFor(log, store, { batchBytes: 10 });

    recorder.delta('12345');
    expect(log.appended).toHaveLength(0);

    recorder.delta('67890');
    await recorder.flush();

    expect(log.appended).toHaveLength(1);
    expect(log.appended[0]?.delta).toBe('1234567890');
  });

  it('flushes on the time threshold even when the text trickles', async () => {
    const { store, log } = fakeStore();
    const recorder = recorderFor(log, store, { batchMs: 10 });

    recorder.delta('a single token');
    await new Promise((resolve) => setTimeout(resolve, 40));

    expect(log.appended).toHaveLength(1);
  });

  it('numbers batches from zero, consecutively', async () => {
    const { store, log } = fakeStore();
    const recorder = recorderFor(log, store);

    recorder.delta('first');
    await recorder.flush();
    recorder.delta('second');
    await recorder.flush();
    recorder.delta('third');
    await recorder.flush();

    expect(log.appended.map((chunk) => chunk.sequence)).toEqual([0, 1, 2]);
    expect(recorder.nextSequence).toBe(3);
  });

  it('writes nothing for an empty flush', async () => {
    const { store, log } = fakeStore();
    const recorder = recorderFor(log, store);

    await recorder.flush();
    recorder.delta('');
    await recorder.flush();

    expect(log.appended).toEqual([]);
    expect(log.stamps).toEqual([]);
  });
});

describe('persist before emit', () => {
  it('emits a batch only once it is durable, so a resume can never miss rendered text', async () => {
    const order: string[] = [];
    const { log } = fakeStore();
    const store: ChunkStore = {
      append: () => {
        order.push('append');
        return Promise.resolve();
      },
      discardAll: () => Promise.resolve(),
      stampFirstToken: () => Promise.resolve(),
      clearFirstToken: () => Promise.resolve(),
      prune: () => Promise.resolve(),
    };

    const recorder = createStreamRecorder({
      runId: 'run-1',
      store,
      batchMs: 60_000,
      onBatch: () => order.push('emit'),
    });

    recorder.delta('hello');
    await recorder.flush();

    expect(order).toEqual(['append', 'emit']);
    expect(log.appended).toEqual([]);
  });

  it('emits every batch it appends, with the same sequence', async () => {
    const { store, log } = fakeStore();
    const recorder = recorderFor(log, store);

    recorder.delta('one');
    await recorder.flush();
    recorder.delta('two');
    await recorder.flush();

    expect(log.emitted).toEqual(log.appended);
  });
});

describe('first_token_at (SC-1)', () => {
  it('stamps once, on the first delta rather than the first batch', async () => {
    const { store, log } = fakeStore();
    const at = new Date('2026-08-13T10:00:00.000Z');
    const recorder = recorderFor(log, store, { now: () => at });

    recorder.delta('first');
    recorder.delta('second');
    recorder.delta('third');
    await recorder.flush();

    expect(log.stamps).toEqual([at]);
  });

  it('does not stamp a run that produced no text', async () => {
    const { store, log } = fakeStore();
    const recorder = recorderFor(log, store);

    await recorder.fail();

    expect(log.stamps).toEqual([]);
  });

  it('re-stamps from the successful attempt after a restart', async () => {
    const { store, log } = fakeStore();
    const times = [new Date('2026-08-13T10:00:00.000Z'), new Date('2026-08-13T10:00:05.000Z')];
    let index = 0;
    const recorder = recorderFor(log, store, { now: () => times[index++] ?? times[0] });

    recorder.delta('abandoned');
    await recorder.flush();
    await recorder.restart();
    recorder.delta('the real answer');
    await recorder.flush();

    expect(log.cleared).toBe(1);
    expect(log.stamps).toEqual(times);
  });
});

describe('restart (D-9; FR-018 AC-5)', () => {
  it('discards persisted chunks and starts numbering again at zero', async () => {
    const { store, log } = fakeStore();
    const recorder = recorderFor(log, store);

    recorder.delta('from the first provider');
    await recorder.flush();
    expect(recorder.nextSequence).toBe(1);

    await recorder.restart();

    expect(log.discarded).toBe(1);
    expect(recorder.nextSequence).toBe(0);

    recorder.delta('from the second provider');
    await recorder.flush();

    expect(log.appended).toEqual([{ sequence: 0, delta: 'from the second provider' }]);
  });

  it('drops text buffered but not yet written, so no partial output survives', async () => {
    const { store, log } = fakeStore();
    const recorder = recorderFor(log, store);

    recorder.delta('half a sentence');
    await recorder.restart();
    await recorder.flush();

    expect(log.appended).toEqual([]);
    expect(log.emitted).toEqual([]);
  });
});

describe('the end of a run', () => {
  it('flushes what is buffered and then prunes the log', async () => {
    const { store, log } = fakeStore();
    const recorder = recorderFor(log, store);

    recorder.delta('the last words');
    await recorder.complete();

    expect(log.emitted).toHaveLength(1);
    expect(log.pruned).toBe(1);
  });

  it('prunes without persisting anything when the run failed', async () => {
    const { store, log } = fakeStore();
    const recorder = recorderFor(log, store);

    recorder.delta('a document that never finished');
    await recorder.fail();

    expect(log.appended).toEqual([]);
    expect(log.pruned).toBe(1);
  });
});
