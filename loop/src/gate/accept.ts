import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { DockerEngine } from '../docker/engine.ts';
import { readLogFrames } from '../docker/log-frames.ts';
import { bindMount } from '../docker/paths.ts';
import type { HandoffTask, Measurement, TechStack } from '../intake/handoff.ts';

import { resolveCapabilityImage } from './capability-image.ts';
import {
  CONVERGENCE_PATIENCE,
  judgeConvergence,
  measurementKey,
  measurementShell,
  readLedger,
  readMeasurementOutput,
} from './measurement.ts';
import { runInCleanCopy } from './clean-run.ts';
import { runController, type ControllerVerdict } from './controller.ts';
import { observeProjectRoot } from './observe.ts';
import {
  commandsRefusal,
  detectStackFromObservation,
  resolveCommands,
  type ResolvedCommands,
} from './tech-stack.ts';

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
 *
 * **The stack is decided here too, from a container's listing of the copy — never from the host's
 * view of the workspace** (D-314; принцип А-30). The live M17а gate measured the long-lived server
 * process staying blind for ten minutes to a `go.mod` a container had written: a host-eyed
 * detection judged yesterday's world, sent a live Go project into the `debian` image, and every
 * command answered 127. The acceptance therefore observes the copy it is about to judge, with the
 * same eyes that will run the tests, at the moment of judgment — which also *is* the re-detection
 * before the verdict: there is no earlier snapshot left to trust.
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

/**
 * Исход замера, прогнанного САМОЙ приёмкой (А-44 п.1).
 *
 * Три исхода, и третий — главный: приёмка, которая физически не может проверить задачу, обязана
 * сказать это ВСЛУХ и отдать вопрос суду качества. Молчаливый проход запрещён — именно им был
 * прошлый режим, где отсутствие браузера глотал `|| true`.
 */
export type MeasurementOutcome =
  | {
      status: 'measured';
      value: number;
      /** Прошлое число ЭТОЙ ЖЕ приёмки, с которым сравнивали. Null — первый замер цепочки. */
      previous: number | null;
      converged: boolean;
      /**
       * Сошлось ИСЧЕРПАНИЕМ терпения, а не улучшением (А-51, вердикт §10.2).
       *
       * Отдельным полем, а не оттенком `converged`: «стало не хуже» и «хуже, но хватит» —
       * разные факты о работе, и цикл записывает их в книгу по-разному.
       */
      exhausted: boolean;
      image: string;
      key: string;
    }
  | { status: 'failed'; reason: string }
  | { status: 'unverifiable'; reason: string };

export interface AcceptanceVerdict {
  accepted: boolean;
  /** Why, in one sentence, for the feed and the report. */
  reason: string;
  /**
   * What the gate judged against — stack and commands, decided from the container's observation of
   * the copy (D-314). Null when the run never got that far (no copy, no observation): then nothing
   * about the project was decided at all. The cycle writes a non-null answer back into the
   * assignment, because the disk is the source of truth.
   */
  commands: ResolvedCommands | null;
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
  /** Null — задание замера не несёт; тогда о замере не сказано ничего, и это не «замер прошёл». */
  measurement: MeasurementOutcome | null;
}

export interface AcceptanceDeps {
  engine: DockerEngine;
  onLine?: (line: { stream: 'stdout' | 'stderr'; text: string }) => void;
  /** Bounds the whole acceptance run. Tests are slower than an edit; the default reflects that. */
  timeoutMs?: number;
  /**
   * Bounds one **test** command, separately from the run as a whole (task 174; А-26 §3).
   *
   * The M16а gate met the case this exists for: an executor wrote a test that never finishes, and
   * the acceptance spent its whole fifteen-minute ceiling discovering that. «Тест, который не
   * заканчивается» is a recognisable class with a recognisable price, so it gets its own, much
   * closer limit and its own named reason — while the fifteen-minute ceiling stays where it was,
   * as the back stop for everything else the acceptance does.
   */
  testTimeoutMs?: number;
  /** Overridable so a test can point at an image it already has. */
  images?: Partial<Record<TechStack, string>>;
}

export const ACCEPTANCE_TIMEOUT_MS = 15 * 60_000;

/** Five minutes for one test command. A suite that is still running past this is not finishing. */
export const ACCEPTANCE_TEST_TIMEOUT_MS = 5 * 60_000;

/** `delivery-gate-${taskId}` — distinct from the executor's name, so neither can find the other. */
export function acceptanceContainerName(taskId: string): string {
  return `delivery-gate-${taskId}`;
}

/**
 * Accepts or refuses one task.
 *
 * Order: copy first, then the container's observation of the copy — stack and commands are decided
 * from that observation, so even «nothing to run» is a verdict of container eyes, never of the
 * host's (D-314). Then the tests, then the artifact walks. Tests before artifacts because a red
 * suite makes the artifacts irrelevant, and because a container that has already failed should not
 * be asked twenty more questions.
 */
export async function acceptTask(
  task: HandoffTask,
  workspacePath: string,
  deps: AcceptanceDeps,
): Promise<AcceptanceVerdict> {
  /* The copy and the observation need no stack — the stack is their *result*, not their input. */
  const neutralImage = deps.images?.generic ?? ACCEPTANCE_IMAGES.generic;
  const copyPath = mkdtempSync(join(tmpdir(), 'loop-gate-'));
  const name = acceptanceContainerName(task.taskId);
  const output: string[] = [];

  try {
    /*
     * The copy. `handoff/` comes with it — an artifact walk may legitimately look at a report — but
     * nothing goes back: the source is mounted read-only, this directory is deleted at the end, and
     * the executor's workspace is never written to by the gate.
     */
    const copied = await copyWorkspace(neutralImage, workspacePath, copyPath, `${name}-copy`, deps);

    if (!copied.ok) {
      return {
        accepted: false,
        reason: `Копия кодовой базы для приёмки не сделана: ${copied.reason}`,
        commands: null,
        unitExitCode: null,
        e2eExitCode: null,
        artifacts: [],
        output: copied.output,
        controller: null,
        returnedByController: false,
        measurement: null,
      };
    }

    /*
     * What is this project — asked of the copy, from inside a container (D-314). A failed
     * observation refuses the run by its own name: guessing the stack when the observer is blind
     * would put the verdict back on the host's eyes, which is the defect this step buries.
     */
    const observed = await observeProjectRoot(
      deps.engine,
      neutralImage,
      copyPath,
      `${name}-observe`,
      deps,
    );

    if (!observed.ok) {
      return {
        accepted: false,
        reason: `Наблюдение копии контейнером не удалось: ${observed.reason} — приёмка не судила.`,
        commands: null,
        unitExitCode: null,
        e2eExitCode: null,
        artifacts: [],
        output: '',
        controller: null,
        returnedByController: false,
        measurement: null,
      };
    }

    const commands = resolveCommands(task, detectStackFromObservation(observed));
    /*
     * Задача с замером — задаче с командой ровня: приёмке ЕСТЬ что запускать, и запускает она это
     * сама (А-44 п.1). Прежде замер был склеен интейком в `unitTestCmd` и поэтому проходил здесь
     * как обычная команда; теперь он лежит на задании частями, и отказ «нечего запускать» обязан
     * знать о нём, иначе полировка отвергалась бы за отсутствие того, что ей и не положено.
     */
    const refusal = commandsRefusal(commands, task.measurement !== undefined);
    if (refusal !== null) {
      return {
        accepted: false,
        reason: refusal,
        commands,
        unitExitCode: null,
        e2eExitCode: null,
        artifacts: [],
        output: '',
        controller: null,
        returnedByController: false,
        measurement: null,
      };
    }

    const image = deps.images?.[commands.techStack] ?? ACCEPTANCE_IMAGES[commands.techStack];

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
        commands,
        unitExitCode: null,
        e2eExitCode: null,
        artifacts: [],
        output: controller.findings
          .map((finding) => `$ ${finding.label}\n${finding.output}`)
          .join('\n\n'),
        controller,
        returnedByController: true,
        measurement: null,
      };
    }

    /*
     * The test command's own limit, under the run's ceiling (task 174). `Math.min` is what keeps
     * the fifteen minutes a *back stop*: an operator who configures the test limit above it has
     * not moved the ceiling, and the reason below names whichever bound actually applied.
     */
    const testBudgetMs = Math.min(
      deps.testTimeoutMs ?? ACCEPTANCE_TEST_TIMEOUT_MS,
      deps.timeoutMs ?? ACCEPTANCE_TIMEOUT_MS,
    );

    for (const [label, command] of [
      ['unit', commands.unitTestCmd],
      ['e2e', commands.e2eTestCmd],
    ] as const) {
      if (command === '') continue;

      const run = await runInCleanCopy(deps.engine, image, copyPath, `${name}-${label}`, command, {
        ...deps,
        timeoutMs: testBudgetMs,
      });
      output.push(`$ ${command}\n${run.output}`);

      if (run.exitCode !== 0) {
        return {
          accepted: false,
          reason:
            run.exitCode === null
              ? `Тесты не завершились: «${command}» остановлен по пределу ${String(Math.round(testBudgetMs / 1000))} с — задача не принята.`
              : `Приёмочный прогон «${command}» в чистом контейнере вернул ${String(run.exitCode)} — задача не принята.`,
          commands,
          unitExitCode: label === 'unit' ? run.exitCode : null,
          e2eExitCode: label === 'e2e' ? run.exitCode : null,
          artifacts: [],
          output: output.join('\n\n'),
          controller,
          returnedByController: false,
          measurement: null,
        };
      }
    }

    const artifacts = await walkArtifacts(task, image, copyPath, name, deps);
    const failed = artifacts.filter((artifact) => !artifact.present || !artifact.matched);

    if (failed.length > 0) {
      return {
        accepted: false,
        reason: `Артефакты не подтвердились: ${failed.map((artifact) => artifact.path).join(', ')}.`,
        commands,
        unitExitCode: 0,
        e2eExitCode: 0,
        artifacts,
        output: output.join('\n\n'),
        controller,
        returnedByController: false,
        measurement: null,
      };
    }

    /*
     * **Замер — последним, и прогоняет его приёмка** (А-44 п.1).
     *
     * После тестов и артефактов, потому что замер дороже их всех вместе (браузер, страницы,
     * сравнение картинок), и платить за него над красной кодовой базой незачем.
     */
    const measurement = await measure(task, workspacePath, {
      engine: deps.engine,
      copyPath,
      name,
      image,
      timeoutMs: Math.min(deps.timeoutMs ?? ACCEPTANCE_TIMEOUT_MS, MEASUREMENT_TIMEOUT_MS),
      ...(deps.onLine === undefined ? {} : { onLine: deps.onLine }),
    });

    if (measurement !== null) {
      output.push(describeMeasurement(measurement));
      deps.onLine?.({ stream: 'stdout', text: describeMeasurement(measurement) });
    }

    /* Не прогнавшийся замер краснеет, а не молчит; выросшее расхождение — тоже вердикт. */
    if (measurement?.status === 'failed') {
      return {
        accepted: false,
        reason: `Замер приёмки не состоялся: ${measurement.reason} — задача не принята.`,
        commands,
        unitExitCode: 0,
        e2eExitCode: 0,
        artifacts,
        output: output.join('\n\n'),
        controller,
        returnedByController: false,
        measurement,
      };
    }

    if (measurement?.status === 'measured' && !measurement.converged) {
      return {
        accepted: false,
        reason:
          `Замер приёмки: ${String(measurement.value)} против прошлого своего ` +
          `${String(measurement.previous ?? 0)} — расхождение выросло, задача не принята.`,
        commands,
        unitExitCode: 0,
        e2eExitCode: 0,
        artifacts,
        output: output.join('\n\n'),
        controller,
        returnedByController: false,
        measurement,
      };
    }

    return {
      accepted: true,
      reason:
        'Чистый контейнер: тесты зелёные, артефакты подтверждены. Задача принята независимым перепрогоном.' +
        (measurement === null ? '' : ` ${describeMeasurement(measurement)}`),
      commands,
      unitExitCode: 0,
      e2eExitCode: 0,
      artifacts,
      output: output.join('\n\n'),
      controller,
      returnedByController: false,
      measurement,
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
 * Своя граница у замера: браузер поднимается и обходит страницы дольше, чем идёт тест (задача 174 —
 * тот же приём, только в другую сторону). Потолок приёмки остаётся задним упором.
 */
export const MEASUREMENT_TIMEOUT_MS = 10 * 60_000;

/**
 * Замер задачи вместе с чтением книги контура (А-51 п.1).
 *
 * **Книга читается ДО контейнера, и нечитаемая книга краснеет здесь же.** Прежде порча книги
 * молча давала «прошлого числа нет» → «первый замер цепочки» → проход. Это и есть тихий проход,
 * который А-44 запретил, — просто добытый не через отчёт, а через бухгалтерию. Испорченная книга
 * не даёт судить о сходимости ничего, а значит и принять по сходимости нельзя.
 *
 * Платить за контейнер замера при этом незачем: книга уже не даст сравнить число ни с чем.
 */
async function measure(
  task: HandoffTask,
  workspacePath: string,
  args: {
    engine: DockerEngine;
    copyPath: string;
    name: string;
    image: string;
    timeoutMs: number;
    onLine?: AcceptanceDeps['onLine'];
  },
): Promise<MeasurementOutcome | null> {
  if (task.measurement === undefined) return null;

  const ledger = readLedger(workspacePath);
  if (ledger.status === 'unreadable') {
    return {
      status: 'failed',
      reason:
        `${ledger.reason} — сходимость сравнивать не с чем, и «не с чем» здесь означает ` +
        'потерянное прошлое, а не начало цепочки. Почините или снесите книгу явным решением.',
    };
  }

  const key = measurementKey(task.measurement);

  return runMeasurement(task.measurement, {
    engine: args.engine,
    copyPath: args.copyPath,
    name: args.name,
    image: args.image,
    taskId: task.taskId,
    previous: ledger.ledger.measured[key]?.value,
    stalls: ledger.ledger.stalls[key]?.count ?? 0,
    timeoutMs: args.timeoutMs,
    ...(args.onLine === undefined ? {} : { onLine: args.onLine }),
  });
}

/**
 * Прогон замера приёмкой — от образа до числа (А-44 п.1).
 *
 * Порядок шагов и есть довод независимости: сперва образ, УМЕЮЩИЙ то, что задача требует измерить;
 * потом контейнер, который сносит чужой отчёт и пишет свой; потом число, прочитанное из вывода
 * этого же контейнера. Ни на одном шаге приёмка не берёт на веру ничего из того, что оставил
 * исполнитель.
 */
async function runMeasurement(
  measurement: Measurement,
  args: {
    engine: DockerEngine;
    copyPath: string;
    name: string;
    /** Образ стека — им и обойдётся замер, которому ничего особенного не нужно. */
    image: string;
    taskId: string;
    previous: number | undefined;
    /** Сколько заходов подряд этот замер уже не улучшался — предохранитель §10.2. */
    stalls: number;
    timeoutMs: number;
    onLine?: AcceptanceDeps['onLine'];
  },
): Promise<MeasurementOutcome> {
  const capability = await resolveCapabilityImage(
    args.engine,
    measurement.capability,
    args.image,
    (message) => {
      args.onLine?.({ stream: 'stdout', text: message });
    },
  );

  /*
   * Приёмка физически не может — и говорит это ВСЛУХ (А-44 п.1). Не «принято», не «отвергнуто»:
   * вопрос уходит суду качества с названной причиной. Молчаливый проход здесь и был тем режимом,
   * который прошлый прогон прожил трижды.
   */
  if (!capability.ok) {
    return {
      status: 'unverifiable',
      reason: `не проверяемо приёмкой: ${capability.reason} (замер требует «${measurement.capability}»)`,
    };
  }

  const run = await runInCleanCopy(
    args.engine,
    capability.image,
    args.copyPath,
    `${args.name}-measure`,
    measurementShell(measurement),
    { timeoutMs: args.timeoutMs, ...(args.onLine === undefined ? {} : { onLine: args.onLine }) },
  );

  const reading = readMeasurementOutput(run.output, run.exitCode, measurement);
  if (reading.status === 'failed') return { status: 'failed', reason: reading.reason };

  const previous = args.previous ?? null;
  const convergence = judgeConvergence(previous, reading.value, args.stalls);

  if (convergence.reason !== null) {
    args.onLine?.({ stream: 'stdout', text: convergence.reason });
  }

  return {
    status: 'measured',
    value: reading.value,
    previous,
    converged: convergence.converged,
    exhausted: convergence.exhausted,
    image: capability.image,
    key: measurementKey(measurement),
  };
}

/** Что о замере говорится в ленте и в вердикте — одной строкой, одинаково для обоих читателей. */
export function describeMeasurement(outcome: MeasurementOutcome): string {
  if (outcome.status === 'unverifiable') {
    return `Замер НЕ ПРОВЕРЯЛСЯ приёмкой — ${outcome.reason}; вопрос уходит суду качества.`;
  }
  if (outcome.status === 'failed') {
    return `Замер приёмки не состоялся: ${outcome.reason}.`;
  }

  const against =
    outcome.previous === null
      ? 'первый замер этой цепочки — сравнивать не с чем'
      : `прошлый свой ${String(outcome.previous)}`;

  const convergence = outcome.exhausted
    ? `РАСХОЖДЕНИЕ ВЫРОСЛО, но терпение цепочки исчерпано (${String(CONVERGENCE_PATIENCE)} захода ` +
      'подряд без улучшения) — сходимость засчитана исчерпанием, задача принята'
    : outcome.converged
      ? 'Расхождение не выросло'
      : 'РАСХОЖДЕНИЕ ВЫРОСЛО';

  return (
    `Замер приёмки (образ ${outcome.image}): ${String(outcome.value)}, ${against}. ` +
    `${convergence}. ` +
    'Само число — публикуемая метрика, воротами оно не бывает.'
  );
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
