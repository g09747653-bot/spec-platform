import { describe, expect, it } from 'vitest';

import { describeSlice, phaseOf, sliceMilestones } from './milestones.ts';

/**
 * Slicing milestones (task 156).
 *
 * The layout is a fact about the plan and is computed by code — so it is asserted the way facts are:
 * against plans whose right answer is not a matter of taste. The two that matter most are the cycle
 * (a named error, never a hang) and the phase fallback (the shape the M14а gate actually produced).
 */
const task = (taskId: string, dependsOn: string[] = []) => ({ taskId, dependsOn });

describe('slicing by stated dependencies (task 156)', () => {
  it('puts everything that waits for nothing in the first milestone', () => {
    const result = sliceMilestones([
      task('1'),
      task('2', ['1']),
      task('3', ['1']),
      task('4', ['2', '3']),
    ]);

    expect(result.ok && result.strategy).toBe('dependencies');
    expect(result.ok && result.milestones.map((milestone) => milestone.taskIds)).toEqual([
      ['1'],
      ['2', '3'],
      ['4'],
    ]);
  });

  it('leaves tasks inside a milestone independent of each other — what the parallel scheduler needs', () => {
    const result = sliceMilestones([task('a'), task('b'), task('c', ['a']), task('d', ['b'])]);

    expect(result.ok && result.milestones[0]?.taskIds).toEqual(['a', 'b']);
    expect(result.ok && result.milestones[1]?.taskIds).toEqual(['c', 'd']);
  });

  it('chains the milestones so each waits for the one before it', () => {
    const result = sliceMilestones([task('1'), task('2', ['1']), task('3', ['2'])]);

    expect(result.ok && result.milestones.map((milestone) => milestone.dependsOn)).toEqual([
      [],
      ['ms_01'],
      ['ms_02'],
    ]);
  });

  it('numbers milestones so a lexical sort is the execution order', () => {
    const many = Array.from({ length: 12 }, (_unused, index) =>
      task(String(index + 1), index === 0 ? [] : [String(index)]),
    );
    const result = sliceMilestones(many);
    const ids = result.ok ? result.milestones.map((milestone) => milestone.milestoneId) : [];

    expect(ids[0]).toBe('ms_01');
    expect(ids.at(-1)).toBe('ms_12');
    expect([...ids].sort((left, right) => left.localeCompare(right, 'en'))).toEqual(ids);
  });
});

describe('the phase fallback (task 156)', () => {
  it('reads the phase off dotted identifiers when the plan states no dependencies', () => {
    // This is the M14а gate's own shape: sixteen honest tasks, `dependsOn: []` throughout.
    const result = sliceMilestones([
      task('1.1'),
      task('1.2'),
      task('2.1'),
      task('2.2'),
      task('3.1'),
    ]);

    expect(result.ok && result.strategy).toBe('phases');
    expect(result.ok && result.milestones.map((milestone) => milestone.taskIds)).toEqual([
      ['1.1', '1.2'],
      ['2.1', '2.2'],
      ['3.1'],
    ]);
    expect(result.ok && result.milestones[1]?.dependsOn).toEqual(['ms_01']);
  });

  it('is conservative for flat identifiers: one task per milestone, strictly in order', () => {
    // No dots and no dependencies is a plan that says nothing about order, and «everything at once»
    // would be a claim the plan never made. A wrong «must wait» costs time; a wrong «may run now»
    // costs a build.
    const result = sliceMilestones([task('1'), task('2'), task('3')]);

    expect(result.ok && result.strategy).toBe('phases');
    expect(result.ok && result.milestones.map((milestone) => milestone.taskIds)).toEqual([
      ['1'],
      ['2'],
      ['3'],
    ]);
  });

  it('keeps the source order of phases, whatever order they were written in', () => {
    const result = sliceMilestones([task('2.1'), task('1.1'), task('2.2')]);

    expect(result.ok && result.milestones.map((milestone) => milestone.taskIds)).toEqual([
      ['2.1', '2.2'],
      ['1.1'],
    ]);
  });

  it('names the phase in the milestone title', () => {
    const result = sliceMilestones([task('3.1'), task('4.1')]);

    expect(result.ok && result.milestones.map((milestone) => milestone.title)).toEqual([
      'Фаза 3',
      'Фаза 4',
    ]);
  });

  it('reads a phase off an identifier of any shape', () => {
    expect(phaseOf('1.1')).toBe('1');
    expect(phaseOf('task_3.2')).toBe('task_3');
    expect(phaseOf('148')).toBe('148');
  });

  it('switches to dependencies the moment even one task states them', () => {
    const result = sliceMilestones([task('1.1'), task('1.2'), task('2.1', ['1.1'])]);

    expect(result.ok && result.strategy).toBe('dependencies');
  });
});

describe('plans the intake refuses (task 156)', () => {
  it('names a cycle rather than hanging on it', () => {
    const result = sliceMilestones([task('a', ['c']), task('b', ['a']), task('c', ['b'])]);

    expect(result).toEqual({ ok: false, reason: 'cycle', tasks: ['a', 'b', 'c'] });
    expect(describeSlice(result)).toContain('Цикл');
    expect(describeSlice(result)).toContain('a, b, c');
  });

  it('names a self-dependency, which is the smallest cycle there is', () => {
    const result = sliceMilestones([task('1'), task('2', ['2'])]);

    expect(result.ok).toBe(false);
    expect(describeSlice(result)).toContain('Цикл');
  });

  it('names a dependency on a task the bundle does not contain', () => {
    const result = sliceMilestones([task('1'), task('2', ['99'])]);

    expect(result).toEqual({ ok: false, reason: 'dangling', taskId: '2', missing: '99' });
    expect(describeSlice(result)).toContain('которой в бандле нет');
  });

  it('names a duplicated identifier', () => {
    const result = sliceMilestones([task('1'), task('1')]);

    expect(result).toEqual({ ok: false, reason: 'duplicate', taskId: '1' });
  });

  it('refuses a bundle with no tasks at all', () => {
    expect(sliceMilestones([])).toEqual({ ok: false, reason: 'empty' });
  });
});

describe('what the slice says for the feed (task 156)', () => {
  it('says which strategy it used, and why, in one sentence', () => {
    const byDependencies = sliceMilestones([task('1'), task('2', ['1'])]);
    const byPhases = sliceMilestones([task('1.1'), task('2.1')]);

    expect(describeSlice(byDependencies)).toContain('по зависимостям');
    expect(describeSlice(byPhases)).toContain('по фазам');
    expect(describeSlice(byPhases)).toContain('консервативно');
  });
});
