import { describe, expect, it } from 'vitest';

import { eventBus, type LoopEvent } from './bus.ts';

/**
 * The in-process bus (task 153).
 *
 * Small, and the two properties that matter are both about not losing the run: one publisher must
 * reach every subscriber, and a subscriber that throws must not take the publisher — the
 * orchestrator, mid-build — down with it.
 */
describe('the loop event bus (task 153)', () => {
  const log = (message: string): LoopEvent => ({
    type: 'log',
    log: {
      logId: 1,
      projectId: 'p1',
      taskId: null,
      agentRole: 'ORCHESTRATOR',
      logLevel: 'INFO',
      message,
      createdAt: '2026-08-20 12:00:00',
    },
  });

  it('is one bus per process, however many times the module is asked for it', () => {
    expect(eventBus()).toBe(eventBus());
  });

  it('reaches every subscriber', () => {
    const bus = eventBus();
    const first: LoopEvent[] = [];
    const second: LoopEvent[] = [];

    const offFirst = bus.subscribe((event) => first.push(event));
    const offSecond = bus.subscribe((event) => second.push(event));

    bus.publish(log('строка'));

    expect(first).toHaveLength(1);
    expect(second).toHaveLength(1);

    offFirst();
    offSecond();
  });

  it('stops reaching a subscriber that unsubscribed', () => {
    const bus = eventBus();
    const received: LoopEvent[] = [];

    const off = bus.subscribe((event) => received.push(event));
    bus.publish(log('первая'));
    off();
    bus.publish(log('вторая'));

    expect(received).toHaveLength(1);
  });

  it('survives a subscriber that throws, and still reaches the others', () => {
    // A dead browser connection must not stop the loop from building software.
    const bus = eventBus();
    const reached: string[] = [];

    const offBad = bus.subscribe(() => {
      throw new Error('оборванное соединение');
    });
    const offGood = bus.subscribe(() => {
      reached.push('ok');
    });

    expect(() => {
      bus.publish(log('строка'));
    }).not.toThrow();
    expect(reached).toEqual(['ok']);

    offBad();
    offGood();
  });

  it('tolerates a subscriber unsubscribing from inside its own callback', () => {
    const bus = eventBus();
    let calls = 0;

    const off = bus.subscribe(() => {
      calls += 1;
      off();
    });

    bus.publish(log('первая'));
    bus.publish(log('вторая'));

    expect(calls).toBe(1);
  });

  it('counts its subscribers, so a leak is visible rather than inferred', () => {
    const bus = eventBus();
    const before = bus.subscriberCount();

    const off = bus.subscribe(() => {
      /* a subscriber that does nothing is still a subscriber */
    });
    expect(bus.subscriberCount()).toBe(before + 1);

    off();
    expect(bus.subscriberCount()).toBe(before);
  });
});
