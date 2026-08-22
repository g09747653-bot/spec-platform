import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { openMigratedDatabase } from '../db/migrate.ts';
import { createDockerEngine, type DockerEngine } from '../docker/engine.ts';
import { resolveEndpoint } from '../docker/transport.ts';
import { ensureExecutorImage } from '../executor/image.ts';
import { HANDOFF, HandoffTask, taskFileName } from '../intake/handoff.ts';
import { createLogger } from '../observability/log.ts';

import { runCycle } from './run-cycle.ts';

/**
 * The single acceptance cycle, end to end, on a **stub executor** (task 157 AC-1/AC-2).
 *
 * No live model anywhere: the executor's place is taken by a shell script, which is what makes this
 * runnable in CI on every change (the platform's NFR-012 discipline). Everything else is real — a
 * real container for the executor, a real fresh container for the acceptance, a real copy of the
 * codebase, real test commands.
 *
 * The case that matters most is the second one: **an executor that reports SUCCESS over a red
 * codebase must move nothing.** That is the whole reason acceptance is a separate container, and a
 * design whose central claim has no test is a design nobody has checked.
 */

const ENDPOINT = resolveEndpoint(process.platform);

/* eslint-disable-next-line no-restricted-properties -- CI is the runner telling us where we are */
const ON_CI = process.env.CI === 'true' || process.env.CI === '1';

const DAEMON_LOOKS_PRESENT =
  ON_CI ||
  ENDPOINT.kind === 'npipe' ||
  (() => {
    try {
      return statSync(ENDPOINT.socketPath).isSocket();
    } catch {
      return false;
    }
  })();

let engine: DockerEngine;
let reachable = false;
let directory: string;
let database: DatabaseSync;

/** A tiny Node project whose test command the acceptance run can actually execute. */
function seedProject(unitTestPasses: boolean): void {
  writeFileSync(
    join(directory, 'package.json'),
    JSON.stringify(
      {
        name: 'toy',
        private: true,
        scripts: { test: unitTestPasses ? 'node check.js' : 'node check.js --fail' },
      },
      null,
      2,
    ),
    'utf8',
  );

  writeFileSync(
    join(directory, 'check.js'),
    [
      "const failing = process.argv.includes('--fail');",
      "console.log(failing ? 'тесты красные' : 'тесты зелёные');",
      'process.exit(failing ? 1 : 0);',
    ].join('\n'),
    'utf8',
  );
}

function seedTask(overrides: Partial<HandoffTask> = {}): HandoffTask {
  const task = HandoffTask.parse({
    taskId: 'cycle_1',
    milestoneId: 'ms_01',
    title: 'Игрушечная задача',
    description: 'Дописать строку в файл.',
    techStack: 'generic',
    filesToEdit: ['out.txt'],
    dependsOn: [],
    expectedArtifacts: [],
    status: 'PENDING',
    ...overrides,
  });

  mkdirSync(join(directory, HANDOFF.tasks), { recursive: true });
  mkdirSync(join(directory, HANDOFF.reports), { recursive: true });
  writeFileSync(
    join(directory, HANDOFF.tasks, taskFileName(task.taskId)),
    `${JSON.stringify(task, null, 2)}\n`,
    'utf8',
  );

  database
    .prepare("INSERT INTO projects (project_id, title, status) VALUES ('p1', 'Проект', 'ACTIVE')")
    .run();
  database
    .prepare(
      `INSERT INTO milestones (milestone_id, project_id, title, status)
       VALUES ('ms_01', 'p1', 'Веха', 'PENDING')`,
    )
    .run();
  database
    .prepare(
      `INSERT INTO tasks (task_id, milestone_id, title, description, tech_stack, files_to_edit,
                          expected_artifacts, status)
       VALUES (?, 'ms_01', ?, ?, 'generic', '[]', '[]', 'PENDING')`,
    )
    .run(task.taskId, task.title, task.description);

  return task;
}

/** The stub executor: writes a file and a report, exactly as a real one would. */
function stubExecutor(reportStatus: 'SUCCESS' | 'FAILED' | 'BLOCKED', alsoBlock = false): string[] {
  const report = {
    reportId: 'r-stub',
    taskId: 'cycle_1',
    projectId: 'p1',
    executorId: 'executor_stub',
    status: reportStatus,
    testsRun: { total: 1, passed: reportStatus === 'SUCCESS' ? 1 : 0, failed: 0 },
    decisionTitle: 'Выбран простой путь',
    rationale: 'Задача мала, лишних абстракций не нужно.',
  };

  return [
    'sh',
    '-c',
    [
      'echo "исполнитель начал"',
      'printf "готово\\n" > /workspace/out.txt',
      `cat > /workspace/${HANDOFF.reports.replaceAll('\\', '/')}/report_cycle_1.json <<'JSON'`,
      JSON.stringify(report, null, 2),
      'JSON',
      ...(alsoBlock ? ['printf "# BLOCKED: cycle_1\\n" > /workspace/BLOCKED_cycle_1.md'] : []),
      'echo "исполнитель закончил"',
    ].join('\n'),
  ];
}

beforeAll(async () => {
  engine = createDockerEngine(ENDPOINT);
  reachable = await engine.ping();

  if (!reachable) {
    const reason = `Docker не отвечает на ${ENDPOINT.display} — сквозной кейс цикла пропущен.`;
    if (ON_CI) throw new Error(reason);
    console.warn(reason);
    return;
  }

  await ensureExecutorImage(engine);
  /* The neutral image is the observer's and the copy's (D-314); the node image runs the tests. */
  for (const image of ['node:24-bookworm-slim', 'debian:bookworm-slim']) {
    if (!(await engine.hasImage(image))) await engine.pullImage(image);
  }
}, 40 * 60_000);

afterAll(async () => {
  if (!reachable) return;

  for (const name of [
    'delivery-executor-cycle_1',
    'delivery-gate-cycle_1-copy',
    'delivery-gate-cycle_1-observe',
    'delivery-gate-cycle_1-unit',
  ]) {
    const leftover = await engine.findByName(name);
    if (leftover !== null) await engine.removeContainer(leftover, { force: true });
  }
});

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'loop-cycle-'));
  database = openMigratedDatabase(join(directory, '.db', 'loop.db'));
});

afterEach(() => {
  database.close();
  try {
    rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  } catch {
    // Cleanup is not an assertion.
  }
});

const cycle = (command: string[]) =>
  runCycle(
    { projectId: 'p1', taskId: 'cycle_1', projectDirectory: directory },
    {
      database,
      engine,
      logger: createLogger(database),
      credential: { kind: 'ANTHROPIC_API_KEY', value: 'not-used-by-the-stub' },
      executorCommand: command,
      executorTimeoutMs: 120_000,
      acceptanceTimeoutMs: 180_000,
    },
  );

const statusInDatabase = () =>
  String(database.prepare("SELECT status FROM tasks WHERE task_id = 'cycle_1'").get()?.status);

const statusOnDisk = () =>
  HandoffTask.parse(
    JSON.parse(readFileSync(join(directory, HANDOFF.tasks, taskFileName('cycle_1')), 'utf8')),
  ).status;

describe.skipIf(!DAEMON_LOOKS_PRESENT)('the single acceptance cycle (task 157)', () => {
  it('carries a task from PENDING to COMPLETED when the clean container agrees', async () => {
    if (!reachable) return;

    seedProject(true);
    seedTask();

    const result = await cycle(stubExecutor('SUCCESS'));

    expect(result.outcome).toBe('COMPLETED');
    expect(result.executor.outcome).toBe('SUCCESS');
    expect(result.acceptance?.accepted).toBe(true);

    // The executor's edit is on the host, and the verdict is on disk and in the index alike.
    expect(readFileSync(join(directory, 'out.txt'), 'utf8').trim()).toBe('готово');
    expect(statusOnDisk()).toBe('COMPLETED');
    expect(statusInDatabase()).toBe('COMPLETED');

    // The stack was detected from the project, not taken from the assignment's guess.
    expect(result.techStackRewritten).toBe(true);

    // And the reasoning the executor offered was recorded, under a reproducible identifier.
    expect(result.decisionId).toMatch(/^[0-9a-f]{32}$/);
    expect(database.prepare('SELECT count(*) AS n FROM agent_decisions').get()?.n).toBe(1);
  }, 300_000);

  it('does NOT complete a task the executor called SUCCESS when the clean container is red', async () => {
    if (!reachable) return;

    // The codebase's own test command fails. The executor still reports success — which is exactly
    // the situation two-phase verification exists for.
    seedProject(false);
    seedTask();

    const result = await cycle(stubExecutor('SUCCESS'));

    expect(result.reported?.status).toBe('SUCCESS');
    expect(result.executor.outcome).toBe('SUCCESS');

    expect(result.acceptance?.accepted).toBe(false);
    expect(result.outcome).toBe('FAILED');
    expect(statusOnDisk()).not.toBe('COMPLETED');
    expect(statusInDatabase()).toBe('FAILED');
    expect(result.reason).toContain('чистом контейнере');

    // The feed says it in so many words, so the operator does not have to infer it.
    const said = database
      .prepare("SELECT message FROM agent_logs WHERE project_id = 'p1'")
      .all()
      .map((row) => String(row.message))
      .join('\n');
    expect(said).toContain('Решает контейнер');
  }, 300_000);

  it('survives a workspace holding symlinks — the shape npm install leaves behind', async () => {
    if (!reachable) return;

    seedProject(true);
    /*
     * Two assertions in one case, because the defect and the property are different things.
     *
     * On Windows the case is the regression itself (D-269): an executor that runs `npm install`
     * leaves `node_modules/.bin/*` as POSIX symlinks, written straight through the bind mount, and
     * copying those from the host asks Windows to *create* symlinks — which is privileged, and which
     * `fs.cpSync` answered by terminating the process (0xC0000409), taking the orchestrator with it
     * and logging nothing. Reaching a verdict at all is the assertion.
     *
     * On Linux — where CI runs, and where that crash cannot happen — the artifact walk is what
     * carries the case: it asserts inside the clean container that the copy still holds a real
     * symlink pointing where npm put it. That is the property the fix is actually for, and it holds
     * on every platform.
     */
    seedTask({
      expectedArtifacts: [
        {
          path: 'node_modules/.bin/acorn',
          validationCmd: 'sh',
          validationArgs: ['-c', 'readlink node_modules/.bin/acorn'],
          successRegex: 'acorn/bin/acorn',
        },
      ],
    });
    const result = await cycle([
      'sh',
      '-c',
      [
        'mkdir -p /workspace/node_modules/.bin /workspace/node_modules/acorn/bin',
        'printf "#!/usr/bin/env node\\n" > /workspace/node_modules/acorn/bin/acorn',
        'ln -s ../acorn/bin/acorn /workspace/node_modules/.bin/acorn',
        'printf "готово\\n" > /workspace/out.txt',
        `cat > /workspace/${HANDOFF.reports.replaceAll('\\', '/')}/report_cycle_1.json <<'JSON'`,
        JSON.stringify(
          {
            reportId: 'r-stub',
            taskId: 'cycle_1',
            projectId: 'p1',
            executorId: 'executor_stub',
            status: 'SUCCESS',
            testsRun: { total: 1, passed: 1, failed: 0 },
          },
          null,
          2,
        ),
        'JSON',
      ].join('\n'),
    ]);

    // The point is that there is a verdict at all: before the fix, this process did not reach here.
    expect(result.outcome, result.acceptance?.reason ?? result.reason).toBe('COMPLETED');
    expect(result.acceptance?.accepted).toBe(true);
    expect(statusOnDisk()).toBe('COMPLETED');
  }, 300_000);

  it('stops at a block without running the acceptance at all', async () => {
    if (!reachable) return;

    seedProject(true);
    seedTask();

    const result = await cycle(stubExecutor('BLOCKED', true));

    expect(result.outcome).toBe('BLOCKED');
    expect(result.acceptance).toBeNull();
    expect(statusOnDisk()).toBe('BLOCKED');
    expect(statusInDatabase()).toBe('BLOCKED');
  }, 300_000);

  it('refuses, by name, when the stack is generic and nothing names a command', async () => {
    if (!reachable) return;

    // No marker file at all, and an assignment with no commands of its own.
    seedTask();

    const result = await cycle(stubExecutor('SUCCESS'));

    expect(result.outcome).toBe('FAILED');
    expect(result.acceptance?.accepted).toBe(false);
    expect(result.acceptance?.reason).toContain('generic');
    expect(result.acceptance?.reason).toContain('unitTestCmd');
  }, 300_000);

  it('walks the expected artifacts in the clean container, and refuses when one does not match', async () => {
    if (!reachable) return;

    seedProject(true);
    seedTask({
      expectedArtifacts: [
        {
          path: 'out.txt',
          validationCmd: 'cat',
          validationArgs: ['out.txt'],
          successRegex: 'готово',
        },
      ],
    });

    const accepted = await cycle(stubExecutor('SUCCESS'));
    expect(accepted.outcome).toBe('COMPLETED');
    expect(accepted.acceptance?.artifacts[0]).toMatchObject({ present: true, matched: true });

    // The same walk with a pattern the output cannot satisfy refuses the task.
    rmSync(join(directory, HANDOFF.reports, 'report_cycle_1.json'), { force: true });
    database.prepare("UPDATE tasks SET status = 'PENDING' WHERE task_id = 'cycle_1'").run();
    const path = join(directory, HANDOFF.tasks, taskFileName('cycle_1'));
    const task = HandoffTask.parse(JSON.parse(readFileSync(path, 'utf8')));
    writeFileSync(
      path,
      `${JSON.stringify(
        HandoffTask.parse({
          ...task,
          status: 'PENDING',
          expectedArtifacts: [
            {
              path: 'out.txt',
              validationCmd: 'cat',
              validationArgs: ['out.txt'],
              successRegex: 'этого там нет',
            },
          ],
        }),
        null,
        2,
      )}\n`,
      'utf8',
    );

    const refused = await cycle(stubExecutor('SUCCESS'));
    expect(refused.outcome).toBe('FAILED');
    expect(refused.acceptance?.reason).toContain('Артефакты не подтвердились');
  }, 300_000);
});
