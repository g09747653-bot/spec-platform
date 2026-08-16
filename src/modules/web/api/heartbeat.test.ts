import { describe, expect, it } from 'vitest';

import { DEFAULT_IDLE_TIMEOUT_MS } from '@/modules/web/session/resumable-stream';

import { HEARTBEAT_INTERVAL_MS, withHeartbeat, type Schedule } from './heartbeat';
import { generationEventSchema, type GenerationEvent } from './stream-protocol';

/**
 * The producer's proof of life (round 5, Р-4; амендмент А-9).
 *
 * Tested against a clock the test owns rather than a real one, because the property worth asserting
 * is *when* a beat is due — after silence, never during output — and a test that waits on real
 * seconds asserts that badly and slowly.
 */

/** A clock the test advances by hand. Only ever one timer armed, which is the design. */
function fakeClock(): { schedule: Schedule; advance: (ms: number) => void; armed: () => boolean } {
  let pending: { at: number; fn: () => void } | null = null;
  let now = 0;

  const schedule: Schedule = (fn, ms) => {
    pending = { at: now + ms, fn };
    return () => {
      pending = null;
    };
  };

  const advance = (ms: number) => {
    const until = now + ms;

    for (;;) {
      const next = pending;
      if (next === null || next.at > until) break;

      now = next.at;
      pending = null;
      next.fn();
    }

    now = until;
  };

  return { schedule, advance, armed: () => pending !== null };
}

function beating(intervalMs = 1_000) {
  const sent: GenerationEvent[] = [];
  const clock = fakeClock();
  const beat = withHeartbeat((event) => sent.push(event), { intervalMs, schedule: clock.schedule });

  return { beat, sent, clock };
}

const types = (events: readonly GenerationEvent[]) => events.map((event) => event.type);

describe('withHeartbeat', () => {
  it('beats once per interval of silence', () => {
    const { sent, clock } = beating();

    clock.advance(3_500);

    expect(types(sent)).toEqual(['heartbeat', 'heartbeat', 'heartbeat']);
  });

  it('sends what it is given, unchanged and immediately', () => {
    const { beat, sent } = beating();

    beat.send({ type: 'run', runId: 'run-1', stage: 'constitution', attempt: 1 });

    expect(sent).toEqual([{ type: 'run', runId: 'run-1', stage: 'constitution', attempt: 1 }]);
  });

  it('measures silence from the last event sent, not from the last beat', () => {
    const { beat, sent, clock } = beating();

    clock.advance(900);
    beat.send({ type: 'delta', sequence: 0, text: 'writing' });
    clock.advance(900);

    // Nine tenths of an interval either side of a delta is not an interval of silence.
    expect(types(sent)).toEqual(['delta']);

    clock.advance(200);
    expect(types(sent)).toEqual(['delta', 'heartbeat']);
  });

  it('never beats through a stream that is producing steadily', () => {
    const { beat, sent, clock } = beating();

    for (let index = 0; index < 20; index += 1) {
      clock.advance(500);
      beat.send({ type: 'delta', sequence: index, text: 'x' });
    }

    expect(sent.every((event) => event.type === 'delta')).toBe(true);
  });

  it('stops for good when the stream closes, and stopping twice is not an event', () => {
    const { beat, sent, clock } = beating();

    clock.advance(1_000);
    beat.stop();
    beat.stop();
    clock.advance(60_000);

    expect(types(sent)).toEqual(['heartbeat']);
    expect(clock.armed()).toBe(false);
  });

  it('emits an event the wire protocol accepts', () => {
    const { sent, clock } = beating();

    clock.advance(1_000);

    expect(generationEventSchema.parse(sent[0])).toEqual({ type: 'heartbeat' });
  });

  /**
   * Three beats inside the reader's 45 s deadline. The two constants are a pair — the deadline is a
   * statement about missed beats — so a change to either that breaks the ratio should fail here
   * rather than on a live walk.
   */
  it('leaves room for missed beats inside the reader’s deadline', () => {
    expect(HEARTBEAT_INTERVAL_MS * 3).toBeLessThanOrEqual(DEFAULT_IDLE_TIMEOUT_MS);
  });
});
