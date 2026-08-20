import { describe, expect, it } from 'vitest';

import {
  DEFAULT_MAX_EXECUTORS,
  schedule,
  type ScheduleMilestone,
  type SchedulePlan,
  type ScheduleTask,
} from './schedule.ts';
import {
  BLIND_THROTTLE_MS,
  describeThrottle,
  IDLE_THROTTLE,
  observeRateLimit,
  remainingMs,
  throttled,
} from './throttle.ts';

/**
 * The scheduler and the tariff, as tables (task 159).
 *
 * Both are pure, and both are here for the same reason the platform's `policy.test.ts` exists: a
 * live run can show ten executors working, and only a table can show what happens at the positions a
 * healthy run never reaches — a milestone whose dependency failed, two tasks reaching for one file,
 * a plan wider than the ceiling, a window that closed mid-run.
 */

const milestone = (
  milestoneId: string,
  over: Partial<ScheduleMilestone> = {},
): ScheduleMilestone => ({
  milestoneId,
  status: 'PENDING',
  position: 0,
  dependsOn: [],
  ...over,
});

const task = (taskId: string, over: Partial<ScheduleTask> = {}): ScheduleTask => ({
  taskId,
  milestoneId: 'ms_01',
  status: 'PENDING',
  position: 0,
  filesToEdit: [],
  dependsOn: [],
  ...over,
});

const started = (result: ReturnType<typeof schedule>) => result.start.map((entry) => entry.taskId);

describe('who may start now (task 159)', () => {
  it('runs the tasks of one milestone together when they touch nothing in common', () => {
    const plan: SchedulePlan = {
      milestones: [milestone('ms_01')],
      tasks: [
        task('a', { filesToEdit: ['lib/view.js'], position: 0 }),
        task('b', { filesToEdit: ['lib/state.js'], position: 1 }),
        task('c', { filesToEdit: ['schemas/scene.json'], position: 2 }),
      ],
    };

    expect(started(schedule({ plan, running: [], limit: 10 }))).toEqual(['a', 'b', 'c']);
  });

  it('holds a task whose files another task already has', () => {
    const plan: SchedulePlan = {
      milestones: [milestone('ms_01')],
      tasks: [
        task('a', { filesToEdit: ['lib/view.js'], position: 0 }),
        task('b', { filesToEdit: ['lib/view.js', 'lib/menu.js'], position: 1 }),
        task('c', { filesToEdit: ['lib/menu.js'], position: 2 }),
      ],
    };

    const result = schedule({ plan, running: [], limit: 10 });

    expect(started(result), 'b waits for a; c waits for nobody, because b did not start').toEqual([
      'a',
      'c',
    ]);
    expect(result.held).toContainEqual({ taskId: 'b', reason: 'files' });
  });

  it('counts what is already running as holding its files', () => {
    const plan: SchedulePlan = {
      milestones: [milestone('ms_01')],
      tasks: [
        task('a', { status: 'IN_PROGRESS', filesToEdit: ['lib/view.js'] }),
        task('b', { filesToEdit: ['lib/view.js'], position: 1 }),
      ],
    };

    expect(started(schedule({ plan, running: ['a'], limit: 10 }))).toEqual([]);
  });

  it('does not open a milestone whose dependency is unfinished, however free the machine is', () => {
    const plan: SchedulePlan = {
      milestones: [
        milestone('ms_01', { status: 'IN_PROGRESS', position: 0 }),
        milestone('ms_02', { position: 1, dependsOn: ['ms_01'] }),
      ],
      tasks: [task('a', { status: 'IN_PROGRESS' }), task('b', { milestoneId: 'ms_02' })],
    };

    const result = schedule({ plan, running: ['a'], limit: 10 });

    expect(started(result)).toEqual([]);
    expect(result.held).toContainEqual({ taskId: 'b', reason: 'milestone' });
  });

  it('opens the next milestone the moment the one before it is complete', () => {
    const plan: SchedulePlan = {
      milestones: [
        milestone('ms_01', { status: 'COMPLETED', position: 0 }),
        milestone('ms_02', { position: 1, dependsOn: ['ms_01'] }),
      ],
      tasks: [task('a', { status: 'COMPLETED' }), task('b', { milestoneId: 'ms_02' })],
    };

    expect(started(schedule({ plan, running: [], limit: 10 }))).toEqual(['b']);
  });

  it('runs two milestones that wait for nothing from each other', () => {
    const plan: SchedulePlan = {
      milestones: [milestone('ms_01', { position: 0 }), milestone('ms_02', { position: 1 })],
      tasks: [task('a'), task('b', { milestoneId: 'ms_02' })],
    };

    expect(started(schedule({ plan, running: [], limit: 10 }))).toEqual(['a', 'b']);
  });

  it('never exceeds the ceiling, and says so about the ones it held', () => {
    const plan: SchedulePlan = {
      milestones: [milestone('ms_01')],
      tasks: Array.from({ length: 14 }, (_, index) =>
        task(`t${String(index)}`, { position: index, filesToEdit: [`file-${String(index)}.ts`] }),
      ),
    };

    const result = schedule({ plan, running: ['already'], limit: 3 });

    expect(result.start).toHaveLength(2);
    expect(result.held.filter((entry) => entry.reason === 'ceiling')).toHaveLength(12);
  });

  it('waits for a task its own plan says it depends on', () => {
    const plan: SchedulePlan = {
      milestones: [milestone('ms_01')],
      tasks: [task('a', { position: 0 }), task('b', { position: 1, dependsOn: ['a'] })],
    };

    const result = schedule({ plan, running: [], limit: 10 });

    expect(started(result)).toEqual(['a']);
    expect(result.held).toContainEqual({ taskId: 'b', reason: 'dependency' });
  });

  it('keeps the ceiling the bundle asked for', () => {
    expect(DEFAULT_MAX_EXECUTORS).toBe(10);
  });
});

describe('the tariff, which is a state and not an error (task 159; А-24 §2)', () => {
  const AT = 1_000_000;

  it('holds new starts until the window the CLI named, then lets go', () => {
    const held = observeRateLimit(
      IDLE_THROTTLE,
      {
        status: 'rejected',
        window: 'five_hour',
        resetsAt: (AT + 90_000) / 1000,
      },
      AT,
    );

    expect(throttled(held, AT)).toBe(true);
    expect(remainingMs(held, AT)).toBe(90_000);
    expect(throttled(held, AT + 90_001)).toBe(false);
  });

  it('guesses a short wait when the CLI does not say when it reopens', () => {
    const held = observeRateLimit(IDLE_THROTTLE, { status: 'rejected' }, AT);

    expect(remainingMs(held, AT)).toBe(BLIND_THROTTLE_MS);
  });

  it('lets go at once when the CLI says the window is open again', () => {
    const held = observeRateLimit(
      IDLE_THROTTLE,
      { status: 'rejected', resetsAt: (AT + 900_000) / 1000 },
      AT,
    );
    const freed = observeRateLimit(held, { status: 'allowed' }, AT + 1_000);

    expect(throttled(freed, AT + 1_000), 'the provider outranks our own deadline').toBe(false);
  });

  it('counts one pause per hold, however often the status repeats', () => {
    let state = observeRateLimit(
      IDLE_THROTTLE,
      { status: 'rejected', resetsAt: (AT + 60_000) / 1000 },
      AT,
    );
    state = observeRateLimit(
      state,
      { status: 'rejected', resetsAt: (AT + 60_000) / 1000 },
      AT + 1_000,
    );
    state = observeRateLimit(
      state,
      { status: 'rejected', resetsAt: (AT + 60_000) / 1000 },
      AT + 2_000,
    );

    expect(state.pauses).toBe(1);

    const again = observeRateLimit(
      observeRateLimit(state, { status: 'allowed' }, AT + 61_000),
      { status: 'rejected', resetsAt: (AT + 120_000) / 1000 },
      AT + 62_000,
    );
    expect(again.pauses).toBe(2);
  });

  it('says which window, which status and how long — never «something went wrong»', () => {
    const held = observeRateLimit(
      IDLE_THROTTLE,
      {
        status: 'rejected',
        window: 'five_hour',
        resetsAt: (AT + 30_000) / 1000,
      },
      AT,
    );

    const line = describeThrottle(held, AT);

    expect(line).toContain('five_hour');
    expect(line).toContain('rejected');
    expect(line).toContain('30 с');
    expect(line).toContain('доигрывают');
  });

  it('ignores an event that carries no status at all', () => {
    expect(observeRateLimit(IDLE_THROTTLE, {}, AT)).toEqual(IDLE_THROTTLE);
  });
});
