import { Readable } from 'node:stream';

import type { CreateContainerSpec, DockerEngine } from '../engine.ts';
import { frame } from '../log-frames.ts';

/**
 * A daemon that does what the test says (tasks 159, 160).
 *
 * The container cases of M15а talk to a real Docker and must keep doing so — that is what proves the
 * adapter. What they cannot do is hold ten iterations in flight, refuse a tariff window mid-stream,
 * or stop the world at a chosen millisecond and count how long the pause took, and those are exactly
 * the claims parallelism and «красный CI» are made of. So the pipeline is proven here, against a
 * daemon whose behaviour the case dictates, and the adapter is proven there, against the real one.
 *
 * The fake is deliberately shallow: it records what it was asked to do and lets the test decide what
 * each container prints and what it exits with. `onStart` is the whole seam — it stands where the
 * container's *effects* would be, so a case that needs a report file or a source edit writes it from
 * there, in the same order a container would have.
 */

export interface FakeContainer {
  id: string;
  name: string;
  spec: CreateContainerSpec;
  started: boolean;
  paused: boolean;
  removed: boolean;
  exitCode: number;
  stdout: string[];
}

export interface StartOutcome {
  exitCode?: number;
  /** Lines the container prints on stdout, in order. */
  stdout?: string[];
  /** Held open until this resolves — a container the test wants to still be running. */
  until?: Promise<void>;
}

export interface FakeEngineOptions {
  /** Decides what a container does. Called once per start, with the name it was created under. */
  onStart?: (container: {
    name: string;
    spec: CreateContainerSpec;
  }) => StartOutcome | Promise<StartOutcome>;
}

export interface FakeEngine extends DockerEngine {
  readonly containers: FakeContainer[];
  /** Every container that carries this name, newest last — names are reused across iterations. */
  byName(name: string): FakeContainer[];
  /** Containers that exist and are paused right now. */
  pausedNames(): string[];
}

export function createFakeEngine(options: FakeEngineOptions = {}): FakeEngine {
  const containers: FakeContainer[] = [];
  let next = 0;

  const find = (id: string): FakeContainer | undefined =>
    containers.find((container) => container.id === id);

  /**
   * Two moments, not one, and the difference is what makes a *live* signal testable.
   *
   * `emitted` settles once the container has decided what it prints — the log stream opens then, as
   * a daemon's does, while the process is still running. `finished` settles when it exits. A fake
   * that had only the second would deliver a `rate_limit_event` after the iteration was over, and a
   * throttle that reacts after the fact is not a throttle.
   */
  const emitted = new Map<string, Promise<void>>();
  const finished = new Map<string, Promise<void>>();

  return {
    containers,

    byName(name) {
      return containers.filter((container) => container.name === name);
    },

    pausedNames() {
      return containers
        .filter((container) => container.paused && !container.removed)
        .map((container) => container.name);
    },

    endpoint: {
      kind: 'unix',
      socketPath: '/fake/docker.sock',
      display: 'unix:///fake/docker.sock',
    },

    ping: () => Promise.resolve(true),
    version: () => Promise.resolve({ version: 'fake', apiVersion: 'fake', os: 'linux' }),
    pullImage: () => Promise.resolve(),
    hasImage: () => Promise.resolve(true),
    buildImage: () => Promise.resolve(),

    createContainer(spec) {
      next += 1;
      const id = `fake-${String(next)}`;
      containers.push({
        id,
        name: spec.name,
        spec,
        started: false,
        paused: false,
        removed: false,
        exitCode: 0,
        stdout: [],
      });

      return Promise.resolve(id);
    },

    startContainer(id) {
      const container = find(id);
      if (container === undefined) return Promise.resolve();

      container.started = true;

      /*
       * The held promise is carried **inside** an object, not returned bare. An `async` function
       * that returns a promise flattens it, so `decided` would have waited for the hold — and the
       * two moments this fake exists to separate would have collapsed back into one.
       */
      const decided = (async (): Promise<{ until: Promise<void> | undefined }> => {
        const outcome =
          (await options.onStart?.({ name: container.name, spec: container.spec })) ?? {};

        container.stdout = outcome.stdout ?? [];
        container.exitCode = outcome.exitCode ?? 0;

        return { until: outcome.until };
      })();

      emitted.set(
        id,
        decided.then(() => undefined),
      );
      finished.set(
        id,
        decided.then(async ({ until }) => {
          if (until !== undefined) await until;
        }),
      );

      return Promise.resolve();
    },

    stopContainer(id) {
      const container = find(id);
      if (container !== undefined) container.exitCode = 137;
      return Promise.resolve();
    },

    pauseContainer(id) {
      const container = find(id);
      if (container === undefined || container.removed)
        return Promise.reject(new Error('нет такого контейнера'));

      container.paused = true;
      return Promise.resolve();
    },

    unpauseContainer(id) {
      const container = find(id);
      if (container === undefined || container.removed)
        return Promise.reject(new Error('нет такого контейнера'));

      container.paused = false;
      return Promise.resolve();
    },

    removeContainer(id) {
      const container = find(id);
      if (container !== undefined) container.removed = true;
      return Promise.resolve();
    },

    async waitContainer(id) {
      await finished.get(id);
      return find(id)?.exitCode ?? 0;
    },

    inspectContainer(id) {
      const container = find(id);

      return Promise.resolve({
        id,
        name: container?.name ?? id,
        state: {
          Status: container?.paused === true ? 'paused' : 'exited',
          Running: container?.paused ?? false,
          Paused: container?.paused ?? false,
          ExitCode: container?.exitCode ?? 0,
        },
      });
    },

    async attachLogs(id) {
      /*
       * The lines a container prints are known once `onStart` has answered, so the stream waits for
       * it — the same order the daemon gives them in, where output cannot precede the process.
       */
      await emitted.get(id);
      const container = find(id);

      return Readable.from((container?.stdout ?? []).map((line) => frame('stdout', `${line}\n`)));
    },

    findByName(name) {
      const container = [...containers]
        .reverse()
        .find((entry) => entry.name === name && !entry.removed);

      return Promise.resolve(container?.id ?? null);
    },
  };
}
