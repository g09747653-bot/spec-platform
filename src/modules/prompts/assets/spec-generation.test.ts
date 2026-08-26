import { describe, expect, it } from 'vitest';

import { parseTaskEntries } from '@/modules/specs/export/machine-bundle';
import { CORE_SPEC_TYPES, SPEC_TYPES } from '@/modules/specs/model/spec-files';
import {
  CANONICAL_TASK_RECORD,
  DEPENDENCY_LABELS,
  METHODOLOGY_DEPENDENCY_RECORD,
  NO_DEPENDENCIES_MARK,
} from '@/modules/specs/model/task-notation';

import { methodologyGenerationPrompt, specGenerationPrompt } from './spec-generation';

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

/**
 * The methodology half of «the generator always writes explicit dependencies» (А-52).
 *
 * The parity instruction closed this at task 169 and the methodology path stayed silent — the live
 * Программа-А plan stated 7 inline clauses across 41 tasks, and 34 exported with an empty
 * `dependsOn`. The cases assert the same link the parity cases do: the clause the prompt shows a
 * model is a clause `parseTaskEntries` reads back, and it appears for the plan document only.
 */
describe('the methodology dependency instruction (А-52)', () => {
  const promptFor = (specType: (typeof SPEC_TYPES)[number]) =>
    methodologyGenerationPrompt({
      documentLabel: 'Plan',
      specType,
      template: '# Implementation Plan\n\n- [ ] T001 [P] Do the thing\n',
      requiredSections: [],
      initialPrompt: 'A note-taking tool.',
    }).user;

  it('shows both recognised clause forms, verbatim from the notation', () => {
    const user = promptFor('tasks');

    expect(user).toContain(METHODOLOGY_DEPENDENCY_RECORD.inline);
    expect(user).toContain(METHODOLOGY_DEPENDENCY_RECORD.entry);
    expect(user).toContain(METHODOLOGY_DEPENDENCY_RECORD.dependencies);
    expect(user).toContain(METHODOLOGY_DEPENDENCY_RECORD.noDependencies);
    for (const label of DEPENDENCY_LABELS) expect(user).toContain(label);
    expect(user).toContain(NO_DEPENDENCIES_MARK);
  });

  it('teaches clause forms the export actually reads back', () => {
    // The labelled-line form: the entry and its clause, exactly as the instruction indents them.
    const lineForm = parseTaskEntries(
      [
        METHODOLOGY_DEPENDENCY_RECORD.entry.replace('T002', 'T001'),
        `  ${METHODOLOGY_DEPENDENCY_RECORD.noDependencies}`,
        METHODOLOGY_DEPENDENCY_RECORD.entry,
        `  ${METHODOLOGY_DEPENDENCY_RECORD.dependencies}`,
      ].join('\n'),
    );

    expect(lineForm.map((task) => task.taskId)).toEqual(['T001', 'T002']);
    expect(lineForm[0]?.dependsOn).toEqual([]);
    expect(lineForm[1]?.dependsOn).toEqual(['T001']);

    // The inline form (D-316): the clause feeds dependsOn and leaves the title.
    const inlineForm = parseTaskEntries(METHODOLOGY_DEPENDENCY_RECORD.inline);

    expect(inlineForm[0]?.taskId).toBe('T004');
    expect(inlineForm[0]?.dependsOn).toEqual(['T002', 'T003']);
    expect(inlineForm[0]?.title).not.toContain('depends on');
  });

  it('appears for the plan document alone, and the template still reaches the model', () => {
    for (const specType of SPEC_TYPES) {
      const user = promptFor(specType);

      if (specType === 'tasks') {
        expect(user).toContain(METHODOLOGY_DEPENDENCY_RECORD.inline);
      } else {
        expect(user, `${specType} was given the dependency rules`).not.toContain(
          METHODOLOGY_DEPENDENCY_RECORD.inline,
        );
      }

      expect(user).toContain('A note-taking tool.');
      expect(user).toContain('- [ ] T001 [P] Do the thing');
    }
  });

  it('renders no rules when the caller does not name a spec type — the pre-А-52 calls', () => {
    const user = methodologyGenerationPrompt({
      documentLabel: 'Proposal',
      template: '# Proposal\n',
      requiredSections: [],
      initialPrompt: 'A note-taking tool.',
    }).user;

    expect(user).not.toContain(METHODOLOGY_DEPENDENCY_RECORD.inline);
  });
});
