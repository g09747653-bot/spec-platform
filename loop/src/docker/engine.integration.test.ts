import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createDockerEngine, type DockerEngine } from './engine.ts';
import { readLogFrames } from './log-frames.ts';
import { bindMount } from './paths.ts';
import { resolveEndpoint } from './transport.ts';

/**
 * The Docker adapter against a real daemon (task 154 AC-1).
 *
 * Everything else about the adapter is provable on plain objects; this is not. That a container
 * created through this code starts, sees the workspace the loop mounted, writes into it, and can be
 * frozen, thawed, stopped and removed by these calls is a claim about Docker — and a bind mount
 * whose source path is subtly wrong produces an *empty directory* rather than an error, so the only
 * way to know the translation works is to read the file back on the host afterwards.
 *
 * **On CI this suite must run.** A daemon that cannot be reached there is a broken runner, and a
 * suite that quietly skipped itself would report green for code nothing executed. On a developer
 * machine with Docker Desktop stopped it skips, by name, with the reason printed.
 */

const IMAGE = 'alpine:3.20';
const ENDPOINT = resolveEndpoint(process.platform);

/* eslint-disable-next-line no-restricted-properties -- CI is the runner telling us where we are */
const ON_CI = process.env.CI === 'true' || process.env.CI === '1';

/**
 * Whether a daemon looks present, decided while the file is being collected.
 *
 * `describe.skipIf` runs before `beforeAll`, so the skip decision cannot wait for `ping()`. On Linux
 * the socket is a filesystem entry and its absence is a reliable "no daemon"; on Windows the pipe is
 * not something `stat` can see, so the suite registers and `ping()` decides. **On CI it never
 * skips** — an unreachable daemon there fails `beforeAll`, which is a red suite rather than a silent
 * one.
 */
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
const created: string[] = [];

beforeAll(async () => {
  engine = createDockerEngine(ENDPOINT);
  reachable = await engine.ping();

  if (!reachable) {
    const reason = `Docker не отвечает на ${ENDPOINT.display} — интеграционные кейсы адаптера пропущены.`;

    // CI has no excuse: an unreachable daemon there is a broken runner, not a local convenience.
    if (ON_CI) throw new Error(reason);
    console.warn(reason);
    return;
  }

  workspace = mkdtempSync(join(tmpdir(), 'loop-docker-'));
  if (!(await engine.hasImage(IMAGE))) await engine.pullImage(IMAGE);
}, 20 * 60_000);

afterAll(async () => {
  for (const id of created) {
    try {
      await engine.removeContainer(id, { force: true });
    } catch {
      // A container the case already removed is not a cleanup failure.
    }
  }

  if (workspace !== undefined) rmSync(workspace, { recursive: true, force: true });
});

describe.skipIf(!DAEMON_LOOKS_PRESENT)('the Docker adapter against a live daemon', () => {
  it('reports the daemon it is talking to', async () => {
    if (!reachable) return;

    const version = await engine.version();

    expect(version.apiVersion).toMatch(/^\d+\.\d+$/);
    // The engine is always Linux, even when the host is Windows: Docker Desktop runs it in WSL2,
    // which is exactly why the path translation exists.
    expect(version.os).toBe('linux');
  });

  it('creates, starts, writes through the mounted workspace, stops and removes', async () => {
    if (!reachable) return;

    const name = `loop-test-lifecycle-${String(Date.now())}`;
    const id = await engine.createContainer({
      name,
      image: IMAGE,
      cmd: ['sh', '-c', 'echo "написано контейнером" > /workspace/written.txt; echo готово'],
      binds: [bindMount(workspace ?? '', '/workspace')],
      workingDir: '/workspace',
    });
    created.push(id);

    // The loop indexes the daemon by name; a container it cannot find by name is one it cannot
    // freeze when the CI goes red (M16а).
    expect(await engine.findByName(name)).toBe(id);

    await engine.startContainer(id);
    expect(await engine.waitContainer(id)).toBe(0);

    // The whole point of the translation: the file the container wrote is on the host.
    expect(readFileSync(join(workspace ?? '', 'written.txt'), 'utf8').trim()).toBe(
      'написано контейнером',
    );

    await engine.removeContainer(id);
    expect(await engine.findByName(name)).toBeNull();
    created.splice(created.indexOf(id), 1);
  });

  it('freezes and thaws a running container by name, without killing it', async () => {
    if (!reachable) return;

    const name = `loop-test-pause-${String(Date.now())}`;
    const id = await engine.createContainer({
      name,
      image: IMAGE,
      cmd: ['sh', '-c', 'i=0; while [ $i -lt 600 ]; do echo tick $i; sleep 1; i=$((i+1)); done'],
    });
    created.push(id);

    await engine.startContainer(id);
    await engine.pauseContainer(id);
    expect((await engine.inspectContainer(id)).state.Paused).toBe(true);

    await engine.unpauseContainer(id);
    const thawed = await engine.inspectContainer(id);
    expect(thawed.state.Paused).toBe(false);
    // Thawed, not restarted: the work it had done is still its work.
    expect(thawed.state.Running).toBe(true);

    await engine.stopContainer(id, 1);
    expect((await engine.inspectContainer(id)).state.Running).toBe(false);
  });

  it('streams stdout and stderr apart, in order', async () => {
    if (!reachable) return;

    const name = `loop-test-logs-${String(Date.now())}`;
    const id = await engine.createContainer({
      name,
      image: IMAGE,
      cmd: ['sh', '-c', 'echo первая; echo ошибка 1>&2; echo вторая'],
    });
    created.push(id);

    await engine.startContainer(id);
    await engine.waitContainer(id);

    const lines = [];
    for await (const line of readLogFrames(await engine.attachLogs(id, { follow: false }))) {
      lines.push(line);
    }

    expect(lines.filter((line) => line.stream === 'stdout').map((line) => line.text)).toEqual([
      'первая',
      'вторая',
    ]);
    expect(lines.filter((line) => line.stream === 'stderr').map((line) => line.text)).toEqual([
      'ошибка',
    ]);
  });

  it('refuses a container name that is already taken, rather than adopting the other one', async () => {
    if (!reachable) return;

    const name = `loop-test-conflict-${String(Date.now())}`;
    const first = await engine.createContainer({ name, image: IMAGE, cmd: ['true'] });
    created.push(first);

    await expect(engine.createContainer({ name, image: IMAGE, cmd: ['true'] })).rejects.toThrow(
      /409|conflict|already in use/i,
    );
  });
});
