import type { DockerEngine } from '../docker/engine.ts';
import { readLogFrames } from '../docker/log-frames.ts';
import { bindMount } from '../docker/paths.ts';
import type { LogLevel } from '../events/bus.ts';

import { claudeCommand } from './claude-command.ts';
import type { ExecutorCredential } from './credential.ts';
import { ensureExecutorImage, EXECUTOR_IMAGE } from './image.ts';
import { describeUsage, foldStreamLine, type ExecutorUsage } from './stream-json.ts';

/**
 * Running one executor iteration in a container (task 155).
 *
 * The wrapper owns four things the executor itself cannot be trusted with: what it can see (one
 * bind-mounted workspace), what it is given (a named list of environment entries, never the loop's
 * `.env`), how long it may run (a wall clock the container cannot argue with), and where its output
 * goes (the log feed, line by line, while it runs rather than after it finishes).
 *
 * **The container is named `delivery-executor-${taskId}`**, which is how M16а's «red CI» finds and
 * freezes it. The name is therefore not decoration and not derived twice: it is one function here.
 */

export type ExecutorOutcome = 'SUCCESS' | 'FAILED' | 'TIMEOUT';

export interface ExecutorRun {
  outcome: ExecutorOutcome;
  exitCode: number | null;
  /** Wall clock of the container, for the feed and for the report. */
  durationMs: number;
  containerName: string;
  /**
   * What the iteration cost, as the CLI itself reported it (turns, tokens, rate-limit window).
   *
   * Empty for a scripted executor, which has no stream to read — and empty is the honest value:
   * a rehearsal costs nothing on the plan.
   */
  usage: ExecutorUsage;
}

export interface ExecutorRequest {
  taskId: string;
  projectId: string;
  /** The project's directory on the host — mounted at `/workspace`. */
  workspacePath: string;
  /** The assignment's path **inside** the container, e.g. `/workspace/handoff/tasks/task_1.json`. */
  taskFile: string;
  /**
   * What the container runs. Absent means the real thing — Claude Code, headless.
   *
   * Present for the scripted assignment the container tests use: the same wrapper, the same mount,
   * the same timeout and the same log path, with a shell script where the model would be. That is
   * what lets the wrapper be proven end to end without a live model call (the platform's NFR-012
   * discipline, carried over).
   */
  command?: readonly string[];
  /** The one credential — API key or subscription token — handed over as a single entry. */
  credential: ExecutorCredential;
  model?: string | undefined;
  maxTurns?: number;
}

export interface ExecutorDeps {
  engine: DockerEngine;
  /** Where a line of the container's output goes. Called for every line, as it arrives. */
  onLine: (line: { stream: 'stdout' | 'stderr'; text: string; level: LogLevel }) => void;
  /**
   * The plan's budget signal, the moment the CLI emits it (task 159; А-24 §2).
   *
   * Reported **while the container runs** rather than folded into `usage` and read afterwards,
   * because that is the difference between throttling and describing a throttle: the orchestrator
   * has to stop starting new containers now, not once this one finishes. Called on every change of
   * the reported status, never on repetitions of the same one.
   */
  onRateLimit?: (signal: {
    status?: string | undefined;
    window?: string | undefined;
    resetsAt?: number | undefined;
  }) => void;
  /** Overridable so the timeout case does not spend five minutes proving itself. */
  timeoutMs?: number;
  /** Injected so tests can measure without waiting. Defaults to the wall clock. */
  now?: () => number;
  /**
   * Milliseconds the pipeline has spent frozen, read whenever the deadline is checked (task 160).
   *
   * **The iteration ceiling measures work, not calendar time.** A container paused by a red verdict
   * is holding its work on purpose; killing it for the minutes it spent paused would throw away
   * exactly what pausing was for — and the gate rehearsal watched it happen twice, each timeout then
   * freezing the pipeline again over a failure the first freeze had caused.
   */
  frozenMs?: () => number;
}

/**
 * Fifteen minutes — a back stop, not a working limit (task 174; А-26 §2).
 *
 * The A0 bundle said five, and the M16а gate measured what five does to honest work: 26 live
 * iterations, median ~105 s, p90 ~300 s — the tail of real work stood exactly on the ceiling, and
 * three iterations out of twenty-six were killed by it rather than finished. 900 s is 3× the
 * measured p90: far enough back that it only ever catches a run that is genuinely stuck (the
 * argument of D-234 — завершаемость в строке, потолок как упор). A task known to be heavier still
 * carries its own `iterationTimeoutSec` in the assignment.
 */
export const ITERATION_TIMEOUT_MS = 15 * 60_000;

/** `delivery-executor-${taskId}` — the one place this name is formed (бандл A0 §Красный CI). */
export function executorContainerName(taskId: string): string {
  return `delivery-executor-${taskId}`;
}

/**
 * The environment an executor container receives.
 *
 * **A list, not a filter.** The distinction is the whole security property: a filter over the
 * loop's environment would pass anything a future variable happened not to match, while a list
 * passes what is written in it and nothing else. `.env` is never mounted, never copied and never
 * forwarded — the container test reads the container's own environment back and asserts it.
 *
 * The credential enters under **its own name and only its own name**: a container handed a
 * subscription token has no `ANTHROPIC_API_KEY` at all, so the CLI's precedence has nothing to
 * prefer and the run cannot quietly spend the other budget (амендмент А-23).
 */
export function executorEnvironment(request: ExecutorRequest): Record<string, string> {
  return {
    [request.credential.kind]: request.credential.value,
    /* What the assignment is, so a script or a hook inside can find it without being told twice. */
    LOOP_TASK_FILE: request.taskFile,
    LOOP_TASK_ID: request.taskId,
    LOOP_PROJECT_ID: request.projectId,
    /* Claude Code writes nothing outside the workspace; a home it can write to keeps it that way. */
    HOME: '/tmp',
  };
}

export async function runExecutor(
  request: ExecutorRequest,
  deps: ExecutorDeps,
): Promise<ExecutorRun> {
  const { engine, onLine } = deps;
  const now = deps.now ?? (() => Date.now());
  const timeoutMs = deps.timeoutMs ?? ITERATION_TIMEOUT_MS;
  const name = executorContainerName(request.taskId);

  /*
   * The image, before anything else.
   *
   * It was previously ensured only by the container test, which made a first run on a clean machine
   * depend on a test having run there before it — the loop would have failed on «no such image» at
   * the moment it was least watched. `ensureExecutorImage` returns immediately when the image is
   * there, so the ordinary iteration pays one `hasImage` round trip for the property that a fresh
   * machine works.
   */
  await ensureExecutorImage(engine, (message) => {
    onLine({ stream: 'stdout', level: 'INFO', text: message });
  });

  /*
   * A container left over from a previous attempt would make `create` fail on the name — and the
   * name is how the loop indexes the daemon, so adopting the old one instead is not an option.
   */
  const stale = await engine.findByName(name);
  if (stale !== null) await engine.removeContainer(stale, { force: true });

  const id = await engine.createContainer({
    name,
    image: EXECUTOR_IMAGE,
    cmd:
      request.command ??
      claudeCommand({
        taskFile: request.taskFile,
        taskId: request.taskId,
        credentialKind: request.credential.kind,
        ...(request.model === undefined ? {} : { model: request.model }),
        ...(request.maxTurns === undefined ? {} : { maxTurns: request.maxTurns }),
      }),
    env: executorEnvironment(request),
    binds: [bindMount(request.workspacePath, '/workspace')],
    workingDir: '/workspace',
  });

  const started = now();
  let usage: ExecutorUsage = {};

  try {
    await engine.startContainer(id);

    /*
     * Attached **before** the wait, and drained in the background. A log stream read only after the
     * container exits is not a feed — it is a transcript, and the operator of an unattended run
     * needs to see a task going wrong while it is going wrong.
     */
    const draining = drain(engine, id, onLine, (line) => {
      const before = usage.rateLimitStatus;
      usage = foldStreamLine(usage, line);

      if (usage.rateLimitStatus !== undefined && usage.rateLimitStatus !== before) {
        deps.onRateLimit?.({
          status: usage.rateLimitStatus,
          window: usage.rateLimitWindow,
          resetsAt: usage.rateLimitResetsAt,
        });
      }
    });

    const timedOut = await waitWithDeadline(engine, id, timeoutMs, {
      now,
      frozenMs: deps.frozenMs ?? (() => 0),
    });

    if (timedOut) {
      onLine({
        stream: 'stderr',
        level: 'ERROR',
        text: `исполнитель не уложился в ${String(Math.round(timeoutMs / 1000))} с работы — контейнер остановлен`,
      });

      // `t: 0` is a kill, not a request: a process that has stopped making progress will not honour
      // a graceful stop either, and the iteration budget is already spent.
      await engine.stopContainer(id, 0).catch(() => undefined);
      await draining;

      return {
        outcome: 'TIMEOUT',
        exitCode: null,
        durationMs: now() - started,
        containerName: name,
        usage,
      };
    }

    await draining;

    const exitCode = (await engine.inspectContainer(id)).state.ExitCode;

    /*
     * What the plan paid for this iteration, said once, in the feed the operator is watching. It
     * comes after the run rather than during it because the CLI reports turns and tokens in its
     * closing event — a per-line estimate would be a guess about a number that is about to arrive.
     */
    const spent = describeUsage(usage);
    if (spent !== null) onLine({ stream: 'stdout', level: 'INFO', text: spent });

    return {
      outcome: exitCode === 0 ? 'SUCCESS' : 'FAILED',
      exitCode,
      durationMs: now() - started,
      containerName: name,
      usage,
    };
  } finally {
    await engine.removeContainer(id, { force: true }).catch(() => undefined);
  }
}

/** Streams the container's output into the feed until the stream ends, accounting as it goes. */
async function drain(
  engine: DockerEngine,
  id: string,
  onLine: ExecutorDeps['onLine'],
  account: (line: string) => void,
): Promise<void> {
  try {
    for await (const line of readLogFrames(await engine.attachLogs(id, { follow: true }))) {
      if (line.text.trim() === '') continue;
      if (line.stream === 'stdout') account(line.text);
      onLine({
        stream: line.stream,
        text: line.text,
        level: line.stream === 'stderr' ? 'WARN' : 'INFO',
      });
    }
  } catch {
    /*
     * The stream ends when the container is removed, and a killed container's stream ends abruptly.
     * Losing the log is bad; letting it turn a completed iteration into an exception is worse.
     */
  }
}

/** How often the deadline is re-checked. Small against five minutes, cheap against a paused clock. */
const DEADLINE_TICK_MS = 500;

/**
 * True when the deadline arrived first — where «the deadline» counts **working** time.
 *
 * A ticking check rather than one `setTimeout`, because the budget is no longer a fixed span: time
 * the pipeline spends frozen is subtracted as it accrues, so a container paused by a red verdict
 * keeps the ceiling it had when it was paused.
 */
async function waitWithDeadline(
  engine: DockerEngine,
  id: string,
  timeoutMs: number,
  clock: { now: () => number; frozenMs: () => number },
): Promise<boolean> {
  const abort = new AbortController();
  const startedAt = clock.now();
  const frozenAtStart = clock.frozenMs();
  let timer: ReturnType<typeof setInterval> | undefined;

  const deadline = new Promise<'timeout'>((settle) => {
    timer = setInterval(() => {
      const frozen = Math.max(clock.frozenMs() - frozenAtStart, 0);
      if (clock.now() - startedAt - frozen < timeoutMs) return;

      abort.abort();
      settle('timeout');
    }, DEADLINE_TICK_MS);
    /* An orchestrator that is otherwise idle must not be held awake by this timer. */
    timer.unref();
  });

  const finished = engine
    .waitContainer(id, abort.signal)
    .then(() => 'finished' as const)
    .catch(() => 'finished' as const);

  try {
    return (await Promise.race([finished, deadline])) === 'timeout';
  } finally {
    if (timer !== undefined) clearInterval(timer);
  }
}
