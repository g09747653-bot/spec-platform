import { describe, expect, it } from 'vitest';

import { parseTaskEntries } from '@/modules/specs/export/machine-bundle';
import { CORE_SPEC_TYPES } from '@/modules/specs/model/spec-files';
import {
  CANONICAL_TASK_RECORD,
  DEPENDENCY_LABELS,
  NO_DEPENDENCIES_MARK,
} from '@/modules/specs/model/task-notation';

import { specGenerationPrompt } from './spec-generation';

/**
 * The tasks-generation instruction (task 169).
 *
 * The M14а gate produced sixteen honest tasks whose `dependsOn` were all empty, because the
 * document stated no dependencies anywhere — the mapping was truthful and the planner was blind.
 * The fix is a contract, not a guess: the instruction now names a canonical record and an explicit
 * dependency notation, and both are quoted from the module the exporter parses with.
 *
 * These cases assert the *link* rather than the wording: what the prompt shows a model has to be
 * something `parseTaskEntries` reads back, and it has to appear for the tasks document only.
 */
describe('the tasks record instruction (task 169)', () => {
  const promptFor = (specType: (typeof CORE_SPEC_TYPES)[number]) =>
    specGenerationPrompt({ specType, initialPrompt: 'A note-taking tool.' }).user;

  it('shows the canonical record and the dependency clause, verbatim from the notation', () => {
    const user = promptFor('tasks');

    expect(user).toContain(CANONICAL_TASK_RECORD.entry);
    expect(user).toContain(CANONICAL_TASK_RECORD.dependencies);
    expect(user).toContain(CANONICAL_TASK_RECORD.noDependencies);
    for (const label of DEPENDENCY_LABELS) expect(user).toContain(label);
    expect(user).toContain(NO_DEPENDENCIES_MARK);
  });

  it('teaches a form the export actually reads back', () => {
    // Every line the instruction offers as an example, lifted out of the rendered prompt and run
    // through the mapping. A prompt that taught an unreadable form would fail here rather than on a
    // live walk three hours in.
    const examples = promptFor('tasks')
      .split('\n')
      .filter((line) => line.startsWith('    '))
      .map((line) => line.slice(4));

    const document = [
      examples[0] ?? '',
      `  ${examples[1] ?? ''}`,
      (examples[0] ?? '').replace('] 1.', '] 2.'),
      `  ${examples[2] ?? ''}`,
    ].join('\n');

    const tasks = parseTaskEntries(document);

    expect(tasks.map((task) => task.taskId)).toEqual(['1', '2']);
    expect(tasks[0]?.dependsOn).toEqual(['2', '3']);
    expect(tasks[1]?.dependsOn).toEqual([]);
  });

  it('appears for the tasks document alone — the other three record no entries', () => {
    for (const specType of CORE_SPEC_TYPES) {
      const user = promptFor(specType);

      if (specType === 'tasks') {
        expect(user).toContain(CANONICAL_TASK_RECORD.entry);
      } else {
        expect(user, `${specType} was given a task record form`).not.toContain(
          CANONICAL_TASK_RECORD.entry,
        );
      }
    }
  });

  it('leaves the rest of the instruction where it was', () => {
    // The block is additive: the product idea and the section contract still reach the model in the
    // same prompt, so this is a widening of the instruction rather than a rewrite of it.
    const user = promptFor('tasks');

    expect(user).toContain('A note-taking tool.');
    expect(user).toContain('tasks');
  });
});
