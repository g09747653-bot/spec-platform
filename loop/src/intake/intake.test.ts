import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
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
