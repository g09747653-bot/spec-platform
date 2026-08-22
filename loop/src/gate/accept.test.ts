import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  createFakeEngine,
  type FakeEngine,
  type StartOutcome,
} from '../docker/testing/fake-engine.ts';
import { HandoffTask } from '../intake/handoff.ts';

import { acceptTask, ACCEPTANCE_TEST_TIMEOUT_MS } from './accept.ts';

/**
 * The acceptance's own machinery against the fake daemon: its time limits (task 174; А-26 §3) and
 * — after D-314 — the seam its stack detection stands on.
 *
 * The seam claim matters most: **the gate consults the container's listing of the copy, never the
 * host's view of the workspace.** The measured defect (a long-lived host process staying blind to
 * container-written marker files) cannot be reproduced in a test, so the test proves the seam
 * instead: a listing the host disagrees with must still decide the verdict's stack. The live proof
 * is the eighth gate run.
 */

const TASK = HandoffTask.parse({
  taskId: 'task_hang',
  milestoneId: 'ms_01',
  title: 'Задача с висящими тестами',
  description: 'Сделать',
  techStack: 'nodejs',
  /* No files of its own, so the controller's scoped checks skip and no style container runs. */
  filesToEdit: [],
  expectedArtifacts: [],
  status: 'IN_PROGRESS',
  /* Stated commands: the stack detection still observes, but the assignment's commands win. */
  unitTestCmd: 'npm test',
});

/** The observer's answer for a copy that is a Node project with a test script. */
const NODE_LISTING: StartOutcome = {
  exitCode: 0,
  stdout: ['./package.json', '__LOOP_OBSERVE_MANIFEST__', '{"scripts":{"test":"npm test"}}'],
};

let workspace: string;

beforeEach(() => {
  workspace = mkdtempSync(join(tmpdir(), 'loop-accept-'));
});

afterEach(() => {
  try {
    rmSync(workspace, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  } catch {
    // Cleanup is not an assertion.
  }
});

/** A daemon whose test container never exits; everything else finishes at once. */
function hangingTests(): FakeEngine {
  return createFakeEngine({
    onStart: ({ name }) => {
      if (name.endsWith('-observe')) return NODE_LISTING;
      return name.endsWith('-unit') || name.endsWith('-e2e')
        ? { stdout: ['тест пошёл и не вернулся'], until: new Promise<void>(() => undefined) }
        : { exitCode: 0 };
    },
  });
}

describe('the test command’s own limit (task 174)', () => {
  it('defaults to five minutes, under the fifteen-minute ceiling', () => {
    expect(ACCEPTANCE_TEST_TIMEOUT_MS).toBe(300_000);
  });

  it('goes red by name when the tests never finish — without waiting out the run’s ceiling', async () => {
    const verdict = await acceptTask(TASK, workspace, {
      engine: hangingTests(),
      /* Milliseconds instead of minutes, so the case proves the bound rather than serving it. */
      testTimeoutMs: 1_000,
      timeoutMs: 600_000,
    });

    expect(verdict.accepted).toBe(false);
    expect(verdict.returnedByController).toBe(false);
    // The named reason of А-26 §3 — «тест, который не заканчивается» is its own class of red.
    expect(verdict.reason).toContain('Тесты не завершились');
    expect(verdict.reason).toContain('npm test');
    expect(verdict.reason).toContain('1 с');
    expect(verdict.unitExitCode).toBeNull();
  });

  it('keeps the run’s ceiling as the back stop: a test limit above it does not move it', async () => {
    const verdict = await acceptTask(TASK, workspace, {
      engine: hangingTests(),
      testTimeoutMs: 600_000,
      timeoutMs: 1_000,
    });

    expect(verdict.accepted).toBe(false);
    expect(verdict.reason).toContain('Тесты не завершились');
    expect(verdict.reason).toContain('1 с');
  });

  it('accepts a suite that finishes green under the same deps', async () => {
    const engine = createFakeEngine({
      onStart: ({ name }) =>
        name.endsWith('-observe') ? NODE_LISTING : { exitCode: 0, stdout: ['всё зелёное'] },
    });

    const verdict = await acceptTask(TASK, workspace, {
      engine,
      testTimeoutMs: 1_000,
      timeoutMs: 600_000,
    });

    expect(verdict.accepted).toBe(true);
    expect(verdict.unitExitCode).toBe(0);
  });
});

describe('the stack is the container’s listing, never the host’s view (D-314)', () => {
  const bare = HandoffTask.parse({
    taskId: 'task_eyes',
    milestoneId: 'ms_01',
    title: 'Задача без собственных команд',
    description: 'Сделать',
    techStack: 'generic',
    filesToEdit: [],
    expectedArtifacts: [],
    status: 'IN_PROGRESS',
  });

  it('judges by the listing: a go.mod the host directory does not hold still picks the go image', async () => {
    /* The host-side workspace is EMPTY — a host-eyed detection would answer `generic` and refuse.
       The container's listing answers `go.mod`, and the listing must win. */
    const engine = createFakeEngine({
      onStart: ({ name }) =>
        name.endsWith('-observe')
          ? { exitCode: 0, stdout: ['./go.mod', '__LOOP_OBSERVE_MANIFEST__'] }
          : { exitCode: 0, stdout: ['ok'] },
    });

    const verdict = await acceptTask(bare, workspace, { engine, testTimeoutMs: 1_000 });

    expect(verdict.accepted).toBe(true);
    expect(verdict.commands).toMatchObject({ techStack: 'go', unitTestCmd: 'go test ./...' });

    const unit = engine.containers.find((container) => container.name.endsWith('-unit'));
    expect(unit?.spec.image).toBe('golang:1.23-bookworm');
    expect(unit?.spec.cmd?.[2]).toBe('go test ./...');
  });

  it('refuses by name when the observation itself fails — no host fallback', async () => {
    const engine = createFakeEngine({
      onStart: ({ name }) => (name.endsWith('-observe') ? { exitCode: 3 } : { exitCode: 0 }),
    });

    const verdict = await acceptTask(bare, workspace, { engine });

    expect(verdict.accepted).toBe(false);
    expect(verdict.commands).toBeNull();
    expect(verdict.reason).toContain('Наблюдение копии контейнером не удалось');
    /* Nothing was judged: no test container ever started. */
    expect(engine.containers.some((container) => container.name.endsWith('-unit'))).toBe(false);
  });

  it('runs stated commands in the observed stack’s image — the eighth run’s death, replayed (D-315)', async () => {
    /* The assignment: intake's honest `generic` guess plus stated go commands — exactly task 1 of
       the eighth live run. The copy holds a Go scaffold; the observation must pick the go image,
       or the stated command answers 127 about the debian image instead of the code. */
    const statedGo = HandoffTask.parse({
      taskId: 'task_run8',
      milestoneId: 'ms_01',
      title: 'Инициализировать Go-модуль',
      description: 'Сделать',
      techStack: 'generic',
      filesToEdit: [],
      expectedArtifacts: [],
      status: 'IN_PROGRESS',
      unitTestCmd: 'go build ./... && go vet ./...',
    });

    const engine = createFakeEngine({
      onStart: ({ name }) =>
        name.endsWith('-observe')
          ? { exitCode: 0, stdout: ['./go.mod', './cmd', '__LOOP_OBSERVE_MANIFEST__'] }
          : { exitCode: 0, stdout: ['ok'] },
    });

    const verdict = await acceptTask(statedGo, workspace, { engine, testTimeoutMs: 1_000 });

    expect(verdict.accepted).toBe(true);
    expect(verdict.commands).toMatchObject({ techStack: 'go', fromAssignment: true });

    const unit = engine.containers.find((container) => container.name.endsWith('-unit'));
    expect(unit?.spec.image).toBe('golang:1.23-bookworm');
    expect(unit?.spec.cmd?.[2]).toBe('go build ./... && go vet ./...');
  });

  it('an empty listing meets no stated commands — the named «нечего запускать» refusal', async () => {
    const engine = createFakeEngine({
      onStart: ({ name }) =>
        name.endsWith('-observe')
          ? { exitCode: 0, stdout: ['__LOOP_OBSERVE_MANIFEST__'] }
          : { exitCode: 0 },
    });

    const verdict = await acceptTask(bare, workspace, { engine });

    expect(verdict.accepted).toBe(false);
    expect(verdict.commands).toMatchObject({ techStack: 'generic' });
    expect(verdict.reason).toContain('generic');
    expect(verdict.reason).toContain('unitTestCmd');
  });
});
