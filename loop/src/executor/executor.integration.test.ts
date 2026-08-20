import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createDockerEngine, type DockerEngine } from '../docker/engine.ts';
import { resolveEndpoint } from '../docker/transport.ts';

import { ensureExecutorImage, EXECUTOR_IMAGE } from './image.ts';
import { runExecutor } from './run.ts';

/**
 * The executor wrapper against a real daemon (task 155 AC).
 *
 * Three claims, none of them provable against a double:
 *
 * 1. a scripted assignment runs to completion **without one interactive wait** and its edit lands on
 *    the host through the mount;
 * 2. a hung process is killed at the deadline and the iteration is reported as a failure;
 * 3. the loop's `.env` is **not inside the container** — read back from inside, because "we did not
 *    pass it" is a claim about our code and "it is not there" is a claim about the container.
 *
 * The image is the real executor image, built by the loop itself: the gate depends on that build
 * working, and an image somebody has to `docker build` by hand is a step nobody was told about.
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
let workspace: string | undefined;

const REQUEST = {
  taskId: 'itest_1',
  projectId: 'proj_itest',
  taskFile: '/workspace/handoff/tasks/task_itest_1.json',
  anthropicApiKey: 'not-a-real-key-and-never-used-here',
};

beforeAll(async () => {
  engine = createDockerEngine(ENDPOINT);
  reachable = await engine.ping();

  if (!reachable) {
    const reason = `Docker не отвечает на ${ENDPOINT.display} — контейнерные кейсы исполнителя пропущены.`;
    if (ON_CI) throw new Error(reason);
    console.warn(reason);
    return;
  }

  workspace = mkdtempSync(join(tmpdir(), 'loop-exec-'));
  mkdirSync(join(workspace, 'handoff', 'tasks'), { recursive: true });
  writeFileSync(
    join(workspace, 'handoff', 'tasks', 'task_itest_1.json'),
    JSON.stringify({ taskId: 'itest_1', title: 'Скриптовое задание' }, null, 2),
    'utf8',
  );

  await ensureExecutorImage(engine);
}, 40 * 60_000);

afterAll(async () => {
  if (reachable) {
    const leftover = await engine.findByName('delivery-executor-itest_1');
    if (leftover !== null) await engine.removeContainer(leftover, { force: true });
  }

  if (workspace !== undefined) {
    try {
      rmSync(workspace, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    } catch {
      // Cleanup is not an assertion.
    }
  }
});

describe.skipIf(!DAEMON_LOOKS_PRESENT)('the executor wrapper in a container (task 155)', () => {
  it('builds the executor image, with the CLI actually in it', async () => {
    if (!reachable) return;

    expect(await engine.hasImage(EXECUTOR_IMAGE)).toBe(true);

    const lines: string[] = [];
    const run = await runExecutor(
      { ...REQUEST, workspacePath: workspace ?? '', command: ['claude', '--version'] },
      { engine, onLine: (line) => lines.push(line.text) },
    );

    expect(run.outcome).toBe('SUCCESS');
    // The version the Dockerfile pinned, printed by the binary that is actually installed.
    expect(lines.join('\n')).toMatch(/\d+\.\d+\.\d+/);
  }, 120_000);

  it('runs a scripted assignment through to a file on the host, with no interactive wait', async () => {
    if (!reachable) return;

    const lines: string[] = [];
    const run = await runExecutor(
      {
        ...REQUEST,
        workspacePath: workspace ?? '',
        command: [
          'sh',
          '-c',
          'cat "$LOOP_TASK_FILE" > /dev/null && echo "задание прочитано" && ' +
            'printf "готово\\n" > /workspace/RESULT.txt',
        ],
      },
      { engine, onLine: (line) => lines.push(line.text) },
    );

    expect(run.outcome).toBe('SUCCESS');
    expect(run.exitCode).toBe(0);
    expect(lines.join('\n')).toContain('задание прочитано');

    // The edit is on the host — which is the only way to know the mount and the translation worked.
    expect(readFileSync(join(workspace ?? '', 'RESULT.txt'), 'utf8').trim()).toBe('готово');
  }, 120_000);

  it('kills a hung iteration at the deadline and reports it as a timeout', async () => {
    if (!reachable) return;

    // Ten minutes of sleeping is the shape of a stuck executor; the deadline is shortened so the
    // case proves the mechanism rather than the number.
    const started = Date.now();
    const run = await runExecutor(
      { ...REQUEST, workspacePath: workspace ?? '', command: ['sleep', '600'] },
      { engine, onLine: () => undefined, timeoutMs: 5_000 },
    );

    expect(run.outcome).toBe('TIMEOUT');
    expect(Date.now() - started).toBeLessThan(60_000);
    // And nothing of it is left behind holding its own name.
    expect(await engine.findByName('delivery-executor-itest_1')).toBeNull();
  }, 120_000);

  it('has none of the loop’s environment inside it, read back from inside the container', async () => {
    if (!reachable) return;

    const lines: string[] = [];
    const run = await runExecutor(
      {
        ...REQUEST,
        workspacePath: workspace ?? '',
        // `env` from inside, plus a search of every mounted path for a `.env` file.
        command: [
          'sh',
          '-c',
          'echo "--- env ---"; env | cut -d= -f1 | sort; ' +
            'echo "--- dotenv ---"; find / -maxdepth 4 -name ".env" -not -path "/proc/*" 2>/dev/null; ' +
            'echo "--- end ---"',
        ],
      },
      { engine, onLine: (line) => lines.push(line.text) },
    );

    expect(run.outcome).toBe('SUCCESS');
    const output = lines.join('\n');

    // The named list, and the container's own inevitable few (PATH, HOSTNAME, NODE_VERSION…).
    expect(output).toContain('ANTHROPIC_API_KEY');
    expect(output).toContain('LOOP_TASK_ID');

    // Nothing of the loop's own configuration, and no `.env` anywhere the container can see.
    for (const leaked of [
      'LOOP_DB_PATH',
      'WORKSPACE_ROOT_PATH',
      'TELEGRAM_BOT_TOKEN',
      'GOOGLE_GENERATIVE_AI_API_KEY',
      'DATABASE_URL',
      'AUTH_SECRET',
    ]) {
      expect(output, `${leaked} попала в контейнер`).not.toContain(leaked);
    }

    const dotenvSection = output.slice(
      output.indexOf('--- dotenv ---'),
      output.indexOf('--- end ---'),
    );
    expect(dotenvSection.replace('--- dotenv ---', '').trim()).toBe('');
  }, 120_000);

  it('reports a non-zero exit as FAILED rather than as an error of its own', async () => {
    if (!reachable) return;

    const run = await runExecutor(
      { ...REQUEST, workspacePath: workspace ?? '', command: ['sh', '-c', 'exit 3'] },
      { engine, onLine: () => undefined },
    );

    expect(run.outcome).toBe('FAILED');
    expect(run.exitCode).toBe(3);
  }, 120_000);
});
