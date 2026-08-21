import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createFakeEngine, type FakeEngine } from '../docker/testing/fake-engine.ts';
import { HandoffTask } from '../intake/handoff.ts';
import type { ResolvedCommands } from './tech-stack.ts';

import { acceptTask, ACCEPTANCE_TEST_TIMEOUT_MS } from './accept.ts';

/**
 * The acceptance's own time limits (task 174; А-26 §3).
 *
 * Against the fake daemon, because the claim is about *this module's* clock: a test command that
 * never finishes must go red under its own five-minute limit and its own name, not under the
 * fifteen-minute ceiling of the whole run. The M16а gate paid the full ceiling once to learn the
 * difference — task 17's executor wrote a test that never ends, and the acceptance sat on it for
 * fifteen minutes before saying anything.
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
});

const COMMANDS: ResolvedCommands = {
  techStack: 'nodejs',
  unitTestCmd: 'npm test',
  e2eTestCmd: '',
  fromAssignment: true,
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
    onStart: ({ name }) =>
      name.endsWith('-unit') || name.endsWith('-e2e')
        ? { stdout: ['тест пошёл и не вернулся'], until: new Promise<void>(() => undefined) }
        : { exitCode: 0 },
  });
}

describe('the test command’s own limit (task 174)', () => {
  it('defaults to five minutes, under the fifteen-minute ceiling', () => {
    expect(ACCEPTANCE_TEST_TIMEOUT_MS).toBe(300_000);
  });

  it('goes red by name when the tests never finish — without waiting out the run’s ceiling', async () => {
    const verdict = await acceptTask(TASK, COMMANDS, workspace, {
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
    const verdict = await acceptTask(TASK, COMMANDS, workspace, {
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
      onStart: () => ({ exitCode: 0, stdout: ['всё зелёное'] }),
    });

    const verdict = await acceptTask(TASK, COMMANDS, workspace, {
      engine,
      testTimeoutMs: 1_000,
      timeoutMs: 600_000,
    });

    expect(verdict.accepted).toBe(true);
    expect(verdict.unitExitCode).toBe(0);
  });
});
