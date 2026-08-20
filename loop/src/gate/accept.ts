import { cpSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { DockerEngine } from '../docker/engine.ts';
import { readLogFrames } from '../docker/log-frames.ts';
import { bindMount } from '../docker/paths.ts';
import type { HandoffTask, TechStack } from '../intake/handoff.ts';

import { commandsRefusal, type ResolvedCommands } from './tech-stack.ts';

/** One entry of `expectedArtifacts`, as the assignment carries it. */
export type ExpectedArtifact = HandoffTask['expectedArtifacts'][number];

/**
 * The acceptance gate (task 157; бандл A0 §Двухфазная верификация).
 *
 * **A fresh, clean container decides — nothing else.** The executor's report says what it believes;
 * this runs the tests again, from a copy of the code, in a container that has never met the
 * executor. The distinction is the whole point of two-phase verification: an executor that broke
 * something and then reported success is a case the loop must survive, and the only way to survive
 * it is to not ask.
 *
 * **A copy of the codebase, not the workspace itself.** Mounting the live workspace would let the
 * acceptance run write into the executor's work — an install, a build directory, a lockfile touch —
 * and the next task would then start from a workspace the gate had altered. It also means a hung
 * acceptance container cannot corrupt anything: it is holding a copy.
 */

/** The image the acceptance run uses per stack. `generic` needs the assignment's own commands. */
export const ACCEPTANCE_IMAGES: Record<TechStack, string> = {
  nodejs: 'node:24-bookworm-slim',
  python: 'python:3.12-slim',
  go: 'golang:1.23-bookworm',
  rust: 'rust:1-slim-bookworm',
  generic: 'debian:bookworm-slim',
};

export interface ArtifactWalkResult {
  path: string;
  /** The artifact is on disk at all. A validation of a file that is not there proves nothing. */
  present: boolean;
  exitCode: number | null;
  matched: boolean;
  output: string;
}

export interface AcceptanceVerdict {
  accepted: boolean;
  /** Why, in one sentence, for the feed and the report. */
  reason: string;
  unitExitCode: number | null;
  e2eExitCode: number | null;
  artifacts: ArtifactWalkResult[];
  output: string;
}

export interface AcceptanceDeps {
  engine: DockerEngine;
  onLine?: (line: { stream: 'stdout' | 'stderr'; text: string }) => void;
  /** Bounds the whole acceptance run. Tests are slower than an edit; the default reflects that. */
  timeoutMs?: number;
  /** Overridable so a test can point at an image it already has. */
  images?: Partial<Record<TechStack, string>>;
}

export const ACCEPTANCE_TIMEOUT_MS = 15 * 60_000;

/** `delivery-gate-${taskId}` — distinct from the executor's name, so neither can find the other. */
export function acceptanceContainerName(taskId: string): string {
  return `delivery-gate-${taskId}`;
}

/**
 * Runs one command in the clean container and returns everything it said.
 *
 * `stdout` and `stderr` are concatenated, in arrival order, because `successRegex` is specified to
 * match against both (бандл A0 §Artifact Walks) — a build tool that reports success on stderr is
 * common enough that splitting them would make the contract wrong for half of them.
 */
async function runInClean(
  engine: DockerEngine,
  image: string,
  copyPath: string,
  name: string,
  command: string,
  deps: AcceptanceDeps,
): Promise<{ exitCode: number | null; output: string }> {
  const stale = await engine.findByName(name);
  if (stale !== null) await engine.removeContainer(stale, { force: true });

  const id = await engine.createContainer({
    name,
    image,
    cmd: ['sh', '-lc', command],
    binds: [bindMount(copyPath, '/workspace')],
    workingDir: '/workspace',
    /*
     * No environment at all beyond what the image ships. The acceptance run is not the executor: it
     * has no assignment to read and no key to spend, and a gate that could reach a paid API is a
     * gate whose verdict costs money to obtain.
     */
    env: {},
  });

  const collected: string[] = [];

  try {
    await engine.startContainer(id);

    const draining = (async () => {
      try {
        for await (const line of readLogFrames(await engine.attachLogs(id, { follow: true }))) {
          collected.push(line.text);
          deps.onLine?.({ stream: line.stream, text: line.text });
        }
      } catch {
        // A stream that ends abruptly costs the tail of a log, not the verdict.
      }
    })();

    const abort = new AbortController();
    const timer = setTimeout(() => {
      abort.abort();
    }, deps.timeoutMs ?? ACCEPTANCE_TIMEOUT_MS);
    timer.unref();

    let exitCode: number | null;
    try {
      exitCode = await engine.waitContainer(id, abort.signal);
    } catch {
      await engine.stopContainer(id, 0).catch(() => undefined);
      exitCode = null;
    } finally {
      clearTimeout(timer);
    }

    await draining;
    return { exitCode, output: collected.join('\n') };
  } finally {
    await engine.removeContainer(id, { force: true }).catch(() => undefined);
  }
}

/**
 * Accepts or refuses one task.
 *
 * Order: the refusal that needs no container first (nothing to run), then the tests, then the
 * artifact walks. Tests before artifacts because a red suite makes the artifacts irrelevant, and
 * because a container that has already failed should not be asked twenty more questions.
 */
export async function acceptTask(
  task: HandoffTask,
  commands: ResolvedCommands,
  workspacePath: string,
  deps: AcceptanceDeps,
): Promise<AcceptanceVerdict> {
  const refusal = commandsRefusal(commands);
  if (refusal !== null) {
    return {
      accepted: false,
      reason: refusal,
      unitExitCode: null,
      e2eExitCode: null,
      artifacts: [],
      output: '',
    };
  }

  const image = deps.images?.[commands.techStack] ?? ACCEPTANCE_IMAGES[commands.techStack];
  const copyPath = mkdtempSync(join(tmpdir(), 'loop-gate-'));
  const name = acceptanceContainerName(task.taskId);
  const output: string[] = [];

  try {
    /*
     * The copy. `handoff/` comes with it — an artifact walk may legitimately look at a report — but
     * nothing goes back: this directory is deleted at the end and the executor's workspace is never
     * written to by the gate.
     */
    cpSync(workspacePath, copyPath, { recursive: true });

    for (const [label, command] of [
      ['unit', commands.unitTestCmd],
      ['e2e', commands.e2eTestCmd],
    ] as const) {
      if (command === '') continue;

      const run = await runInClean(deps.engine, image, copyPath, `${name}-${label}`, command, deps);
      output.push(`$ ${command}\n${run.output}`);

      if (run.exitCode !== 0) {
        return {
          accepted: false,
          reason:
            run.exitCode === null
              ? `Приёмочный прогон «${command}» не уложился в отведённое время — задача не принята.`
              : `Приёмочный прогон «${command}» в чистом контейнере вернул ${String(run.exitCode)} — задача не принята.`,
          unitExitCode: label === 'unit' ? run.exitCode : null,
          e2eExitCode: label === 'e2e' ? run.exitCode : null,
          artifacts: [],
          output: output.join('\n\n'),
        };
      }
    }

    const artifacts = await walkArtifacts(task, image, copyPath, name, deps);
    const failed = artifacts.filter((artifact) => !artifact.present || !artifact.matched);

    if (failed.length > 0) {
      return {
        accepted: false,
        reason: `Артефакты не подтвердились: ${failed.map((artifact) => artifact.path).join(', ')}.`,
        unitExitCode: 0,
        e2eExitCode: 0,
        artifacts,
        output: output.join('\n\n'),
      };
    }

    return {
      accepted: true,
      reason:
        'Чистый контейнер: тесты зелёные, артефакты подтверждены. Задача принята независимым перепрогоном.',
      unitExitCode: 0,
      e2eExitCode: 0,
      artifacts,
      output: output.join('\n\n'),
    };
  } finally {
    try {
      rmSync(copyPath, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    } catch {
      // A copy the operating system will reclaim is not a failed acceptance.
    }
  }
}

/** Every `expectedArtifacts` entry, validated from the workspace root of the clean copy. */
async function walkArtifacts(
  task: HandoffTask,
  image: string,
  copyPath: string,
  name: string,
  deps: AcceptanceDeps,
): Promise<ArtifactWalkResult[]> {
  const results: ArtifactWalkResult[] = [];

  for (const [index, artifact] of task.expectedArtifacts.entries()) {
    const present = existsSync(join(copyPath, artifact.path));

    if (!present) {
      results.push({
        path: artifact.path,
        present: false,
        exitCode: null,
        matched: false,
        output: 'файла нет в рабочей директории',
      });
      continue;
    }

    const run = await runInClean(
      deps.engine,
      image,
      copyPath,
      `${name}-artifact-${String(index)}`,
      shellFor(artifact),
      deps,
    );

    results.push({
      path: artifact.path,
      present: true,
      exitCode: run.exitCode,
      matched: new RegExp(artifact.successRegex, 'u').test(run.output),
      output: run.output,
    });
  }

  return results;
}

/** The validation command with its arguments, quoted so a path with a space survives the shell. */
function shellFor(artifact: ExpectedArtifact): string {
  const quote = (value: string) => `'${value.replaceAll("'", String.raw`'\''`)}'`;
  return [artifact.validationCmd, ...artifact.validationArgs].map(quote).join(' ');
}
