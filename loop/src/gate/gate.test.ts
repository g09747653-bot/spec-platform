import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openMigratedDatabase } from '../db/migrate.ts';
import { HANDOFF, HandoffTask, taskFileName } from '../intake/handoff.ts';

import {
  blockedPath,
  ensureBlockWatcher,
  raiseBlock,
  renderBlockedFile,
  watchBlocks,
} from './blocked.ts';
import { decisionId, disagreesAboutOwner, readReport, recordDecision } from './report.ts';
import {
  commandsRefusal,
  detectStackFromObservation,
  detectTechStack,
  resolveCommands,
  rewriteAssignment,
} from './tech-stack.ts';

/**
 * The gate's own machinery (task 157), minus the parts that need a daemon.
 *
 * Three claims live here: that the stack detection is a pure function over an observation whose
 * facts the acceptance collects with container eyes (D-314) while boot-time recovery may still use
 * the host's, that what the gate judged is written back into the assignment on disk (the disk is
 * the source of truth, so a detection that stayed in memory would be lost on restart), that a
 * blocking file is created and — critically — that **deleting it returns the task to work within a
 * second**, and that the executor's rationale reaches `agent_decisions` under a reproducible
 * identifier.
 */

let directory: string;
let database: DatabaseSync;

const PACKAGE_WITH_TESTS = JSON.stringify({
  name: 'toy',
  scripts: { test: 'node check.js', 'test:e2e': 'node e2e.js' },
});

const TASK: HandoffTask = {
  taskId: 'task_1',
  milestoneId: 'ms_01',
  title: 'Задача',
  description: 'Сделать',
  techStack: 'generic',
  filesToEdit: [],
  dependsOn: [],
  expectedArtifacts: [],
  status: 'PENDING',
};

function writeTask(overrides: Partial<HandoffTask> = {}): void {
  mkdirSync(join(directory, HANDOFF.tasks), { recursive: true });
  writeFileSync(
    join(directory, HANDOFF.tasks, taskFileName(TASK.taskId)),
    `${JSON.stringify(HandoffTask.parse({ ...TASK, ...overrides }), null, 2)}\n`,
    'utf8',
  );
}

function readTask(): HandoffTask {
  return HandoffTask.parse(
    JSON.parse(readFileSync(join(directory, HANDOFF.tasks, taskFileName(TASK.taskId)), 'utf8')),
  );
}

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'loop-gate-'));
  database = openMigratedDatabase(join(directory, '.db', 'loop.db'));

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
       VALUES ('task_1', 'ms_01', 'Задача', 'Сделать', 'generic', '[]', '[]', 'PENDING')`,
    )
    .run();
});

afterEach(() => {
  database.close();
  try {
    rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  } catch {
    // Cleanup is not an assertion.
  }
});

describe('detecting the stack from an observation (task 157; D-314)', () => {
  const observed = (paths: string[], packageJson: string | null = null) =>
    detectStackFromObservation({ paths: new Set(paths), packageJson });

  it('reads the marker files in A0’s order', () => {
    expect(observed(['package.json'], PACKAGE_WITH_TESTS).techStack).toBe('nodejs');
    // package.json still wins: the order is fixed, not «whichever was found last».
    expect(observed(['package.json', 'go.mod'], PACKAGE_WITH_TESTS).techStack).toBe('nodejs');
    expect(observed(['go.mod']).techStack).toBe('go');
    expect(observed(['Cargo.toml']).techStack).toBe('rust');
    expect(observed(['pyproject.toml', 'tests/e2e'])).toEqual({
      techStack: 'python',
      unitTestCmd: 'pytest',
      e2eTestCmd: 'pytest tests/e2e',
    });
  });

  it('is generic with no markers, and generic has no commands of its own', () => {
    expect(observed([])).toEqual({ techStack: 'generic', unitTestCmd: '', e2eTestCmd: '' });
  });

  it('proposes only the commands the project actually defines', () => {
    // A0's literal algorithm proposes `npm run test:e2e` for every Node project. A project without
    // that script answers with npm's own non-zero exit, and the gate then refuses a task for a
    // suite the plan never promised — which is how the first end-to-end run of the cycle failed.
    expect(observed(['package.json'], JSON.stringify({ scripts: { test: 'x' } }))).toEqual({
      techStack: 'nodejs',
      unitTestCmd: 'npm test',
      e2eTestCmd: '',
    });
  });

  it('proposes nothing for a manifest that declares no scripts at all', () => {
    expect(observed(['package.json'], '{}')).toEqual({
      techStack: 'nodejs',
      unitTestCmd: '',
      e2eTestCmd: '',
    });

    // And a project with nothing to run is refused, whatever its stack says.
    const refusal = commandsRefusal(
      resolveCommands(
        { techStack: 'nodejs', unitTestCmd: undefined, e2eTestCmd: undefined },
        observed(['package.json'], '{}'),
      ),
    );
    expect(refusal).toContain('nodejs');
    expect(refusal).toContain('нечего запускать');
  });

  it('survives an unreadable manifest by proposing nothing rather than throwing', () => {
    expect(observed(['package.json'], '{ это не json').unitTestCmd).toBe('');
  });

  it('host-eyed collection agrees with the pure detection — recovery’s one legitimate use', () => {
    // Boot-time recovery (task 162) runs in a fresh process, where the D-314 blindness was not
    // measured; it repairs a lost field rather than judging a verdict, so host eyes stay allowed
    // there — and must reach the same answers through the same pure function.
    writeFileSync(join(directory, 'package.json'), PACKAGE_WITH_TESTS, 'utf8');
    expect(detectTechStack(directory)).toEqual({
      techStack: 'nodejs',
      unitTestCmd: 'npm test',
      e2eTestCmd: 'npm run test:e2e',
    });

    rmSync(join(directory, 'package.json'));
    expect(detectTechStack(directory).techStack).toBe('generic');

    writeFileSync(join(directory, 'go.mod'), 'module x', 'utf8');
    expect(detectTechStack(directory).techStack).toBe('go');
  });

  it('writes what the gate judged into the assignment on disk', () => {
    writeTask({ techStack: 'generic' });

    const commands = resolveCommands(
      { techStack: 'generic', unitTestCmd: undefined, e2eTestCmd: undefined },
      observed(['package.json'], PACKAGE_WITH_TESTS),
    );
    expect(rewriteAssignment(directory, TASK.taskId, commands)).toBe(true);

    // The next reader — a retry, a recovery, the operator — sees what the gate judged against.
    const onDisk = readTask();
    expect(onDisk.techStack).toBe('nodejs');
    expect(onDisk.unitTestCmd).toBe('npm test');
  });

  it('rewrites nothing when the assignment already says the same thing', () => {
    writeTask({ techStack: 'nodejs', unitTestCmd: 'npm test', e2eTestCmd: 'npm run test:e2e' });

    const commands = resolveCommands(readTask(), observed(['package.json'], PACKAGE_WITH_TESTS));
    expect(rewriteAssignment(directory, TASK.taskId, commands)).toBe(false);
  });

  it('keeps the assignment’s own commands over the detection’s guess', () => {
    writeTask({ techStack: 'nodejs', unitTestCmd: 'pnpm --filter core test' });

    const commands = resolveCommands(readTask(), observed(['package.json'], PACKAGE_WITH_TESTS));

    expect(commands.fromAssignment).toBe(true);
    expect(commands.unitTestCmd).toBe('pnpm --filter core test');
  });

  it('takes the observed stack over the assignment’s label even for stated commands (D-315)', () => {
    // The eighth live gate run: intake guessed `generic` over an empty workspace, the assignment
    // stated go commands, the executor built the Go scaffold — and the stated branch still ran the
    // commands in the debian image, five freezes in a row. The image must follow the observation.
    const commands = resolveCommands(
      {
        techStack: 'generic',
        unitTestCmd: 'go build ./... && go vet ./...',
        e2eTestCmd: undefined,
      },
      observed(['go.mod']),
    );

    expect(commands.fromAssignment).toBe(true);
    expect(commands.techStack).toBe('go');
    expect(commands.unitTestCmd).toBe('go build ./... && go vet ./...');
  });

  it('keeps the assignment’s label when the observation saw nothing (generic)', () => {
    // The marker files saw nothing — the assignment may still know better than an empty listing.
    const commands = resolveCommands(
      { techStack: 'python', unitTestCmd: 'pytest', e2eTestCmd: undefined },
      observed([]),
    );

    expect(commands.techStack).toBe('python');
  });

  it('refuses, by name, when generic meets no commands at all', () => {
    const refusal = commandsRefusal(
      resolveCommands(
        { techStack: 'generic', unitTestCmd: undefined, e2eTestCmd: undefined },
        { techStack: 'generic', unitTestCmd: '', e2eTestCmd: '' },
      ),
    );

    expect(refusal).toContain('generic');
    expect(refusal).toContain('unitTestCmd');
  });

  it('does not refuse generic when the assignment names its own commands', () => {
    const refusal = commandsRefusal(
      resolveCommands(
        { techStack: 'generic', unitTestCmd: 'make test', e2eTestCmd: undefined },
        { techStack: 'generic', unitTestCmd: '', e2eTestCmd: '' },
      ),
    );

    expect(refusal).toBeNull();
  });
});

describe('the blocking protocol (task 157)', () => {
  const details = {
    taskId: TASK.taskId,
    executorId: 'executor_claude_03',
    at: '2026-08-20 03:00:00 UTC',
    problem: 'Конфликт версий библиотеки в базовом образе.',
    files: ['package.json'],
    failingCommands: ['npm install'],
    instructions: 'Поставьте libcairo2-dev или замените canvas на pureimage.',
  };

  it('renders the A0 template, headings and all', () => {
    const rendered = renderBlockedFile(details);

    expect(rendered).toContain('# BLOCKED: task_1');
    expect(rendered).toContain('## Инициатор');
    expect(rendered).toContain('## Описание проблемы');
    expect(rendered).toContain('## Затронутые файлы и тесты');
    expect(rendered).toContain('## Инструкции для разблокировки');
    expect(rendered).toContain('executor_claude_03');
    expect(rendered).toContain('`npm install`');
  });

  it('writes the file and blocks the task on disk and in the index', () => {
    writeTask();
    raiseBlock(database, directory, details);

    expect(readTask().status).toBe('BLOCKED');
    expect(
      database.prepare('SELECT status FROM tasks WHERE task_id = ?').get(TASK.taskId)?.status,
    ).toBe('BLOCKED');
  });

  it('returns the task to PENDING within a second of the file being deleted', async () => {
    writeTask();
    raiseBlock(database, directory, details);

    const unblocked: string[] = [];
    const watcher = watchBlocks(database, directory, (taskId) => unblocked.push(taskId));
    await watcher.ready;

    const started = Date.now();
    rmSync(blockedPath(directory, TASK.taskId));

    await waitFor(() => unblocked.length > 0, 5_000);
    const elapsed = Date.now() - started;

    expect(unblocked).toEqual([TASK.taskId]);
    expect(elapsed, `разблокировка заняла ${String(elapsed)} мс`).toBeLessThan(1_000);
    expect(readTask().status).toBe('PENDING');
    expect(
      database.prepare('SELECT status FROM tasks WHERE task_id = ?').get(TASK.taskId)?.status,
    ).toBe('PENDING');

    await watcher.close();
  });

  it('ignores files that are not blocking files', async () => {
    writeFileSync(join(directory, 'README.md'), 'привет', 'utf8');

    const unblocked: string[] = [];
    const watcher = watchBlocks(database, directory, (taskId) => unblocked.push(taskId));
    await watcher.ready;

    rmSync(join(directory, 'README.md'));
    await new Promise((settle) => setTimeout(settle, 300));

    expect(unblocked).toEqual([]);
    await watcher.close();
  });

  /**
   * Реестр `ensureBlockWatcher` (задача 167 — находка живого гейта): сам вотчер был построен и
   * оттестирован задачей 157, но НЕ подключён ни в одной точке продукта — файл блокировки обещал
   * «контур увидит удаление», а удаление не видел никто. Свойства под тестом: подключение через
   * реестр действительно снимает блокировку, и повторное подключение того же каталога не плодит
   * второго вотчера (dev-перезагрузка модулей).
   */
  it('ensureBlockWatcher: снятие работает через реестр, второй вызов возвращает тот же вотчер', async () => {
    writeTask();
    raiseBlock(database, directory, details);

    const unblocked: string[] = [];
    const first = ensureBlockWatcher(database, directory, (taskId) => unblocked.push(taskId));
    const second = ensureBlockWatcher(database, directory, () => undefined);
    expect(second).toBe(first);

    await first.ready;
    rmSync(blockedPath(directory, TASK.taskId));
    await waitFor(() => unblocked.length > 0, 5_000);

    expect(unblocked).toEqual([TASK.taskId]);
    expect(
      database.prepare('SELECT status FROM tasks WHERE task_id = ?').get(TASK.taskId)?.status,
    ).toBe('PENDING');

    await first.close();
    /* Каталог теста уходит вместе с afterEach — реестр не должен держать закрытый вотчер. */
    watcherRegistryForTest().delete(directory);
  });
});

/** Реестр — на globalThis; тест чистит за собой свою запись, не трогая чужие. */
function watcherRegistryForTest(): Map<string, unknown> {
  const holder = globalThis as unknown as Record<symbol, Map<string, unknown> | undefined>;
  const key = Symbol.for('spec-platform.loop.block-watchers');
  holder[key] ??= new Map();
  return holder[key];
}

describe('the executor’s report (task 157)', () => {
  /** Who the orchestrator says this report is about — the only identity that reaches the table. */
  const OWNER = { projectId: 'p1', taskId: TASK.taskId };

  const report = {
    reportId: 'r1',
    taskId: TASK.taskId,
    projectId: 'p1',
    executorId: 'executor_1',
    status: 'SUCCESS' as const,
    decisionTitle: 'Выбран pureimage вместо canvas',
    rationale: 'canvas тянет нативную сборку, которой в образе нет.',
  };

  function writeReport(value: unknown): void {
    mkdirSync(join(directory, HANDOFF.reports), { recursive: true });
    writeFileSync(
      join(directory, HANDOFF.reports, `report_${TASK.taskId}.json`),
      typeof value === 'string' ? value : JSON.stringify(value),
      'utf8',
    );
  }

  it('reads a well-formed report', () => {
    writeReport(report);
    const read = readReport(directory, TASK.taskId);

    expect(read.ok && read.report.status).toBe('SUCCESS');
  });

  it('distinguishes a missing report from an unreadable one', () => {
    expect(readReport(directory, TASK.taskId)).toEqual({ ok: false, reason: 'missing' });

    writeReport('{ это не json');
    expect(readReport(directory, TASK.taskId)).toMatchObject({ ok: false, reason: 'malformed' });

    writeReport({ reportId: 'r1' });
    const read = readReport(directory, TASK.taskId);
    expect(read.ok).toBe(false);
    expect(!read.ok && read.reason === 'malformed' && read.detail).toContain('taskId');
  });

  it('derives a decision id as lower-case MD5 hex when the report names none', () => {
    const derived = decisionId(report, OWNER);

    expect(derived).toMatch(/^[0-9a-f]{32}$/);
    // Reproducible: the same report read twice lands on the same row.
    expect(decisionId(report, OWNER)).toBe(derived);
    expect(decisionId(report, { ...OWNER, taskId: 'другая' })).not.toBe(derived);
  });

  it('prefers the identifier the report states', () => {
    expect(decisionId({ ...report, decisionId: 'd-42' }, OWNER)).toBe('d-42');
  });

  it('records the rationale, and re-recording the same report changes nothing', () => {
    const id = recordDecision(database, report, OWNER);
    recordDecision(database, report, OWNER);

    expect(id).not.toBeNull();
    expect(database.prepare('SELECT count(*) AS n FROM agent_decisions').get()?.n).toBe(1);
    expect(
      database.prepare('SELECT rationale FROM agent_decisions WHERE decision_id = ?').get(id ?? '')
        ?.rationale,
    ).toContain('нативную сборку');
  });

  it('records nothing when the executor offered no reasoning', () => {
    expect(recordDecision(database, { ...report, rationale: undefined }, OWNER)).toBeNull();
    expect(
      recordDecision(
        database,
        { ...report, decisionTitle: undefined, decisionId: undefined },
        OWNER,
      ),
    ).toBeNull();
    expect(database.prepare('SELECT count(*) AS n FROM agent_decisions').get()?.n).toBe(0);
  });

  /**
   * The live gate's own finding: a model filling in `projectId`/`taskId` writes whatever it likes,
   * both columns are foreign keys, and the insert took the whole iteration down with
   * `FOREIGN KEY constraint failed`. The report is information; the orchestrator is the authority
   * about which task it started.
   */
  it('writes the owner’s identity, whatever identity the report claims for itself', () => {
    const impostor = { ...report, taskId: 'выдуманная-задача', projectId: 'выдуманный-проект' };

    expect(disagreesAboutOwner(impostor, OWNER)).toBe(true);
    expect(disagreesAboutOwner(report, OWNER)).toBe(false);

    const id = recordDecision(database, impostor, OWNER);
    expect(id, 'no foreign key was violated, so the insert happened').not.toBeNull();

    const row = database
      .prepare('SELECT project_id, task_id FROM agent_decisions WHERE decision_id = ?')
      .get(id ?? '');

    expect(row?.task_id).toBe(OWNER.taskId);
    expect(row?.project_id).toBe(OWNER.projectId);
  });
});

async function waitFor(condition: () => boolean, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;

  while (!condition()) {
    if (Date.now() > deadline) throw new Error('условие не наступило вовремя');
    await new Promise((settle) => setTimeout(settle, 10));
  }
}
