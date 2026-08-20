import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { DockerEngine } from '../docker/engine.ts';
import { readLogFrames } from '../docker/log-frames.ts';
import { bindMount } from '../docker/paths.ts';
import type { HandoffTask, TechStack } from '../intake/handoff.ts';

import { runInCleanCopy } from './clean-run.ts';
import { runController, type ControllerVerdict } from './controller.ts';
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
 *
 * **The copy is made by a container, not by `fs.cpSync`, and that is a measured decision.** The
 * executor installs dependencies inside its Linux container, and npm writes `node_modules/.bin/*`
 * as POSIX symlinks straight through the bind mount. Copying those from Windows means asking
 * Windows to *create* symlinks, which is privileged — and `fs.cpSync` does not report that as an
 * error: it terminates the process with `STATUS_STACK_BUFFER_OVERRUN` (0xC0000409), taking the whole
 * orchestrator with it, with nothing in the log. The live gate walk found exactly this: the executor
 * finished, the acceptance started, and the loop's server vanished mid-sentence.
 *
 * Measured, in this order: `cpSync` — process killed, no exception, no `exit` event; async
 * `fs.promises.cp` — a catchable `EPERM` on the first symlink; a `filter` that skips symlinks —
 * clean, but it drops `.bin`, and a project whose test script is a locally installed binary would
 * then fail acceptance for a reason that has nothing to do with its code.
 *
 * So the copy is made where those symlinks were made: `cp -a` inside a container, both sides
 * bind-mounted, source read-only. No host-side recursive copy of a `node_modules` tree, no Windows
 * symlink privilege in the picture, and the copy is faithful enough that the tests run against what
 * the executor actually produced.
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
  /**
   * The style pass, and whether it sent the task back before a single test ran (task 161).
   *
   * `returnedByController` is **not** a refusal: the code was never judged. The cycle turns it into
   * a task returned to its executor, which is a different outcome from a red verdict — see
   * `run-cycle.ts`.
   */
  controller: ControllerVerdict | null;
  returnedByController: boolean;
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
      controller: null,
      returnedByController: false,
    };
  }

  const image = deps.images?.[commands.techStack] ?? ACCEPTANCE_IMAGES[commands.techStack];
  const copyPath = mkdtempSync(join(tmpdir(), 'loop-gate-'));
  const name = acceptanceContainerName(task.taskId);
  const output: string[] = [];

  try {
    /*
     * The copy. `handoff/` comes with it — an artifact walk may legitimately look at a report — but
     * nothing goes back: the source is mounted read-only, this directory is deleted at the end, and
     * the executor's workspace is never written to by the gate.
     */
    const copied = await copyWorkspace(image, workspacePath, copyPath, `${name}-copy`, deps);

    if (!copied.ok) {
      return {
        accepted: false,
        reason: `Копия кодовой базы для приёмки не сделана: ${copied.reason}`,
        unitExitCode: null,
        e2eExitCode: null,
        artifacts: [],
        output: copied.output,
        controller: null,
        returnedByController: false,
      };
    }

    /*
     * **The controller, before a single test** (task 161). It shares this copy rather than making
     * its own: the copy is the expensive part, and a style pass that paid for a second one would
     * cost more than the suite it is trying to save.
     */
    const controller = await runController(
      commands.techStack,
      copyPath,
      image,
      `${name}-style`,
      deps,
      task.filesToEdit,
    );

    deps.onLine?.({ stream: 'stdout', text: controller.reason });

    if (!controller.clean) {
      return {
        accepted: false,
        reason: controller.reason,
        unitExitCode: null,
        e2eExitCode: null,
        artifacts: [],
        output: controller.findings
          .map((finding) => `$ ${finding.label}\n${finding.output}`)
          .join('\n\n'),
        controller,
        returnedByController: true,
      };
    }

    for (const [label, command] of [
      ['unit', commands.unitTestCmd],
      ['e2e', commands.e2eTestCmd],
    ] as const) {
      if (command === '') continue;

      const run = await runInCleanCopy(
        deps.engine,
        image,
        copyPath,
        `${name}-${label}`,
        command,
        deps,
      );
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
          controller,
          returnedByController: false,
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
        controller,
        returnedByController: false,
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
      controller,
      returnedByController: false,
    };
  } finally {
    try {
      rmSync(copyPath, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    } catch {
      // A copy the operating system will reclaim is not a failed acceptance.
    }
  }
}

/**
 * Copies the workspace into `copyPath` from inside a container.
 *
 * `cp -a /src/. /dst/` — the trailing `/.` is what makes it copy *contents* rather than the
 * directory itself, and `-a` is what preserves the symlinks that made the host-side copy fatal.
 * The source is mounted read-only so a copy step can never be the thing that altered the work it
 * was copying.
 */
async function copyWorkspace(
  image: string,
  workspacePath: string,
  copyPath: string,
  name: string,
  deps: AcceptanceDeps,
): Promise<{ ok: boolean; reason: string; output: string }> {
  const stale = await deps.engine.findByName(name);
  if (stale !== null) await deps.engine.removeContainer(stale, { force: true });

  const id = await deps.engine.createContainer({
    name,
    image,
    cmd: ['sh', '-lc', 'cp -a /src/. /dst/'],
    binds: [bindMount(workspacePath, '/src', 'ro'), bindMount(copyPath, '/dst')],
    workingDir: '/dst',
    env: {},
    /* A copy has nothing to fetch; the network is simply not part of what it needs. */
    networkDisabled: true,
  });

  const collected: string[] = [];

  try {
    await deps.engine.startContainer(id);

    const draining = (async () => {
      try {
        for await (const line of readLogFrames(
          await deps.engine.attachLogs(id, { follow: true }),
        )) {
          collected.push(line.text);
        }
      } catch {
        // The tail of a copy's log is not the verdict.
      }
    })();

    const exitCode = await deps.engine.waitContainer(id).catch(() => null);
    await draining;

    return exitCode === 0
      ? { ok: true, reason: '', output: collected.join('\n') }
      : {
          ok: false,
          reason: `контейнер копирования вернул ${String(exitCode)}`,
          output: collected.join('\n'),
        };
  } finally {
    await deps.engine.removeContainer(id, { force: true }).catch(() => undefined);
  }
}

/**
 * What an absent artifact says, printed by the container that looked for it.
 *
 * A sentinel rather than an exit code alone: a validation command is free to exit with any number
 * it likes, and reading one of those as «the file was missing» would report the wrong failure.
 */
const ABSENT = '__LOOP_ARTIFACT_ABSENT__';

/**
 * Every `expectedArtifacts` entry, validated from the workspace root of the clean copy.
 *
 * **Presence is decided inside the container, not on the host.** It used to be an `existsSync` here,
 * and that reads the workspace through the host's eyes while everything being judged happens through
 * the container's. On Windows the two disagree in a way that matters: a relative symlink written by a
 * container — `node_modules/.bin/*`, on every Node project that ever installed a dependency — is
 * visible to `lstat` and `readlink` but cannot be *followed*, so `existsSync` answers `false` and
 * `statSync` throws `EACCES` for a file the container opens without trouble. The gate would then
 * refuse a task for an artifact that is present, which is a verdict about the host's filesystem
 * rather than about the work.
 */
async function walkArtifacts(
  task: HandoffTask,
  image: string,
  copyPath: string,
  name: string,
  deps: AcceptanceDeps,
): Promise<ArtifactWalkResult[]> {
  const results: ArtifactWalkResult[] = [];

  for (const [index, artifact] of task.expectedArtifacts.entries()) {
    const run = await runInCleanCopy(
      deps.engine,
      image,
      copyPath,
      `${name}-artifact-${String(index)}`,
      shellFor(artifact),
      deps,
    );

    const present = !run.output.includes(ABSENT);

    results.push({
      path: artifact.path,
      present,
      exitCode: present ? run.exitCode : null,
      matched: present && new RegExp(artifact.successRegex, 'u').test(run.output),
      output: present ? run.output : 'файла нет в рабочей директории',
    });
  }

  return results;
}

/**
 * The presence test and the validation command, in one shell line.
 *
 * `-e` or `-L`, because a symlink whose target is missing is still an artifact that exists — and
 * saying «no such file» about a broken link would describe the wrong defect to whoever reads it.
 * Everything is quoted so a path with a space survives the shell.
 */
function shellFor(artifact: ExpectedArtifact): string {
  const quote = (value: string) => `'${value.replaceAll("'", String.raw`'\''`)}'`;
  const path = quote(artifact.path);
  const command = [artifact.validationCmd, ...artifact.validationArgs].map(quote).join(' ');

  return `if [ ! -e ${path} ] && [ ! -L ${path} ]; then printf '%s\\n' '${ABSENT}'; exit 66; fi; ${command}`;
}
