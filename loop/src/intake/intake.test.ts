import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { readBoard } from '../db/board.ts';
import { openMigratedDatabase } from '../db/migrate.ts';
import type { Chain } from '../llm/chain.ts';
import { createLogger } from '../observability/log.ts';

import { WHOLE_ARTIFACT_TASK_LIMIT, judgeWholeArtifactPlan } from './artifact-class.ts';
import { pathsMentionedIn } from './assignments.ts';
import { HandoffTask, MilestonesFile } from './handoff.ts';
import { intakeBundle, IntakeRefused } from './intake.ts';
import { BundleRejected, readBundle } from './validate.ts';

/**
 * Bundle intake, against the bundle the product actually produced (task 156 AC).
 *
 * `artifacts/gate-M14a/machine-bundle/bundle/` is the real machine export of the M14а gate walk —
 * the same files the platform's export wrote and the same schemas both sides validate against. A
 * hand-written fixture would prove that the intake reads what we imagined the contract to be; this
 * proves it reads what the contract *is*, including the part nobody designed: sixteen tasks whose
 * `dependsOn` are all empty.
 */

const GATE_BUNDLE = '../artifacts/gate-M14a/machine-bundle/bundle';

let directory: string;
let database: DatabaseSync;

/** A chain that answers, so the model path is exercised without a live provider (NFR-012). */
const stubChain = (answer: string): Chain => ({
  providers: [],
  generate: () => Promise.resolve({ text: answer, provider: 'anthropic' }),
});

const failingChain = (): Chain => ({
  providers: [],
  generate: () => Promise.reject(new Error('провайдер ответил 429')),
});

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'loop-intake-'));
  database = openMigratedDatabase(join(directory, 'loop.db'));
  mkdirSync(join(directory, 'project'), { recursive: true });
  cpSync(GATE_BUNDLE, join(directory, 'project', 'bundle'), { recursive: true });
});

afterEach(() => {
  database.close();
  try {
    rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  } catch {
    // Cleanup is not an assertion.
  }
});

const run = (chain: Chain | null = null) =>
  intakeBundle(
    { projectDirectory: join(directory, 'project'), projectTitle: 'Гейтовый бандл' },
    { database, logger: createLogger(database), chain },
  );

describe('the M14а gate bundle, intaken for real (task 156 AC-1)', () => {
  it('is accepted, and sliced by phases because it states no dependencies', async () => {
    const result = await run();

    expect(result.strategy).toBe('phases');
    expect(result.tasks).toHaveLength(16);
    expect(result.milestones).toBeGreaterThan(1);
  });

  it('lays the phases out in the source’s own order', async () => {
    const result = await run();
    const milestones = readBoard(database, result.projectId)?.milestones ?? [];

    expect(milestones.length).toBeGreaterThan(1);

    // Every later milestone waits for exactly the one before it, and the first waits for nothing.
    expect(milestones[0]?.dependsOn).toEqual([]);
    for (let index = 1; index < milestones.length; index += 1) {
      expect(milestones[index]?.dependsOn).toEqual([milestones[index - 1]?.milestoneId]);
    }

    // Phase 1's tasks are the first milestone's, and nothing from a later phase joined them.
    expect(milestones[0]?.tasks.every((task) => task.taskId.startsWith('1.'))).toBe(true);
    expect(milestones[1]?.tasks.every((task) => task.taskId.startsWith('2.'))).toBe(true);
  });

  it('writes the whole handoff tree to disk, schema-valid', async () => {
    const result = await run();
    const project = join(directory, 'project');

    const milestones = MilestonesFile.parse(
      JSON.parse(readFileSync(join(project, 'handoff', 'tasks', 'milestones.json'), 'utf8')),
    );
    expect(milestones.milestones).toHaveLength(result.milestones);
    expect(existsSync(join(project, 'handoff', 'reports'))).toBe(true);

    for (const task of result.tasks) {
      const onDisk = HandoffTask.parse(
        JSON.parse(
          readFileSync(join(project, 'handoff', 'tasks', `task_${task.taskId}.json`), 'utf8'),
        ),
      );

      expect(onDisk.taskId).toBe(task.taskId);
      expect(onDisk.status).toBe('PENDING');
      // `filesToEdit` is required by the contract and is present on every assignment.
      expect(Array.isArray(onDisk.filesToEdit)).toBe(true);
    }
  });

  it('indexes the tree in the database, milestones before tasks', async () => {
    const result = await run();
    const board = readBoard(database, result.projectId);

    expect(board?.milestones).toHaveLength(result.milestones);
    expect(board?.milestones.flatMap((milestone) => milestone.tasks)).toHaveLength(16);
  });

  it('is idempotent — intaking the same bundle twice is not a constraint violation', async () => {
    const first = await run();
    const second = await run();

    expect(second.tasks.map((task) => task.taskId)).toEqual(first.tasks.map((task) => task.taskId));
    expect(readBoard(database, second.projectId)?.milestones).toHaveLength(second.milestones);
  });

  it('never undoes progress: a re-intake keeps the status an assignment already has', async () => {
    /*
     * The intake runs again on every resume, and every assignment is *built* as PENDING. Writing
     * that over a finished task would reset it on the disk that is the source of truth, and the
     * next boot's recovery would read it back and redo accepted work.
     */
    const first = await run();
    const done = first.tasks[0]?.taskId ?? '';
    const path = join(directory, 'project', 'handoff', 'tasks', `task_${done}.json`);

    writeFileSync(
      path,
      `${JSON.stringify(HandoffTask.parse({ ...HandoffTask.parse(JSON.parse(readFileSync(path, 'utf8'))), status: 'COMPLETED' }), null, 2)}\n`,
      'utf8',
    );

    await run();

    expect(HandoffTask.parse(JSON.parse(readFileSync(path, 'utf8'))).status).toBe('COMPLETED');
    // And a task nobody has finished is still pending, so the rule is not «never write status».
    const untouched = first.tasks[1]?.taskId ?? '';
    expect(
      HandoffTask.parse(
        JSON.parse(
          readFileSync(
            join(directory, 'project', 'handoff', 'tasks', `task_${untouched}.json`),
            'utf8',
          ),
        ),
      ).status,
    ).toBe('PENDING');
  });

  /**
   * The same rule, applied to the prose (task 172; расширение D-261).
   *
   * A resume re-runs the intake, and until now that re-asked the model for every assignment and
   * wrote whatever came back over the file an executor might already be holding. Two costs, and the
   * second is the serious one: a free tier spent on nineteen calls that changed nothing, and a brief
   * *downgraded* — once the quota is gone the answer is the deterministic fallback, which is thinner
   * than the text it replaced.
   */
  it('keeps the prose of an assignment that already exists, and asks no model for it', async () => {
    const first = await run(
      stubChain(
        JSON.stringify({
          description: 'Первая формулировка, по ней исполнитель и работает.',
          filesToEdit: ['src/first.ts'],
          unitTestCmd: 'npm test',
        }),
      ),
    );

    const second = await run(
      stubChain(
        JSON.stringify({
          description: 'Вторая формулировка — модель передумала.',
          filesToEdit: ['src/second.ts'],
        }),
      ),
    );

    expect(second.keptFromDisk, 'every assignment was already on disk').toBe(16);
    expect(second.writtenByModel, 'no model call was made at all').toBe(0);

    const path = join(
      directory,
      'project',
      'handoff',
      'tasks',
      `task_${first.tasks[0]?.taskId ?? ''}.json`,
    );
    const onDisk = HandoffTask.parse(JSON.parse(readFileSync(path, 'utf8')));

    expect(onDisk.description).toBe('Первая формулировка, по ней исполнитель и работает.');
    expect(onDisk.filesToEdit).toEqual(['src/first.ts']);
    expect(onDisk.unitTestCmd).toBe('npm test');
  });

  it('keeps an operator’s iteration-ceiling mark across a re-intake (task 174)', async () => {
    /*
     * `iterationTimeoutSec` is written into `task_*.json` by a person (or the architect) about a
     * task known to be heavy. A resume that dropped it would re-arm the default ceiling on exactly
     * the task it was measured to kill — the same defect as rewriting the prose, wearing a number.
     */
    const first = await run();
    const marked = first.tasks[0]?.taskId ?? '';
    const path = join(directory, 'project', 'handoff', 'tasks', `task_${marked}.json`);

    writeFileSync(
      path,
      `${JSON.stringify(
        HandoffTask.parse({
          ...HandoffTask.parse(JSON.parse(readFileSync(path, 'utf8'))),
          iterationTimeoutSec: 1_800,
        }),
        null,
        2,
      )}\n`,
      'utf8',
    );

    await run();

    expect(HandoffTask.parse(JSON.parse(readFileSync(path, 'utf8'))).iterationTimeoutSec).toBe(
      1_800,
    );
  });

  it('leaves the bytes of the tree untouched on a second intake', async () => {
    await run(stubChain(JSON.stringify({ description: 'Раз', filesToEdit: ['a.ts'] })));

    const tasksDirectory = join(directory, 'project', 'handoff', 'tasks');
    const before = readdirSync(tasksDirectory)
      .sort()
      .map((name) => [name, readFileSync(join(tasksDirectory, name), 'utf8')] as const);

    await run(stubChain(JSON.stringify({ description: 'Два', filesToEdit: ['b.ts'] })));

    const after = readdirSync(tasksDirectory)
      .sort()
      .map((name) => [name, readFileSync(join(tasksDirectory, name), 'utf8')] as const);

    expect(after).toEqual(before);
  });

  /**
   * Rewriting on purpose is a different act, and it says its own name to ask for it.
   */
  it('regenerates the whole tree when the operator asks in so many words', async () => {
    const first = await run(
      stubChain(JSON.stringify({ description: 'Раз', filesToEdit: ['a.ts'] })),
    );

    const regenerated = await intakeBundle(
      {
        projectDirectory: join(directory, 'project'),
        projectTitle: 'Гейтовый бандл',
        regenerate: true,
      },
      {
        database,
        logger: createLogger(database),
        chain: stubChain(JSON.stringify({ description: 'Два', filesToEdit: ['b.ts'] })),
      },
    );

    expect(regenerated.regenerated).toBe(true);
    expect(regenerated.keptFromDisk).toBe(0);
    expect(regenerated.writtenByModel).toBe(16);

    const path = join(
      directory,
      'project',
      'handoff',
      'tasks',
      `task_${first.tasks[0]?.taskId ?? ''}.json`,
    );
    expect(HandoffTask.parse(JSON.parse(readFileSync(path, 'utf8'))).description).toBe('Два');
  });

  it('refuses to regenerate while a task is in somebody’s hands', async () => {
    const first = await run(
      stubChain(JSON.stringify({ description: 'Раз', filesToEdit: ['a.ts'] })),
    );

    const held = first.tasks[2]?.taskId ?? '';
    const path = join(directory, 'project', 'handoff', 'tasks', `task_${held}.json`);
    const task = HandoffTask.parse(JSON.parse(readFileSync(path, 'utf8')));
    writeFileSync(
      path,
      `${JSON.stringify(HandoffTask.parse({ ...task, status: 'IN_PROGRESS' }), null, 2)}\n`,
      'utf8',
    );

    await expect(
      intakeBundle(
        { projectDirectory: join(directory, 'project'), regenerate: true },
        { database, logger: createLogger(database), chain: null },
      ),
    ).rejects.toBeInstanceOf(IntakeRefused);

    // Nothing was thrown away: the refusal is total, not partial.
    expect(HandoffTask.parse(JSON.parse(readFileSync(path, 'utf8'))).description).toBe('Раз');
    expect(readdirSync(join(directory, 'project', 'handoff', 'tasks'))).toHaveLength(17);
  });
});

describe('the researcher’s report reaches the architect (task 161)', () => {
  /**
   * The AC's own words: «отчёт исследователя фикстурно присутствует в промпте заданий».
   *
   * Asserted at the seam the prompt is built from — the chain records what it was asked — because
   * that is the only place the claim is about the *prompt* rather than about what a model did with
   * it.
   */
  it('puts the workspace survey into every assignment prompt, and onto the disk', async () => {
    writeFileSync(
      join(directory, 'project', 'package.json'),
      JSON.stringify({ name: 'уже-существующий', scripts: { test: 'node --test' } }),
      'utf8',
    );

    const asked: string[] = [];
    const recording: Chain = {
      providers: [
        {
          id: 'google',
          model: 'gemini',
          supportsImages: true,
          generate: () => Promise.resolve(''),
        },
      ],
      generate: (request) => {
        asked.push(request.prompt);
        return Promise.resolve({
          text: JSON.stringify({ description: 'Сделай', filesToEdit: [] }),
          provider: 'google',
        });
      },
    };

    await intakeBundle(
      { projectDirectory: join(directory, 'project'), projectTitle: 'С исследователем' },
      { database, logger: createLogger(database), chain: recording },
    );

    /* The first call is the researcher's brief; the assignments follow, each carrying the report. */
    const assignmentPrompts = asked.filter((prompt) => prompt.includes('Запись задачи из бандла'));
    expect(assignmentPrompts.length).toBeGreaterThan(0);

    for (const prompt of assignmentPrompts) {
      expect(prompt).toContain('Отчёт исследователя о рабочей директории');
      expect(prompt).toContain('package.json');
      expect(prompt).toContain('уже-существующий');
    }

    expect(readFileSync(join(directory, 'project', 'handoff', 'RESEARCH.md'), 'utf8')).toContain(
      'package.json',
    );
  });
});

describe('инструкция архитектора заданий требует POSIX sh (task 176)', () => {
  /**
   * Урок прогона Б, закреплённый фикстурно в промпте: модель, мыслившая Windows-ом, писала команды
   * тестов в синтаксисе PowerShell, и приёмка честно валила их кодом 2 через `sh -c`. Строка
   * инструкции — в каждом промпте задания; тест утверждает промпт, а не то, что модель с ним
   * сделала, — тот же шов, что у отчёта исследователя выше.
   */
  it('каждый промпт задания несёт строку про POSIX sh и `sh -c`', async () => {
    const asked: string[] = [];
    const recording: Chain = {
      providers: [
        {
          id: 'google',
          model: 'gemini',
          supportsImages: true,
          generate: () => Promise.resolve(''),
        },
      ],
      generate: (request) => {
        asked.push(request.prompt);
        return Promise.resolve({
          text: JSON.stringify({ description: 'Сделай', filesToEdit: [] }),
          provider: 'google',
        });
      },
    };

    await run(recording);

    const assignmentPrompts = asked.filter((prompt) => prompt.includes('Запись задачи из бандла'));
    expect(assignmentPrompts.length).toBeGreaterThan(0);

    for (const prompt of assignmentPrompts) {
      expect(prompt).toContain('POSIX sh');
      expect(prompt).toContain('sh -c');
      expect(prompt).toContain('PowerShell');
    }
  });

  it('каждый промпт задания требует ОБЯЗАТЕЛЬНЫЙ unitTestCmd с честной проверкой результата (D-317)', async () => {
    /* Урок финальной приёмки: «команда тестов, если применима» оставила 15 из 41 заданий без
       команд, и конвейер замёрз волной отказов «нечего запускать» — приёмка не судила ни одного. */
    const asked: string[] = [];
    const recording: Chain = {
      providers: [
        {
          id: 'google',
          model: 'gemini',
          supportsImages: true,
          generate: () => Promise.resolve(''),
        },
      ],
      generate: (request) => {
        asked.push(request.prompt);
        return Promise.resolve({
          text: JSON.stringify({ description: 'Сделай', filesToEdit: [] }),
          provider: 'google',
        });
      },
    };

    await run(recording);

    const assignmentPrompts = asked.filter((prompt) => prompt.includes('Запись задачи из бандла'));
    expect(assignmentPrompts.length).toBeGreaterThan(0);

    for (const prompt of assignmentPrompts) {
      expect(prompt).toContain('unitTestCmd ОБЯЗАТЕЛЕН');
      expect(prompt).toContain('нечего запускать');
      expect(prompt).toContain('test -f');
    }
  });
});

describe('who writes the assignment texts (task 156)', () => {
  it('uses the model when the chain answers', async () => {
    const result = await run(
      stubChain(
        JSON.stringify({
          description: 'Сделай раз, потом два.',
          filesToEdit: ['src/index.ts'],
          unitTestCmd: 'npm test',
        }),
      ),
    );

    expect(result.writtenByModel).toBe(16);
    expect(result.degradations).toEqual([]);
    expect(result.tasks[0]?.description).toBe('Сделай раз, потом два.');
    expect(result.tasks[0]?.filesToEdit).toEqual(['src/index.ts']);
    expect(result.tasks[0]?.unitTestCmd).toBe('npm test');
  });

  it('reads an answer the model wrapped in a code fence', async () => {
    const result = await run(
      stubChain(
        '```json\n{"description":"Через ограду","filesToEdit":[]}\n```\nи ещё пара слов сверху',
      ),
    );

    expect(result.tasks[0]?.description).toBe('Через ограду');
  });

  it('reads `null` as «no such command» rather than as a malformed answer', async () => {
    /*
     * The live gate walk's finding: asked for an assignment with no end-to-end suite, the model
     * answered `"e2eTestCmd": null` — the honest answer — and the whole object was rejected, taking
     * a perfectly good description down with a key the model had correctly left empty.
     */
    const result = await run(
      stubChain(
        JSON.stringify({
          description: 'Сделай раз, потом два.',
          filesToEdit: ['src/index.ts'],
          unitTestCmd: 'npm test',
          e2eTestCmd: null,
        }),
      ),
    );

    expect(result.writtenByModel).toBe(16);
    expect(result.degradations).toEqual([]);
    expect(result.tasks[0]?.description).toBe('Сделай раз, потом два.');
    expect(result.tasks[0]?.e2eTestCmd).toBeUndefined();
  });

  it('reads an empty string the same way — a command nobody can run is not a command', async () => {
    const result = await run(
      stubChain(
        JSON.stringify({
          description: 'Сделай раз, потом два.',
          filesToEdit: [],
          unitTestCmd: '   ',
        }),
      ),
    );

    expect(result.writtenByModel).toBe(16);
    expect(result.tasks[0]?.unitTestCmd).toBeUndefined();
  });

  it('carries the architect’s iteration-ceiling mark into the assignment (task 174)', async () => {
    const result = await run(
      stubChain(
        JSON.stringify({
          description: 'Тяжёлая задача: собрать большой корпус.',
          filesToEdit: [],
          iterationTimeoutSec: 1_200,
        }),
      ),
    );

    expect(result.writtenByModel).toBe(16);
    expect(result.tasks[0]?.iterationTimeoutSec).toBe(1_200);
  });

  it('reads an out-of-range ceiling as «no mark» rather than losing the description', async () => {
    const result = await run(
      stubChain(
        JSON.stringify({
          description: 'Задача с фантазией о суточном потолке.',
          filesToEdit: [],
          iterationTimeoutSec: 999_999,
        }),
      ),
    );

    expect(result.writtenByModel).toBe(16);
    expect(result.tasks[0]?.description).toBe('Задача с фантазией о суточном потолке.');
    expect(result.tasks[0]?.iterationTimeoutSec).toBeUndefined();
  });

  it('writes the assignment anyway when every provider fails, and names the degradation', async () => {
    const result = await run(failingChain());

    expect(result.writtenByModel).toBe(0);
    expect(result.tasks).toHaveLength(16);
    // The bundle's own text, not an empty assignment: the model is not in the control path.
    expect(result.tasks[0]?.description.length).toBeGreaterThan(0);
    expect(result.degradations[0]).toContain('429');
  });

  it('writes deterministically when no provider is configured at all', async () => {
    const result = await run(null);

    expect(result.writtenByModel).toBe(0);
    expect(result.degradations[0]).toContain('провайдер не настроен');
    expect(result.tasks).toHaveLength(16);
  });

  it('mines file paths out of a task’s own prose as the conservative fallback', () => {
    expect(pathsMentionedIn('правь `src/db/schema.ts` и потом docs/readme.md')).toEqual([
      'src/db/schema.ts',
      'docs/readme.md',
    ]);
    expect(pathsMentionedIn('никаких путей тут нет')).toEqual([]);
  });
});

describe('bundles the intake refuses (task 156 AC-2/AC-3)', () => {
  const bundleDir = () => join(directory, 'project', 'bundle');

  it('prints the path of the offending value on an AJV rejection', () => {
    writeFileSync(
      join(bundleDir(), 'tasks.json'),
      JSON.stringify({ bundleId: 'b', projectId: 'p', tasks: [{ taskId: 7 }] }),
      'utf8',
    );

    try {
      readBundle(bundleDir());
      expect.unreachable('a malformed tasks.json must be refused');
    } catch (error) {
      expect(error).toBeInstanceOf(BundleRejected);
      const issues = (error as BundleRejected).issues.join('\n');
      expect(issues).toContain('/tasks/0');
      expect(issues).toMatch(/title|string/);
    }
  });

  it('refuses a schema-valid bundle with zero tasks — the M14а finding, from the other side', () => {
    writeFileSync(
      join(bundleDir(), 'tasks.json'),
      JSON.stringify({ bundleId: 'b', projectId: 'p', tasks: [] }),
      'utf8',
    );

    expect(() => readBundle(bundleDir())).toThrow(/ноль задач/);
  });

  it('refuses a schema-valid bundle with zero requirements — the Программа-А acceptance finding (D-316)', () => {
    /* Пустые requirements при финальной приёмке проскочили молча: интейк отверг только задачи, и
       дефект маппинга был виден наполовину. Контракту нужен страж на обеих выжимках. */
    writeFileSync(
      join(bundleDir(), 'requirements.json'),
      JSON.stringify({ bundleId: 'b', functionalRequirements: [], nonFunctionalRequirements: [] }),
      'utf8',
    );

    expect(() => readBundle(bundleDir())).toThrow(/ни одного требования/);
  });

  it('names a missing file rather than throwing whatever `readFile` throws', () => {
    rmSync(join(bundleDir(), 'constitution.md'));

    try {
      readBundle(bundleDir());
      expect.unreachable('a bundle without its constitution must be refused');
    } catch (error) {
      expect(error).toBeInstanceOf(BundleRejected);
      expect((error as BundleRejected).message).toContain('constitution.md');
    }
  });

  it('refuses a cycle in dependsOn as a named error, not a hang', async () => {
    const source = JSON.parse(readFileSync(join(bundleDir(), 'tasks.json'), 'utf8')) as {
      tasks: { taskId: string; dependsOn: string[] }[];
    };
    const [first, second] = source.tasks;
    if (first === undefined || second === undefined) expect.unreachable('bundle too small');
    first.dependsOn = [second.taskId];
    second.dependsOn = [first.taskId];
    writeFileSync(join(bundleDir(), 'tasks.json'), JSON.stringify(source), 'utf8');

    await expect(run()).rejects.toThrow(IntakeRefused);
    await expect(run()).rejects.toThrow(/Цикл/);
  });
});

/**
 * Класс задумки решает, КАКОЙ план писать (А-36 п.1).
 *
 * Обе стороны развилки — на одном и том же бандле гейта: класс меняет форму плана и не меняет
 * ничего больше. Цепочка сценарная, потому что интейк спрашивает модель дважды и о разном: сперва
 * класс задумки, затем — план под класс. Исследователю провайдер не дан намеренно: снимок диска
 * детерминирован, и порядок вызовов остаётся читаемым.
 */
describe('класс задумки решает, какой план писать (А-36 п.1)', () => {
  const scripted = (...answers: string[]): Chain => {
    let call = 0;
    return {
      providers: [],
      generate: () => {
        const answer = answers[Math.min(call, answers.length - 1)] ?? '';
        call += 1;
        return Promise.resolve({ text: answer, provider: 'claude-cli' });
      },
    };
  };

  const seedFile = (text: string) => {
    writeFileSync(join(directory, 'project', 'SEED.md'), text, 'utf8');
  };

  const intake = (chain: Chain, regenerate = false) =>
    intakeBundle(
      {
        projectDirectory: join(directory, 'project'),
        projectTitle: 'Гейтовый бандл',
        ...(regenerate ? { regenerate: true } : {}),
      },
      { database, logger: createLogger(database), chain, researchChain: null },
    );

  const COHERENT = '{"artifactClass":"coherent-artifact","reason":"сайт"}';
  const SYSTEM = '{"artifactClass":"system","reason":"сервис"}';

  const WHOLE_PLAN = JSON.stringify({
    tasks: [
      {
        role: 'material',
        title: 'Добудь материал',
        description: 'Скачай изображения и шрифты в assets/.',
        filesToEdit: [],
        unitTestCmd: 'test -d assets',
      },
      {
        role: 'whole',
        title: 'Собери артефакт целиком',
        description: 'Собери обе страницы одним заходом, едиными токенами.',
        filesToEdit: ['index.html', 'products.html', 'src/styles/main.css'],
        unitTestCmd: 'test -f index.html',
        iterationTimeoutSec: 5400,
      },
      {
        role: 'measure',
        title: 'Замерь результат',
        description: 'Сверь с эталоном и запиши RESULT.md.',
        filesToEdit: ['RESULT.md'],
        unitTestCmd: 'test -f RESULT.md',
      },
    ],
  });

  /* База пересоздаётся на каждый тест и держит ровно один проект — фильтр по нему избыточен. */
  const indexedTaskIds = (): string[] =>
    (
      database.prepare('SELECT task_id AS taskId FROM tasks ORDER BY task_id').all() as {
        taskId: string;
      }[]
    ).map((row) => row.taskId);

  it('цельный артефакт: план пишется цельно-артефактной формой, а не разбиением бандла', async () => {
    seedFile('Сделай сайт — графическую копию, две страницы, статикой, без бэкенда.');

    const result = await intake(scripted(COHERENT, WHOLE_PLAN));

    expect(result.artifactClass).toBe('coherent-artifact');
    expect(result.tasks.length).toBeLessThanOrEqual(WHOLE_ARTIFACT_TASK_LIMIT);
    expect(result.tasks.map((task) => task.taskId)).toEqual(['WA01', 'WA02', 'WA03']);
    /* Форма, которую суд А-35 бракует у нарезки, здесь проходит: план написан под класс. */
    expect(judgeWholeArtifactPlan(result.tasks)).toEqual([]);
  });

  it('владелец целого владеет артефактом целиком, и его ждут полировка с замером', async () => {
    seedFile('Сделай лендинг в одну страницу.');

    const result = await intake(scripted(COHERENT, WHOLE_PLAN));
    const owner = result.tasks.find((task) => task.title === 'Собери артефакт целиком');

    expect(owner?.filesToEdit).toEqual([
      'index.html',
      'products.html',
      'src/styles/main.css',
    ]);
    expect(owner?.iterationTimeoutSec).toBe(5400);
    expect(result.tasks.at(-1)?.dependsOn).toEqual([owner?.taskId]);
  });

  it('план цельной ветки уезжает на диск и в индекс тем же деревом', async () => {
    seedFile('Сделай сайт-визитку.');

    await intake(scripted(COHERENT, WHOLE_PLAN));

    const onDisk = readdirSync(join(directory, 'project', 'handoff', 'tasks')).filter((name) =>
      name.startsWith('task_'),
    );

    expect(onDisk.sort()).toEqual(['task_WA01.json', 'task_WA02.json', 'task_WA03.json']);
    expect(indexedTaskIds()).toEqual(['WA01', 'WA02', 'WA03']);
  });

  it('система: план по-прежнему режется по бандлу — те же 16 задач, теми же фазами', async () => {
    seedFile('Сделай сервис с API, хранилищем и очередью обработки.');

    const result = await intake(scripted(SYSTEM));

    expect(result.artifactClass).toBe('system');
    expect(result.strategy).toBe('phases');
    expect(result.tasks).toHaveLength(16);
    expect(result.tasks.every((task) => !task.taskId.startsWith('WA'))).toBe(true);
  });

  it('класс не определился — прежнее поведение, как для системы', async () => {
    seedFile('Задумка, о которой модель ответила прозой.');

    const result = await intake(scripted('не знаю, что это'));

    expect(result.artifactClass).toBe('unknown');
    expect(result.tasks).toHaveLength(16);
  });

  it('задумки нет — класс не спрашивается, план прежний', async () => {
    const result = await intake(scripted(COHERENT, WHOLE_PLAN));

    expect(result.artifactClass).toBe('unknown');
    expect(result.tasks).toHaveLength(16);
  });

  it('дерево на диске цельная ветка не переписывает без команды оператора', async () => {
    seedFile('Сделай сайт — графическую копию.');

    await intake(scripted(SYSTEM));
    const second = await intake(scripted(COHERENT, WHOLE_PLAN));

    expect(second.artifactClass).toBe('coherent-artifact');
    expect(second.tasks).toHaveLength(16);
    expect(second.keptFromDisk).toBe(16);
  });

  it('перегенерация уносит вердикт прошлого плана, но не его пробелы', async () => {
    seedFile('Сделай сайт — графическую копию под своим знаком.');
    await intake(scripted(COHERENT, WHOLE_PLAN));

    /* Суд полноты назвал пробел этому плану — так, как назвал бы его живой прогон. */
    writeFileSync(
      join(directory, 'project', 'handoff', 'PLAN_REVIEW.json'),
      JSON.stringify({
        verdict: 'gaps',
        gaps: ['Нет задачи, заменяющей бренд на нейтральный знак'],
        judgedBy: 'claude-cli',
        at: new Date().toISOString(),
        decision: null,
        artifactClass: 'coherent-artifact',
      }),
      'utf8',
    );

    const asked: string[] = [];
    const recording: Chain = {
      providers: [],
      generate: (call: { prompt: string }) => {
        asked.push(call.prompt);
        return Promise.resolve({
          text: asked.length === 1 ? COHERENT : WHOLE_PLAN,
          provider: 'claude-cli',
        });
      },
    };

    await intake(recording, true);

    /* Вердикт ушёл вместе с планом — иначе гейт остановил бы свежий план, не увидев его. */
    expect(existsSync(join(directory, 'project', 'handoff', 'PLAN_REVIEW.json'))).toBe(false);
    /* А названный пробел вернулся автору плана. */
    expect(asked.at(-1)).toContain('Нет задачи, заменяющей бренд на нейтральный знак');
    expect(asked.at(-1)).toContain('обязан быть покрыт задачей нового плана');
  });

  it('перегенерация цельным планом уносит из индекса задачи, которых на диске больше нет', async () => {
    seedFile('Сделай сайт — графическую копию.');

    await intake(scripted(SYSTEM));
    expect(indexedTaskIds()).toHaveLength(16);

    const regenerated = await intake(scripted(COHERENT, WHOLE_PLAN), true);

    expect(regenerated.regenerated).toBe(true);
    expect(regenerated.tasks).toHaveLength(3);
    /* Сорок пять строк прошлого плана не остаются исполнимыми задачами без файлов на диске. */
    expect(indexedTaskIds()).toEqual(['WA01', 'WA02', 'WA03']);
  });
});
