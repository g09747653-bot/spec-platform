import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
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

/** An executor that never returns; the deadline is the only way the cycle can end. */
function hangingExecutor() {
  return createFakeEngine({
    onStart: ({ name }) =>
      name.startsWith('delivery-executor-')
        ? { stdout: ['работаю…'], until: new Promise<void>(() => undefined) }
        : { exitCode: 0 },
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

  /**
   * Один стаб-цикл: исполнитель пишет отчёт (и правит файл, когда велено), контейнер `-unit`
   * выходит кодом, который назначил кейс. Свежий движок на каждый цикл, чтобы утверждать «приёмка
   * не запускалась» по контейнерам ИМЕННО этого цикла.
   */
  const cycle = (unitExitCode: number, executorEdits: boolean) => {
    const engine = createFakeEngine({
      onStart: ({ name }) => {
        if (name.startsWith('delivery-executor-')) {
          writeFileSync(
            join(projectDirectory, HANDOFF.reports, `report_${TASK}.json`),
            successReport(),
            'utf8',
          );
          if (executorEdits) {
            writeFileSync(
              join(projectDirectory, 'src', 'util.js'),
              `// правка ${String(Date.now())}\n`,
              'utf8',
            );
          }
          return { exitCode: 0 };
        }
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

  /** Рабочее дерево «постарело»: правки прошлого цикла не должны выглядеть правками нового. */
  const ageWorkspace = () => {
    const past = new Date(Date.now() - 60_000);
    for (const path of [
      join(projectDirectory, 'src', 'util.js'),
      join(projectDirectory, 'src'),
      join(projectDirectory, 'package.json'),
    ]) {
      if (existsSync(path)) utimesSync(path, past, past);
    }
  };

  beforeEach(() => {
    writeTree([task(TASK)]);
    mkdirSync(join(projectDirectory, 'src'), { recursive: true });
    ageWorkspace();
  });

  it('красный вердикт ложится на диск с причиной; зелёный повтор с правками уносит его', async () => {
    const red = cycle(1, true);
    const first = await red.run();

    expect(first.outcome).toBe('FAILED');
    expect(hasRedVerdict(projectDirectory, TASK)).toBe(true);
    const text = readFileSync(verdictPath(projectDirectory, TASK), 'utf8');
    expect(text).toContain('НЕ ПРИНЯТА');
    expect(text).toContain('вернул 1');

    ageWorkspace();
    const green = cycle(0, true);
    const second = await green.run();

    expect(second.outcome).toBe('COMPLETED');
    expect(hasRedVerdict(projectDirectory, TASK)).toBe(false);
  });

  it('повтор без правок при красной причине — именованный отказ, приёмка не запускается', async () => {
    const red = cycle(1, true);
    await red.run();
    expect(hasRedVerdict(projectDirectory, TASK)).toBe(true);

    ageWorkspace();
    const repeat = cycle(0, false);
    const result = await repeat.run();

    expect(result.outcome).toBe('FAILED');
    expect(result.reason).toContain('Повтор без правок при красной причине');
    expect(result.acceptance).toBeNull();
    /* Приёмка этого цикла не начиналась: ни копии, ни тестового контейнера. */
    expect(repeat.engine.containers.filter((c) => c.name.includes('delivery-gate-'))).toHaveLength(
      0,
    );

    /* Вердикт обновлён отказом, прежняя причина сохранена — повтор читает обе. */
    const text = readFileSync(verdictPath(projectDirectory, TASK), 'utf8');
    expect(text).toContain('Повтор без правок');
    expect(text).toContain('вернул 1');
  });

  it('отказ — один раз на цепочку: второй такой же повтор уходит приёмке на перепроверку (находка гейта M17а)', async () => {
    /* Красный → отказ повтора (как выше) → и ТРЕТИЙ заход без правок: причина могла быть
       переходной (образ, PATH, среда) — решает перепрогон приёмки, а не вечный отказ. */
    await cycle(1, true).run();
    ageWorkspace();
    const refused = await cycle(0, false).run();
    expect(refused.reason).toContain('Повтор без правок');

    ageWorkspace();
    const third = cycle(0, false);
    const result = await third.run();

    expect(result.outcome).toBe('COMPLETED');
    /* Приёмка НА ЭТОТ раз запускалась — и решила сама. */
    expect(third.engine.containers.some((c) => c.name.endsWith('-unit'))).toBe(true);
    expect(hasRedVerdict(projectDirectory, TASK)).toBe(false);
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

    ageWorkspace();
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
