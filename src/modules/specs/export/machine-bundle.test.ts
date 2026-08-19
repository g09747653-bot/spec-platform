import { readFileSync } from 'node:fs';

import Ajv from 'ajv';
import { describe, expect, it } from 'vitest';

import { isSpecType, specFileName } from '../model/spec-files';
import {
  CANONICAL_TASK_RECORD,
  DEPENDENCY_LABELS,
  NO_DEPENDENCIES_MARK,
} from '../model/task-notation';
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

describe('deriveTasks against the M14а live document — the bold-bullet shape', () => {
  /*
   * The second golden pair. The M14а gate walk caught a live model writing phases as headings and
   * every task as `* **Задача N.M: …**` — a shape the first cut did not read, so a 17-KB plan
   * mapped to zero tasks. The document (fixed byte-for-byte from the walk's own export) and its
   * expected JSON now pin that shape the same way the A0 pair pins the heading shape.
   */
  const LIVE_TASKS = () => read('fixtures/spec-bundle/golden/m14a-live.tasks.md');

  it('reads all sixteen bold-bullet tasks, names intact', () => {
    const derived = deriveTasks(LIVE_TASKS(), 'm14a-live-bundle', 'm14a-live-project');

    expect(validTasks(derived), ajv.errorsText(validTasks.errors)).toBe(true);
    expect(derived.tasks).toHaveLength(16);
    expect(derived.tasks[0]?.taskId).toBe('1.1');
    expect(derived.tasks.at(-1)?.taskId).toBe('6.3');

    // Underscores inside names survive: they are identifiers, not emphasis.
    expect(derived.tasks.map((task) => task.title)).toContain(
      'Инициализация базы данных и схемы (clean_slate)',
    );
  });

  it('matches the committed golden byte for byte', () => {
    const derived = `${JSON.stringify(
      deriveTasks(LIVE_TASKS(), 'm14a-live-bundle', 'm14a-live-project'),
      null,
      2,
    )}\n`;

    expect(derived).toBe(read('fixtures/spec-bundle/golden/m14a-live.tasks.json'));
  });
});

describe('deriveTasks on a document written in the canonical form (task 169)', () => {
  /*
   * The third golden pair, and the one the instruction of task 169 asks a model to produce: a
   * checkbox plan whose every entry states, on a line of its own, which tasks it waits for.
   *
   * The other two goldens are the historical record and stay byte-for-byte as they are — the M14а
   * live plan in particular is honestly dependency-free, because its document named no dependencies
   * anywhere. That is exactly the bundle a planner is blind to, and this pair is the shape that
   * fixes it *at the source* rather than by having the mapping guess.
   */
  const CANONICAL_TASKS = () => read('fixtures/spec-bundle/golden/canonical.tasks.md');

  it('carries a real dependency graph out of the export, not an empty one', () => {
    const derived = deriveTasks(CANONICAL_TASKS(), 'canonical-bundle', 'canonical-project');

    expect(validTasks(derived), ajv.errorsText(validTasks.errors)).toBe(true);
    expect(derived.tasks).toHaveLength(7);

    // Non-empty is the acceptance criterion; the shape of the graph is what makes it worth having.
    expect(derived.tasks.filter((task) => task.dependsOn.length > 0)).toHaveLength(6);
    expect(derived.tasks.map((task) => task.dependsOn)).toEqual([
      [],
      ['1'],
      ['2'],
      ['3'],
      ['2', '3'],
      ['4', '5'],
      ['6'],
    ]);

    // Every stated dependency names a task that exists: a graph with a dangling edge is a graph the
    // loop's topological pass cannot walk.
    const ids = new Set(derived.tasks.map((task) => task.taskId));
    for (const task of derived.tasks) {
      for (const dependency of task.dependsOn) expect(ids).toContain(dependency);
    }
  });

  it('reads the «none» mark as no dependencies rather than as an unread line', () => {
    const derived = deriveTasks(CANONICAL_TASKS(), 'canonical-bundle', 'canonical-project');

    expect(derived.tasks[0]?.dependsOn).toEqual([]);
    expect(derived.tasks[0]?.description).toContain(NO_DEPENDENCIES_MARK);
  });

  it('matches the committed golden byte for byte', () => {
    const derived = `${JSON.stringify(
      deriveTasks(CANONICAL_TASKS(), 'canonical-bundle', 'canonical-project'),
      null,
      2,
    )}\n`;

    expect(derived).toBe(read('fixtures/spec-bundle/golden/canonical.tasks.json'));
  });
});

describe('the canonical record and the mapping are one notation (task 169)', () => {
  /*
   * The mechanical half of task 169. `CANONICAL_TASK_RECORD` is quoted verbatim into the
   * tasks-generation instruction, so a change here that the mapping cannot read would teach a model
   * a form the export drops on the floor — silently, and only visible on a live walk. Running the
   * instruction's own example lines through the parser makes that a red test instead.
   */
  it('parses the very lines the instruction shows a model', () => {
    const tasks = parseTaskEntries(
      [
        CANONICAL_TASK_RECORD.entry,
        `  ${CANONICAL_TASK_RECORD.dependencies}`,
        CANONICAL_TASK_RECORD.entry.replace('- [ ] 1.', '- [ ] 4.'),
        `  ${CANONICAL_TASK_RECORD.noDependencies}`,
      ].join('\n'),
    );

    expect(tasks.map((task) => task.taskId)).toEqual(['1', '4']);
    expect(tasks[0]?.dependsOn).toEqual(['2', '3']);
    expect(tasks[1]?.dependsOn).toEqual([]);
  });

  it('recognises the dependency clause under either label', () => {
    for (const label of DEPENDENCY_LABELS) {
      const tasks = parseTaskEntries([CANONICAL_TASK_RECORD.entry, `  _${label}: 9_`].join('\n'));

      expect(tasks[0]?.dependsOn, `${label} was not read`).toEqual(['9']);
    }
  });
});

describe('parseTaskEntries on the shapes the plans write', () => {
  it('reads bold-bullet tasks in either language, and a plain mention is never an entry', () => {
    const tasks = parseTaskEntries(
      [
        '#### Фаза 1: Подготовка',
        '* **Задача 1.1: Настроить окружение**',
        '  * *Описание:* подробности про задача 9 в прозе — не запись.',
        '- **Task 1.2 — Wire the parts**',
        '  * Зависимости: 1.1',
        '',
        '#### Фаза 2: Сборка',
        '* **Задача 2.1: Собрать**',
      ].join('\n'),
    );

    expect(tasks.map((task) => task.taskId)).toEqual(['1.1', '1.2', '2.1']);
    expect(tasks[0]?.title).toBe('Настроить окружение');
    expect(tasks[0]?.description).toContain('не запись');
    expect(tasks[1]?.dependsOn).toEqual(['1.1']);
  });

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
