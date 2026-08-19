import { readFileSync } from 'node:fs';

import Ajv from 'ajv';
import { describe, expect, it } from 'vitest';

import { isSpecType, specFileName } from '../model/spec-files';
import type { ExportableFile } from '../repositories/spec-files';

import {
  assembleMachineBundle,
  deriveRequirements,
  deriveTasks,
  parseDependsOn,
  parseTaskEntries,
  MACHINE_BUNDLE_FILES,
} from './machine-bundle';

/**
 * Task 150 — the machine bundle: markdown in, the loop's contract out.
 *
 * Two layers of proof. The **golden layer** runs the real A0 documents — the requirements and tasks
 * the product itself generated in шаг 0, committed byte-for-byte in `.specs/research/programma-a/` —
 * through the mapping and pins the result against committed JSON, so any drift in the mapping or the
 * shapes is a red diff. The **schema layer** validates every derived payload with AJV against the
 * shared fixtures in `fixtures/spec-bundle/`, which are the contract the `loop/` package will
 * validate against from its side (А-20): one pair of files, two consumers, no private copies.
 */

const read = (path: string) => readFileSync(path, 'utf8');

const A0_REQUIREMENTS = () => read('.specs/research/programma-a/requirements.md');
const A0_TASKS = () => read('.specs/research/programma-a/tasks.md');

const ajv = new Ajv({ allErrors: true });

const requirementsSchema = JSON.parse(
  read('fixtures/spec-bundle/requirements_schema.json'),
) as object;
const tasksSchema = JSON.parse(read('fixtures/spec-bundle/tasks_schema.json')) as object;

const validRequirements = ajv.compile(requirementsSchema);
const validTasks = ajv.compile(tasksSchema);

describe('deriveRequirements against the real A0 document (task 150)', () => {
  it('produces schema-valid JSON with every requirement row present exactly once', () => {
    const derived = deriveRequirements(A0_REQUIREMENTS(), 'a0-bundle');

    expect(validRequirements(derived), ajv.errorsText(validRequirements.errors)).toBe(true);

    // The A0 document organises its requirements as subsections: seven functional, four
    // non-functional. Each becomes exactly one row, and ids are dense and unique.
    expect(derived.functionalRequirements.map((row) => row.id)).toEqual([
      'FR-1',
      'FR-2',
      'FR-3',
      'FR-4',
      'FR-5',
      'FR-6',
      'FR-7',
    ]);
    expect(derived.nonFunctionalRequirements.map((row) => row.id)).toEqual([
      'NFR-1',
      'NFR-2',
      'NFR-3',
      'NFR-4',
    ]);

    const titles = derived.functionalRequirements.map((row) => row.title);
    expect(new Set(titles).size).toBe(titles.length);
  });

  it('is deterministic: the same revision derives the same JSON, ids included', () => {
    const first = deriveRequirements(A0_REQUIREMENTS(), 'a0-bundle');
    const second = deriveRequirements(A0_REQUIREMENTS(), 'a0-bundle');

    expect(second).toEqual(first);
  });

  it('matches the committed golden byte for byte — mapping drift is a red diff', () => {
    const derived = `${JSON.stringify(deriveRequirements(A0_REQUIREMENTS(), 'a0-bundle'), null, 2)}\n`;

    expect(derived).toBe(read('fixtures/spec-bundle/golden/a0.requirements.json'));
  });
});

describe('deriveTasks against the real A0 document (task 150)', () => {
  it('produces schema-valid JSON with one row per stated task', () => {
    const derived = deriveTasks(A0_TASKS(), 'a0-bundle', 'a0-project');

    expect(validTasks(derived), ajv.errorsText(validTasks.errors)).toBe(true);

    // The A0 plan states twenty tasks across four milestones, each numbered `N.M`.
    expect(derived.tasks).toHaveLength(20);
    expect(derived.tasks[0]?.taskId).toBe('1.1');
    expect(derived.tasks.at(-1)?.taskId).toBe('4.4');

    const ids = derived.tasks.map((task) => task.taskId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('matches the committed golden byte for byte', () => {
    const derived = `${JSON.stringify(deriveTasks(A0_TASKS(), 'a0-bundle', 'a0-project'), null, 2)}\n`;

    expect(derived).toBe(read('fixtures/spec-bundle/golden/a0.tasks.json'));
  });
});

describe('parseTaskEntries on the shapes the plans write', () => {
  it('reads checkbox plans — the reference product’s own convention', () => {
    const tasks = parseTaskEntries(
      [
        '## Detailed Tasks',
        '',
        String.raw`- [ ] 148\. Local single-user mode — auto-owner session`,
        '  - Behind an explicit env flag.',
        '  - _Dependencies: —_ · _Requirements: А-7 §4_',
        '',
        '- [x] 149. Persistent local database profile',
        '  - _Dependencies: 148_ · _Requirements: NFR-003_',
        '',
        '- [ ] 151. The gate',
        '  - _Dependencies: 148–150_',
      ].join('\n'),
    );

    expect(tasks.map((task) => task.taskId)).toEqual(['148', '149', '151']);
    expect(tasks[0]?.title).toBe('Local single-user mode — auto-owner session');
    expect(tasks[0]?.dependsOn).toEqual([]);
    expect(tasks[1]?.dependsOn).toEqual(['148']);
    // The range expands; the requirement reference after the clause’s emphasis does not leak in.
    expect(tasks[2]?.dependsOn).toEqual(['148', '149', '150']);
    expect(tasks[1]?.description).toContain('_Dependencies: 148_');
  });

  it('reads heading tasks in either language, and a fenced example is never an entry', () => {
    const tasks = parseTaskEntries(
      [
        '### Milestone 1',
        '',
        '#### Task 1.1: Set up the database',
        '* **Описание**: подробности.',
        '',
        '```markdown',
        '#### Task 9.9: не задача, а пример в коде',
        '```',
        '',
        '#### Задача 1.2 — Настроить конфигурацию',
        '* Зависимости: 1.1',
        '',
        '### Milestone 2',
        '',
        'Prose between milestones belongs to no task.',
        '',
        '#### Task 2.1: Ship it',
      ].join('\n'),
    );

    expect(tasks.map((task) => task.taskId)).toEqual(['1.1', '1.2', '2.1']);
    // The fenced pseudo-task stayed inside 1.1’s description.
    expect(tasks[0]?.description).toContain('не задача, а пример в коде');
    expect(tasks[1]?.dependsOn).toEqual(['1.1']);
    // The milestone heading closed 1.2; the prose after it belongs to no task.
    expect(tasks[1]?.description).not.toContain('Prose between milestones');
    expect(tasks.every((task) => Array.isArray(task.metadata.expectedArtifacts))).toBe(true);
  });
});

describe('parseDependsOn', () => {
  it('expands integer ranges with any dash and keeps dotted tokens as endpoints', () => {
    expect(parseDependsOn(' 148–150')).toEqual(['148', '149', '150']);
    expect(parseDependsOn(' 148-149')).toEqual(['148', '149']);
    expect(parseDependsOn(' 1.1—1.3, 2.4')).toEqual(['1.1', '1.3', '2.4']);
  });

  it('reads nothing from prose, em-dashes and references outside the clause', () => {
    expect(parseDependsOn(' —_ · _Requirements: А-7 §4; NFR-003_')).toEqual([]);
    expect(parseDependsOn(' none')).toEqual([]);
  });

  it('never reads the digits of a requirement identifier as a task', () => {
    expect(parseDependsOn(' 12, 14; see FR-001 and А-2.1')).toEqual(['12', '14']);
  });
});

describe('assembleMachineBundle', () => {
  const file = (specType: string, content: string): ExportableFile => {
    if (!isSpecType(specType)) throw new Error(`not a spec type: ${specType}`);

    return {
      specFileId: `${specType}-file-id`,
      specType,
      fileName: specFileName(specType),
      content,
      revisionNumber: 1,
    };
  };

  const fullSet = (): ExportableFile[] => [
    file('constitution', '# Конституция\n\nПравила.\n'),
    file('solution', '# Архитектура\n\nМодули.\n'),
    file('requirements', A0_REQUIREMENTS()),
    file('tasks', A0_TASKS()),
  ];

  it('lays four entries under bundle/, the markdown verbatim and the JSON schema-valid', () => {
    const bundle = assembleMachineBundle(fullSet(), 'project-1');

    expect(bundle.included).toEqual([
      MACHINE_BUNDLE_FILES.constitution,
      MACHINE_BUNDLE_FILES.solution,
      MACHINE_BUNDLE_FILES.requirements,
      MACHINE_BUNDLE_FILES.tasks,
    ]);
    expect(bundle.omitted).toEqual([]);

    expect(bundle.requirementsJson).not.toBeNull();
    expect(bundle.tasksJson).not.toBeNull();
    expect(validRequirements(JSON.parse(bundle.requirementsJson ?? ''))).toBe(true);
    expect(validTasks(JSON.parse(bundle.tasksJson ?? ''))).toBe(true);
  });

  it('is byte-deterministic: two exports of the same revisions are one archive', () => {
    const first = assembleMachineBundle(fullSet(), 'project-1');
    const second = assembleMachineBundle(fullSet(), 'project-1');

    expect(Buffer.from(first.zip).equals(Buffer.from(second.zip))).toBe(true);
  });

  it('omits what is not approved and still hands over the rest', () => {
    const bundle = assembleMachineBundle(
      [file('constitution', '# Конституция\n'), file('tasks', A0_TASKS())],
      'project-1',
    );

    expect(bundle.included).toEqual([
      MACHINE_BUNDLE_FILES.constitution,
      MACHINE_BUNDLE_FILES.tasks,
    ]);
    expect(bundle.omitted).toEqual([
      MACHINE_BUNDLE_FILES.solution,
      MACHINE_BUNDLE_FILES.requirements,
    ]);
    expect(bundle.requirementsJson).toBeNull();
  });
});
