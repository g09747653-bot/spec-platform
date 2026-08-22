import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openMigratedDatabase } from '../db/migrate.ts';
import { createFakeEngine } from '../docker/testing/fake-engine.ts';
import { executorPrompt } from '../executor/claude-command.ts';
import { hasRedVerdict, verdictPath } from '../gate/verdicts.ts';
import { HANDOFF, HandoffTask, importHandoff, taskFileName } from '../intake/handoff.ts';
import { createLogger, type Logger } from '../observability/log.ts';

import { runCycle } from './run-cycle.ts';

/**
 * The iteration ceiling a task carries for itself (task 174; А-26 §2).
 *
 * `iterationTimeoutSec` lives in the assignment on disk — the mark an operator or the assignment
 * architect puts on a task known to be heavy — and the claim under test is that the cycle actually
 * reads it and hands it to the executor's clock, ahead of whatever the run was configured with. The
 * disk is the source of truth, so the case writes the mark where a person would: into
 * `task_*.json`.
 */

const PROJECT = 'ceiling';

let workspace: string;
let projectDirectory: string;
let database: DatabaseSync;
let logger: Logger;

function task(taskId: string, iterationTimeoutSec?: number): HandoffTask {
  return HandoffTask.parse({
    taskId,
    milestoneId: 'ms_01',
    title: `Задача ${taskId}`,
    description: 'Сделать',
    techStack: 'nodejs',
    filesToEdit: [],
    dependsOn: [],
    unitTestCmd: 'npm test',
    expectedArtifacts: [],
    status: 'PENDING',
    ...(iterationTimeoutSec === undefined ? {} : { iterationTimeoutSec }),
  });
}

function writeTree(tasks: readonly HandoffTask[]): void {
  mkdirSync(join(projectDirectory, HANDOFF.tasks), { recursive: true });
  mkdirSync(join(projectDirectory, HANDOFF.reports), { recursive: true });

  writeFileSync(
    join(projectDirectory, HANDOFF.milestones),
    `${JSON.stringify(
      {
        projectId: PROJECT,
        milestones: [{ milestoneId: 'ms_01', title: 'Ядро', description: '', dependsOn: [] }],
      },
      null,
      2,
    )}\n`,
    'utf8',
  );

  for (const entry of tasks) {
    writeFileSync(
      join(projectDirectory, HANDOFF.tasks, taskFileName(entry.taskId)),
      `${JSON.stringify(entry, null, 2)}\n`,
      'utf8',
    );
  }

  writeFileSync(
    join(projectDirectory, 'package.json'),
    JSON.stringify({ name: 'toy', private: true, scripts: { test: 'node -e 0' } }, null, 2),
    'utf8',
  );

  importHandoff(
    database,
    PROJECT,
    'Проект с потолками',
    [{ milestoneId: 'ms_01', title: 'Ядро', description: '', dependsOn: [], taskIds: [] }],
    tasks,
  );
}

/** Ответ наблюдателя копии: generic-листинг — команды у заданий этого файла свои (stated). */
const EMPTY_LISTING = { exitCode: 0, stdout: ['__LOOP_OBSERVE_MANIFEST__'] };

/** An executor that never returns; the deadline is the only way the cycle can end. */
function hangingExecutor() {
  return createFakeEngine({
    onStart: ({ name }) => {
      if (name.startsWith('delivery-executor-')) {
        return { stdout: ['работаю…'], until: new Promise<void>(() => undefined) };
      }
      return name.endsWith('-observe') ? EMPTY_LISTING : { exitCode: 0 };
    },
  });
}

beforeEach(() => {
  workspace = mkdtempSync(join(tmpdir(), 'loop-cycle-'));
  projectDirectory = join(workspace, PROJECT);
  mkdirSync(projectDirectory, { recursive: true });
  database = openMigratedDatabase(join(workspace, 'loop.db'));
  logger = createLogger(database);
});

afterEach(() => {
  database.close();
  try {
    rmSync(workspace, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  } catch {
    // Cleanup is not an assertion.
  }
});

describe('the per-task iteration ceiling (task 174)', () => {
  it('reads `iterationTimeoutSec` off the assignment and kills the iteration by it', async () => {
    writeTree([task('task_marked', 1)]);

    const startedAt = Date.now();
    const result = await runCycle(
      { projectId: PROJECT, taskId: 'task_marked', projectDirectory },
      {
        database,
        engine: hangingExecutor(),
        logger,
        credential: { kind: 'ANTHROPIC_API_KEY', value: 'not-a-real-key' },
        executorCommand: ['sh', '-c', 'sleep 600'],
        /* The run's own configuration says a minute; the task's own mark must outrank it. */
        executorTimeoutMs: 60_000,
      },
    );

    expect(result.outcome).toBe('FAILED');
    expect(result.executor.outcome).toBe('TIMEOUT');
    // Well under the run's 60 s: the 1-second mark decided, plus the deadline's 500 ms tick.
    expect(Date.now() - startedAt).toBeLessThan(20_000);

    const feed = database
      .prepare('SELECT message FROM agent_logs ORDER BY log_id')
      .all()
      .map((row) => String((row as { message: unknown }).message))
      .join('\n');
    expect(feed).toContain('собственный потолок итерации: 1 с');
  });

  it('uses the run’s configured limit when the assignment carries no mark', async () => {
    writeTree([task('task_plain')]);

    const result = await runCycle(
      { projectId: PROJECT, taskId: 'task_plain', projectDirectory },
      {
        database,
        engine: hangingExecutor(),
        logger,
        credential: { kind: 'ANTHROPIC_API_KEY', value: 'not-a-real-key' },
        executorCommand: ['sh', '-c', 'sleep 600'],
        executorTimeoutMs: 700,
      },
    );

    expect(result.outcome).toBe('FAILED');
    expect(result.executor.outcome).toBe('TIMEOUT');
  });

  it('rejects an assignment whose mark is out of range — the ceiling is a back stop', () => {
    expect(() => task('task_bad', 100_000)).toThrow();
    expect(() => task('task_bad', 0)).toThrow();
  });

  it('parses every assignment written before the field existed — additive, like D-223', () => {
    const legacy = HandoffTask.parse({
      taskId: 'task_old',
      milestoneId: 'ms_01',
      title: 'Старое задание',
      description: 'Сделать',
      techStack: 'nodejs',
      filesToEdit: [],
      expectedArtifacts: [],
      status: 'PENDING',
    });

    expect(legacy.iterationTimeoutSec).toBeUndefined();
  });
});

describe('вердикт приёмки — исполнителю повтора (task 176)', () => {
  const TASK = 'task_verdict';

  /** Отчёт SUCCESS, каким его пишет исполнитель. Пишется хуком фейкового контейнера. */
  const successReport = () =>
    JSON.stringify(
      {
        reportId: 'r1',
        taskId: TASK,
        projectId: PROJECT,
        executorId: 'stub',
        status: 'SUCCESS',
        testsRun: { total: 1, passed: 1, failed: 0 },
      },
      null,
      2,
    );

  /** Снимки дерева, какими их отдаёт контейнерный наблюдатель (D-314): дифф и есть «правки». */
  const BASE_TREE = ['f 10 100.0 ./src/util.js', 'd 4096 100.0 ./src'];
  const EDITED_TREE = ['f 24 200.0 ./src/util.js', 'd 4096 200.0 ./src'];

  /**
   * Один стаб-цикл: исполнитель пишет отчёт, наблюдатель отвечает снимками (после итерации —
   * правленым, когда велено), контейнер `-unit` выходит кодом, который назначил кейс. Свежий
   * движок на каждый цикл, чтобы утверждать «приёмка не запускалась» по контейнерам ИМЕННО этого
   * цикла. Хостовый workspace НЕ трогается правками вовсе: цикл обязан судить по снимкам
   * наблюдателя, а не по хостовому взгляду — это и есть шов D-314.
   */
  const cycle = (
    unitExitCode: number,
    executorEdits: boolean,
    overrides: Record<string, { exitCode?: number; stdout?: string[] }> = {},
  ) => {
    const engine = createFakeEngine({
      onStart: ({ name }) => {
        const suffix = Object.keys(overrides).find((key) => name.endsWith(key));
        if (suffix !== undefined) return overrides[suffix] ?? { exitCode: 0 };

        if (name.startsWith('delivery-executor-')) {
          writeFileSync(
            join(projectDirectory, HANDOFF.reports, `report_${TASK}.json`),
            successReport(),
            'utf8',
          );
          return { exitCode: 0 };
        }
        if (name.endsWith('-snapshot-before')) return { exitCode: 0, stdout: BASE_TREE };
        if (name.endsWith('-snapshot-after')) {
          return { exitCode: 0, stdout: executorEdits ? EDITED_TREE : BASE_TREE };
        }
        if (name.endsWith('-observe')) return EMPTY_LISTING;
        if (name.endsWith('-unit')) return { exitCode: unitExitCode };
        return { exitCode: 0 };
      },
    });

    return {
      engine,
      run: () =>
        runCycle(
          { projectId: PROJECT, taskId: TASK, projectDirectory },
          {
            database,
            engine,
            logger,
            credential: { kind: 'ANTHROPIC_API_KEY', value: 'not-a-real-key' },
            executorCommand: ['sh', '-c', 'true'],
          },
        ),
    };
  };

  beforeEach(() => {
    writeTree([task(TASK)]);
  });

  it('красный вердикт ложится на диск с причиной; зелёный повтор с правками уносит его', async () => {
    const red = cycle(1, true);
    const first = await red.run();

    expect(first.outcome).toBe('FAILED');
    expect(hasRedVerdict(projectDirectory, TASK)).toBe(true);
    const text = readFileSync(verdictPath(projectDirectory, TASK), 'utf8');
    expect(text).toContain('НЕ ПРИНЯТА');
    expect(text).toContain('вернул 1');

    const green = cycle(0, true);
    const second = await green.run();

    expect(second.outcome).toBe('COMPLETED');
    expect(hasRedVerdict(projectDirectory, TASK)).toBe(false);
  });

  it('повтор без правок при красной причине — именованный отказ, приёмка не запускается', async () => {
    const red = cycle(1, true);
    await red.run();
    expect(hasRedVerdict(projectDirectory, TASK)).toBe(true);

    const repeat = cycle(0, false);
    const result = await repeat.run();

    expect(result.outcome).toBe('FAILED');
    expect(result.reason).toContain('Повтор без правок при красной причине');
    expect(result.acceptance).toBeNull();
    /* Приёмка этого цикла не начиналась: ни копии, ни тестового контейнера — снимки не в счёт. */
    expect(
      repeat.engine.containers.filter(
        (c) => c.name.includes('delivery-gate-') && !c.name.includes('-snapshot-'),
      ),
    ).toHaveLength(0);

    /* Вердикт обновлён отказом, прежняя причина сохранена — повтор читает обе. */
    const text = readFileSync(verdictPath(projectDirectory, TASK), 'utf8');
    expect(text).toContain('Повтор без правок');
    expect(text).toContain('вернул 1');
  });

  it('отказ — один раз на цепочку: второй такой же повтор уходит приёмке на перепроверку (находка гейта M17а)', async () => {
    /* Красный → отказ повтора (как выше) → и ТРЕТИЙ заход без правок: причина могла быть
       переходной (образ, PATH, среда) — решает перепрогон приёмки, а не вечный отказ. */
    await cycle(1, true).run();
    const refused = await cycle(0, false).run();
    expect(refused.reason).toContain('Повтор без правок');

    const third = cycle(0, false);
    const result = await third.run();

    expect(result.outcome).toBe('COMPLETED');
    /* Приёмка НА ЭТОТ раз запускалась — и решила сама. */
    expect(third.engine.containers.some((c) => c.name.endsWith('-unit'))).toBe(true);
    expect(hasRedVerdict(projectDirectory, TASK)).toBe(false);
  });

  it('«без правок» доказывают только два УДАВШИХСЯ снимка: не взятый снимок читается как правка (дух D-308)', async () => {
    await cycle(1, true).run();
    expect(hasRedVerdict(projectDirectory, TASK)).toBe(true);

    /* Наблюдатель снимка «до» слеп (например, образа нет) — отказ 176 по сомнению невозможен:
       повтор уходит приёмке, и зелёный перепрогон честно закрывает задачу. */
    const doubted = cycle(0, false, { '-snapshot-before': { exitCode: 1 } });
    const result = await doubted.run();

    expect(result.outcome).toBe('COMPLETED');
    expect(doubted.engine.containers.some((c) => c.name.endsWith('-unit'))).toBe(true);

    const feed = database
      .prepare('SELECT message FROM agent_logs ORDER BY log_id')
      .all()
      .map((row) => String((row as { message: unknown }).message))
      .join('\n');
    expect(feed).toContain('Снимок дерева до итерации не взят');
  });

  it('суд видит мир контейнерным листингом в момент суда: маркер, созданный во время итерации, судится (находка гейта M17а, D-314)', async () => {
    /* Задание без команд, ХОСТОВЫЙ workspace без манифеста — хостовыми глазами стек generic и
       приёмке было бы «нечего запускать». Наблюдатель копии отвечает листингом с package.json:
       суд обязан судить по нему — nodejs, npm test — и переписать задание. До правки этот класс
       дал каскад 127/отказов в параллельной вехе живого прогона; слепоту хоста к контейнерным
       записям в тесте не воспроизвести, поэтому тестируется шов: листинг решает, хост — нет. */
    rmSync(join(projectDirectory, 'package.json'), { force: true });
    writeFileSync(
      join(projectDirectory, HANDOFF.tasks, taskFileName(TASK)),
      `${JSON.stringify(
        HandoffTask.parse({
          taskId: TASK,
          milestoneId: 'ms_01',
          title: 'Задача без команд',
          description: 'Сделать',
          techStack: 'generic',
          filesToEdit: [],
          expectedArtifacts: [],
          status: 'PENDING',
        }),
        null,
        2,
      )}\n`,
      'utf8',
    );

    const engine = createFakeEngine({
      onStart: ({ name }) => {
        if (name.startsWith('delivery-executor-')) {
          writeFileSync(
            join(projectDirectory, HANDOFF.reports, `report_${TASK}.json`),
            successReport(),
            'utf8',
          );
          return { exitCode: 0 };
        }
        if (name.endsWith('-observe')) {
          return {
            exitCode: 0,
            stdout: [
              './package.json',
              '__LOOP_OBSERVE_MANIFEST__',
              '{"scripts":{"test":"node -e 0"}}',
            ],
          };
        }
        return { exitCode: 0 };
      },
    });

    const result = await runCycle(
      { projectId: PROJECT, taskId: TASK, projectDirectory },
      {
        database,
        engine,
        logger,
        credential: { kind: 'ANTHROPIC_API_KEY', value: 'not-a-real-key' },
        executorCommand: ['sh', '-c', 'true'],
      },
    );

    expect(result.outcome).toBe('COMPLETED');
    expect(result.techStackRewritten).toBe(true);
    expect(engine.containers.some((c) => c.name.endsWith('-unit'))).toBe(true);

    /* Чем судили — на диске: следующий читатель задания видит стек вердикта. */
    const onDisk = HandoffTask.parse(
      JSON.parse(readFileSync(join(projectDirectory, HANDOFF.tasks, taskFileName(TASK)), 'utf8')),
    );
    expect(onDisk.techStack).toBe('nodejs');
    expect(onDisk.unitTestCmd).toBe('npm test');
  });

  it('приёмка гоняет команды через sh -c, не -lc: login-шелл терял toolchain-PATH (находка гейта M17а)', async () => {
    const green = cycle(0, true);
    await green.run();

    const unit = green.engine.containers.find((c) => c.name.endsWith('-unit'));
    expect(unit?.spec.cmd?.slice(0, 2)).toEqual(['sh', '-c']);
  });

  it('повтор С правками идёт приёмке своим чередом — отказ не срабатывает зря', async () => {
    const red = cycle(1, true);
    await red.run();

    const repeat = cycle(1, true);
    const result = await repeat.run();

    /* Правка была — приёмка запускалась и снова красная; это старое честное поведение. */
    expect(result.outcome).toBe('FAILED');
    expect(result.reason).toContain('вернул 1');
    expect(repeat.engine.containers.some((c) => c.name.endsWith('-unit'))).toBe(true);
  });

  it('промпт исполнителя называет файл вердикта по имени задачи', () => {
    const prompt = executorPrompt('/workspace/handoff/tasks/task_verdict.json', TASK);
    expect(prompt).toContain(`handoff/reports/verdict_${TASK}.md`);
    expect(prompt).toContain('прочитай его ПЕРВЫМ');
    expect(prompt).toContain('SUCCESS');
  });
});
