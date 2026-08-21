import { Readable } from 'node:stream';

import { describe, expect, it } from 'vitest';

import type { ContainerState, CreateContainerSpec, DockerEngine } from '../docker/engine.ts';
import type { LogLevel } from '../events/bus.ts';

import { claudeCommand, EXECUTOR_TOOLS } from './claude-command.ts';
import { EXECUTOR_DOCKERFILE, EXECUTOR_IMAGE, CLAUDE_CODE_VERSION } from './image.ts';
import {
  executorContainerName,
  executorEnvironment,
  ITERATION_TIMEOUT_MS,
  runExecutor,
  type ExecutorRequest,
} from './run.ts';

/**
 * The executor wrapper's own rules (task 155).
 *
 * What a container is *given* and what happens when it does not finish are decisions of this
 * module, not of Docker — so they are asserted against a fake daemon. The claims that are about
 * Docker (a mount that really carries files, an environment really absent inside) live in the
 * container suite beside this one.
 */

interface Recorded {
  created: CreateContainerSpec[];
  started: string[];
  stopped: { id: string; timeout: number }[];
  removed: string[];
}

function fakeEngine(behaviour: {
  exitCode?: number;
  /** Never settles, so the deadline is the only way out — the hung executor. */
  hangs?: boolean;
  logLines?: string[];
}): { engine: DockerEngine; recorded: Recorded } {
  const recorded: Recorded = { created: [], started: [], stopped: [], removed: [] };

  const engine: DockerEngine = {
    endpoint: { kind: 'unix', socketPath: '/tmp/fake.sock', display: 'unix:///tmp/fake.sock' },
    ping: () => Promise.resolve(true),
    version: () => Promise.resolve({ version: '0', apiVersion: '1.44', os: 'linux' }),
    pullImage: () => Promise.resolve(),
    hasImage: () => Promise.resolve(true),
    buildImage: () => Promise.resolve(),
    createContainer: (spec) => {
      recorded.created.push(spec);
      return Promise.resolve('container-1');
    },
    startContainer: (id) => {
      recorded.started.push(id);
      return Promise.resolve();
    },
    stopContainer: (id, timeout = 10) => {
      recorded.stopped.push({ id, timeout });
      return Promise.resolve();
    },
    pauseContainer: () => Promise.resolve(),
    unpauseContainer: () => Promise.resolve(),
    removeContainer: (id) => {
      recorded.removed.push(id);
      return Promise.resolve();
    },
    waitContainer: (_id, signal) =>
      behaviour.hangs === true
        ? new Promise((_settle, fail) => {
            signal?.addEventListener('abort', () => {
              fail(new Error('aborted'));
            });
          })
        : Promise.resolve(behaviour.exitCode ?? 0),
    inspectContainer: (id) =>
      Promise.resolve({
        id,
        name: 'delivery-executor-task_1',
        state: {
          Status: 'exited',
          Running: false,
          Paused: false,
          ExitCode: behaviour.exitCode ?? 0,
        } satisfies ContainerState,
      }),
    attachLogs: () => {
      const frames = (behaviour.logLines ?? []).map((text) => {
        const payload = Buffer.from(`${text}\n`, 'utf8');
        const header = Buffer.alloc(8);
        header[0] = 1;
        header.writeUInt32BE(payload.length, 4);
        return Buffer.concat([header, payload]);
      });
      return Promise.resolve(Readable.from(frames));
    },
    findByName: () => Promise.resolve(null),
  };

  return { engine, recorded };
}

const REQUEST = {
  taskId: 'task_1',
  projectId: 'proj_1',
  workspacePath: 'C:\\Users\\Owner\\workspace\\proj_1',
  taskFile: '/workspace/handoff/tasks/task_task_1.json',
  credential: { kind: 'ANTHROPIC_API_KEY', value: 'sk-ant-not-a-real-key' },
} satisfies ExecutorRequest;

describe('what the executor container is given (task 155)', () => {
  it('receives a named list of variables — never the loop’s environment', () => {
    const environment = executorEnvironment(REQUEST);

    expect(Object.keys(environment).toSorted()).toEqual([
      'ANTHROPIC_API_KEY',
      'HOME',
      'LOOP_PROJECT_ID',
      'LOOP_TASK_FILE',
      'LOOP_TASK_ID',
    ]);
    expect(environment.ANTHROPIC_API_KEY).toBe(REQUEST.credential.value);
  });

  it('carries the subscription token under its own name, and no API key beside it', () => {
    const environment = executorEnvironment({
      ...REQUEST,
      credential: { kind: 'CLAUDE_CODE_OAUTH_TOKEN', value: 'sk-ant-oat01-not-a-real-token' },
    });

    expect(environment.CLAUDE_CODE_OAUTH_TOKEN).toBe('sk-ant-oat01-not-a-real-token');
    // The precedence trap: an API key beside it would win, and the plan would never be billed.
    expect(environment.ANTHROPIC_API_KEY).toBeUndefined();
  });

  it('mounts the workspace with the host path translated', async () => {
    const { engine, recorded } = fakeEngine({});

    await runExecutor(REQUEST, { engine, onLine: () => undefined });

    expect(recorded.created[0]?.binds).toEqual(['/c/Users/Owner/workspace/proj_1:/workspace:rw']);
    expect(recorded.created[0]?.workingDir).toBe('/workspace');
    expect(recorded.created[0]?.image).toBe(EXECUTOR_IMAGE);
  });

  it('builds the image when the machine has none, instead of failing on «no such image»', async () => {
    const { engine } = fakeEngine({});
    let built = 0;
    const missing: DockerEngine = {
      ...engine,
      hasImage: () => Promise.resolve(false),
      buildImage: () => {
        built += 1;
        return Promise.resolve();
      },
    };

    await runExecutor(REQUEST, { engine: missing, onLine: () => undefined });

    expect(built).toBe(1);
  });

  it('does not rebuild an image that is already there', async () => {
    const { engine } = fakeEngine({});
    let built = 0;

    await runExecutor(REQUEST, {
      engine: {
        ...engine,
        buildImage: () => {
          built += 1;
          return Promise.resolve();
        },
      },
      onLine: () => undefined,
    });

    expect(built).toBe(0);
  });

  it('names the container the way the red-CI freeze will look for it', async () => {
    const { engine, recorded } = fakeEngine({});

    await runExecutor(REQUEST, { engine, onLine: () => undefined });

    expect(executorContainerName('task_1')).toBe('delivery-executor-task_1');
    expect(recorded.created[0]?.name).toBe('delivery-executor-task_1');
  });

  it('runs Claude Code headless when no command is supplied', async () => {
    const { engine, recorded } = fakeEngine({});

    await runExecutor(REQUEST, { engine, onLine: () => undefined });

    expect(recorded.created[0]?.cmd).toEqual(
      claudeCommand({ taskFile: REQUEST.taskFile, taskId: REQUEST.taskId, credentialKind: 'ANTHROPIC_API_KEY' }),
    );
  });

  it('runs a scripted assignment verbatim when one is supplied', async () => {
    const { engine, recorded } = fakeEngine({});

    await runExecutor(
      { ...REQUEST, command: ['sh', '-c', 'echo сделано'] },
      { engine, onLine: () => undefined },
    );

    expect(recorded.created[0]?.cmd).toEqual(['sh', '-c', 'echo сделано']);
  });
});

describe('how an iteration ends (task 155)', () => {
  /**
   * 900 s — 3× the p90 of the 26 live iterations the M16а gate measured (task 174; А-26 §2).
   *
   * The five-minute value killed three honest iterations out of twenty-six; the ceiling is a back
   * stop for a run that is stuck, not a working limit for a run that is thinking. Anyone moving
   * this number moves a measured decision — bring new data.
   */
  it('defaults the iteration ceiling to 900 seconds of working time', () => {
    expect(ITERATION_TIMEOUT_MS).toBe(900_000);
  });

  it('is SUCCESS when the container exits zero', async () => {
    const { engine } = fakeEngine({ exitCode: 0 });

    const run = await runExecutor(REQUEST, { engine, onLine: () => undefined });

    expect(run.outcome).toBe('SUCCESS');
    expect(run.exitCode).toBe(0);
  });

  it('is FAILED when the container exits non-zero', async () => {
    const { engine } = fakeEngine({ exitCode: 2 });

    const run = await runExecutor(REQUEST, { engine, onLine: () => undefined });

    expect(run.outcome).toBe('FAILED');
    expect(run.exitCode).toBe(2);
  });

  it('is TIMEOUT when the deadline arrives first, and the container is killed', async () => {
    const { engine, recorded } = fakeEngine({ hangs: true });
    const said: string[] = [];

    const run = await runExecutor(REQUEST, {
      engine,
      timeoutMs: 40,
      onLine: (line) => said.push(line.text),
    });

    expect(run.outcome).toBe('TIMEOUT');
    expect(run.exitCode).toBeNull();
    // `t: 0` is a kill: a process that stopped making progress will not honour a graceful stop.
    expect(recorded.stopped).toEqual([{ id: 'container-1', timeout: 0 }]);
    expect(said.join('\n')).toContain('не уложился');
  });

  /**
   * The ceiling measures **work**, not calendar time (task 160; найдено репетицией гейта 163).
   *
   * A red verdict pauses a container on purpose, to keep the work it is holding. Counting those
   * minutes against its five throws that work away — and the rehearsal watched it happen twice, each
   * timeout then freezing the pipeline again over a failure the first freeze had caused.
   */
  it('does not spend the iteration ceiling on time the pipeline was frozen', async () => {
    const { engine } = fakeEngine({ hangs: true });

    /* Frozen from the moment it starts: the deadline never advances, so nothing times out. */
    const frozenFrom = Date.now();
    const run = await Promise.race([
      runExecutor(REQUEST, {
        engine,
        timeoutMs: 40,
        frozenMs: () => Date.now() - frozenFrom,
        onLine: () => undefined,
      }),
      new Promise<'still-running'>((settle) => {
        setTimeout(() => {
          settle('still-running');
        }, 400);
      }),
    ]);

    expect(run, 'a paused container keeps the ceiling it had when it was paused').toBe(
      'still-running',
    );
  });

  it('removes the container whatever the outcome, so a rerun is not blocked by its own name', async () => {
    for (const behaviour of [{ exitCode: 0 }, { exitCode: 1 }, { hangs: true }]) {
      const { engine, recorded } = fakeEngine(behaviour);

      await runExecutor(REQUEST, { engine, timeoutMs: 40, onLine: () => undefined });

      expect(recorded.removed).toEqual(['container-1']);
    }
  });

  it('streams the container’s output line by line, marking stderr', async () => {
    const { engine } = fakeEngine({ logLines: ['сборка началась', 'тесты зелёные'] });
    const lines: { text: string; level: LogLevel }[] = [];

    await runExecutor(REQUEST, {
      engine,
      onLine: (line) => lines.push({ text: line.text, level: line.level }),
    });

    expect(lines.map((line) => line.text)).toEqual(['сборка началась', 'тесты зелёные']);
    expect(lines.every((line) => line.level === 'INFO')).toBe(true);
  });
});

describe('the Claude Code command (task 155)', () => {
  const command = claudeCommand({
    taskFile: '/workspace/handoff/tasks/task_7.json',
    taskId: 'task_7',
    credentialKind: 'ANTHROPIC_API_KEY',
  });

  it('runs headless, in bare mode, and never waits for a person', () => {
    expect(command[0]).toBe('claude');
    expect(command).toContain('--bare');
    expect(command).toContain('-p');
    expect(command).toContain('--permission-mode');
    expect(command).toContain('acceptEdits');
    expect(command).toContain('--allowedTools');
    expect(command).toContain(EXECUTOR_TOOLS.join(','));
  });

  it('asks for the streaming format together with the flag it requires', () => {
    // `stream-json` without `--verbose` is documented as invalid; the pair travels together.
    const at = command.indexOf('--output-format');
    expect(command[at + 1]).toBe('stream-json');
    expect(command).toContain('--verbose');
  });

  it('bounds the agentic loop from the inside as well as from the clock', () => {
    const at = command.indexOf('--max-turns');
    expect(at).toBeGreaterThan(-1);
    expect(Number(command[at + 1])).toBeGreaterThan(0);
  });

  it('points at the assignment rather than inlining it', () => {
    const prompt = command[command.indexOf('-p') + 1] ?? '';

    expect(prompt).toContain('/workspace/handoff/tasks/task_7.json');
    expect(prompt).toContain('BLOCKED');
    expect(prompt).toContain('handoff/reports/');
  });

  it('carries a model only when one was asked for', () => {
    const base = { taskFile: '/t.json', taskId: 'task_7', credentialKind: 'ANTHROPIC_API_KEY' } as const;

    expect(claudeCommand(base)).not.toContain('--model');
    expect(claudeCommand({ ...base, model: 'sonnet' })).toContain('sonnet');
  });

  it('does not use the flags the A0 bundle guessed at — they do not exist', () => {
    expect(command).not.toContain('--yes');
    expect(command.join(' ')).not.toContain('CI=true');
  });
});

describe('isolation follows the credential, because bare mode cannot read a token (А-23)', () => {
  const subscription = claudeCommand({
    taskFile: '/workspace/handoff/tasks/task_7.json',
    taskId: 'task_7',
    credentialKind: 'CLAUDE_CODE_OAUTH_TOKEN',
  });

  it('never asks for bare mode with a subscription token — measured: it refuses to log in', () => {
    expect(subscription).not.toContain('--bare');
  });

  it('closes the settings channel instead: no source loaded means no hooks and no CLAUDE.md', () => {
    const at = subscription.indexOf('--setting-sources');

    expect(at).toBeGreaterThan(-1);
    // The empty value is the point — «load none of user, project, local», in the CLI's own words.
    expect(subscription[at + 1]).toBe('');
  });

  it('closes MCP by a second, independent mechanism', () => {
    expect(subscription).toContain('--strict-mcp-config');
  });

  it('changes nothing else: the same prompt, tools, bounds and format on both paths', () => {
    const apiKey = claudeCommand({
      taskFile: '/workspace/handoff/tasks/task_7.json',
      taskId: 'task_7',
      credentialKind: 'ANTHROPIC_API_KEY',
    });

    const withoutIsolation = (command: string[]) =>
      command.filter(
        (argument, index) =>
          !['--bare', '--strict-mcp-config', '--setting-sources'].includes(argument) &&
          command[index - 1] !== '--setting-sources',
      );

    expect(withoutIsolation(subscription)).toEqual(withoutIsolation(apiKey));
  });
});

describe('the executor image (task 155)', () => {
  it('pins the CLI version rather than taking whatever is latest', () => {
    expect(EXECUTOR_DOCKERFILE).toContain(`@anthropic-ai/claude-code@${CLAUDE_CODE_VERSION}`);
    expect(EXECUTOR_DOCKERFILE).not.toMatch(/claude-code@latest/);
  });

  it('ships no code of its own — the workspace arrives by mount', () => {
    expect(EXECUTOR_DOCKERFILE).toContain('WORKDIR /workspace');
    expect(EXECUTOR_DOCKERFILE).not.toContain('COPY');
  });
});
