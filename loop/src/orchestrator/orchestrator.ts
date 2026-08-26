import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';

import { z } from 'zod';

import { runCycle, type CycleResult } from '../cycle/run-cycle.ts';
import type { DockerEngine } from '../docker/engine.ts';
import type { ExecutorCredential } from '../executor/credential.ts';
import { eventBus } from '../events/bus.ts';
import {
  HANDOFF,
  HandoffTask,
  importHandoff,
  MilestonesFile,
  taskFileName,
} from '../intake/handoff.ts';
import type { Chain } from '../llm/chain.ts';
import type { Logger } from '../observability/log.ts';
import { readSeed } from '../intake/plan-review.ts';
import { research } from '../intake/researcher.ts';

import { detectTechStack } from '../gate/tech-stack.ts';
import { LEDGER_DIRECTORY } from '../gate/measurement.ts';
import { judgeProduct, qualityLine, type QualityOutcome } from '../gate/quality-stage.ts';
import { recordCalibration } from '../intake/calibration.ts';
import { readScope } from '../intake/scope.ts';
import type { TechStack } from '../intake/handoff.ts';

import { freezePipeline, isFrozen, markProject } from './freeze.ts';
import { findSelfCheckReport, verificationLine } from './self-check.ts';
import {
  DEFAULT_MAX_EXECUTORS,
  schedule,
  type ScheduleMilestone,
  type SchedulePlan,
  type ScheduleTask,
} from './schedule.ts';
import {
  describeThrottle,
  describeWindowWarning,
  IDLE_THROTTLE,
  isWindowWarning,
  observeRateLimit,
  remainingMs,
  throttled,
  type RateLimitSignal,
  type ThrottleState,
} from './throttle.ts';

/**
 * The orchestrator, living in the dashboard's server process (task 157/158).
 *
 * Two responsibilities, and the second is what makes the first survivable:
 *
 * - **driving** — pick the next task whose milestone is reachable, run its cycle, repeat;
 * - **recovering** — on every boot, rebuild the index from the `handoff/` tree on disk and return
 *   any task the dead process had in flight to `PENDING`.
 *
 * The recovery is not a nicety. An orchestrator that is `SIGKILL`ed mid-cycle leaves a task marked
 * `IN_PROGRESS` and a container that nobody is watching; on the next boot, the disk still holds the
 * whole plan, and the one thing the database says that is no longer true is that somebody is
 * working on that task. Repairing exactly that, from the disk, is what «the disk is the source of
 * truth and the database is an index» buys.
 *
 * The full Step-0 recovery — foreign keys, milestones, a lost `techStack` — is M16а's task 162.
 * What is here is what M15а needs: one cycle, resumable.
 */

export interface OrchestratorDeps {
  database: DatabaseSync;
  engine: DockerEngine;
  logger: Logger;
  /** The one credential handed to every executor container this project runs. */
  credential: ExecutorCredential;
  /**
   * Present only for a rehearsal: what the executor container runs instead of Claude Code.
   *
   * A factory rather than a fixed argv, because the scripted executor has to write a report for
   * *this* task — and the orchestrator, not the caller, is what knows which task is next.
   */
  executorCommand?: (taskId: string, projectId: string) => readonly string[];
  executorTimeoutMs?: number;
  acceptanceTimeoutMs?: number;
  /** One test command's own limit inside the acceptance run (task 174). */
  acceptanceTestTimeoutMs?: number;
  model?: string | undefined;
  /** `MAX_EXECUTORS` — the ceiling on containers at once (task 159). */
  maxExecutors?: number;
  /**
   * The researcher's chain (task 161).
   *
   * Used when a task comes back from the controller: the workspace has moved since the intake
   * surveyed it, and the executor about to pick the assignment up again should read what is there
   * now rather than what was there before its own first attempt.
   */
  researchChain?: Chain | null;
  /**
   * Цепочка суда качества (А-44 п.2) — своя роль, а не заимствованный архитектор.
   *
   * `null`/отсутствует — ось связности не судится, и доска говорит это словами: суд, которому нечем
   * смотреть, не бывает зелёным по умолчанию, и «проект завершён» по нему не произносится.
   */
  judgeChain?: Chain | null;
  /** Injected so the throttling case is a table of cases rather than a test that sleeps. */
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

export interface RecoveredProject {
  projectId: string;
  projectDirectory: string;
  milestones: number;
  tasks: number;
  /** Tasks the dead process had in flight, returned to `PENDING` by this boot. */
  resumed: string[];
  /** Assignments whose `techStack` was missing and was detected from the workspace (task 162). */
  repaired: string[];
  /** True when a freeze marker is on disk — the boot leaves it exactly where it is (task 160). */
  frozen: boolean;
}

/**
 * Reads a project's whole handoff tree back off disk (tasks 158, 162).
 *
 * **A missing `techStack` is repaired rather than dropped** (task 162). The field is required by the
 * contract, so an assignment that lost it — hand-edited, half-written by a killed process, produced
 * by an older intake — fails to parse, and the strict reading of «skip what you cannot read» costs
 * the whole task. That is the wrong trade for this one field, because the answer is *knowable*: the
 * project is on disk and `detectTechStack` reads it, which is the same algorithm the cycle applies
 * to every task before it runs (task 157). Everything else that cannot be parsed is still skipped —
 * the operator sees the task missing from the board, which is louder than a silent default.
 */
export function readHandoffTree(projectDirectory: string): {
  milestones: MilestonesFile['milestones'];
  projectId: string;
  tasks: HandoffTask[];
  /** Assignments whose stack was missing and was detected from the workspace on the way in. */
  repaired: string[];
} | null {
  const milestonesPath = join(projectDirectory, HANDOFF.milestones);
  if (!existsSync(milestonesPath)) return null;

  let file: MilestonesFile;
  try {
    file = MilestonesFile.parse(JSON.parse(readFileSync(milestonesPath, 'utf8')));
  } catch {
    return null;
  }

  const tasksDirectory = join(projectDirectory, HANDOFF.tasks);
  if (!existsSync(tasksDirectory)) {
    return { milestones: file.milestones, projectId: file.projectId, tasks: [], repaired: [] };
  }

  const tasks: HandoffTask[] = [];
  const repaired: string[] = [];
  /* Detected at most once per tree: it reads the same directory whatever the task. */
  let detected: TechStack | null = null;

  for (const name of readdirSync(tasksDirectory)) {
    if (!name.startsWith('task_') || !name.endsWith('.json')) continue;

    let raw: unknown;
    try {
      raw = JSON.parse(readFileSync(join(tasksDirectory, name), 'utf8'));
    } catch {
      continue;
    }

    const parsed = HandoffTask.safeParse(raw);
    if (parsed.success) {
      tasks.push(parsed.data);
      continue;
    }

    detected ??= detectTechStack(projectDirectory).techStack;
    const mended = HandoffTask.safeParse({ ...(raw as object), techStack: detected });

    if (mended.success) {
      tasks.push(mended.data);
      repaired.push(mended.data.taskId);
      /* Written back, because the disk is the source of truth and the next reader must agree. */
      writeFileSync(
        join(tasksDirectory, name),
        `${JSON.stringify(mended.data, null, 2)}\n`,
        'utf8',
      );
    }
  }

  return { milestones: file.milestones, projectId: file.projectId, tasks, repaired };
}

/**
 * Rebuilds the database from every project directory under the workspace root.
 *
 * Called at boot, before the first request is served. Deleting the SQLite file entirely is a
 * supported thing to do: everything comes back from `handoff/`.
 */
export function recoverFromDisk(
  database: DatabaseSync,
  workspaceRoot: string,
  logger?: Logger,
): RecoveredProject[] {
  if (!existsSync(workspaceRoot)) return [];

  const recovered: RecoveredProject[] = [];

  for (const entry of readdirSync(workspaceRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;

    /*
     * Бухгалтерия контура проектом не бывает (А-51 п.1). Книги замеров живут СОСЕДЯМИ рабочих
     * директорий, и перебор корня их видит. Сегодня их отсекло бы `readHandoffTree`, вернув
     * `null`, — но это совпадение, а не правило: связь между переносом книги и восстановлением с
     * диска невидима, и следующий, менее придирчивый скан корня прочёл бы книгу как проект.
     */
    if (entry.name === LEDGER_DIRECTORY) continue;

    const projectDirectory = join(workspaceRoot, entry.name);
    const tree = readHandoffTree(projectDirectory);
    if (tree === null) continue;

    importHandoff(
      database,
      tree.projectId,
      entry.name,
      tree.milestones.map((milestone) => ({ ...milestone, taskIds: [] })),
      tree.tasks,
      resolve(projectDirectory),
    );

    /*
     * Anything the dead process had in flight. `IN_PROGRESS` after a boot is a claim about a
     * process that no longer exists — the task is simply pending again, and its container, if one
     * outlived the orchestrator, is reaped by name the next time it is started.
     *
     * **`PAUSED` and `BLOCKED` are left exactly as they are** (tasks 160, 162), and that is the
     * whole of «замороженное переживает рестарт». Both are decisions somebody made — a red verdict
     * and a person's block — and a boot that tidied them into `PENDING` would be the loop resuming
     * itself past the one state that exists to stop it.
     */
    const frozen = isFrozen(projectDirectory);
    const resumed = tree.tasks
      .filter((task) => task.status === 'IN_PROGRESS')
      .map((task) => task.taskId);

    for (const taskId of resumed) {
      database
        .prepare("UPDATE tasks SET status = 'PENDING' WHERE project_id = ? AND task_id = ?")
        .run(tree.projectId, taskId);
      setStatusOnDisk(projectDirectory, taskId, 'PENDING');
    }

    /* The project row follows the marker, so a dashboard opened after a restart shows the stop. */
    if (frozen) markProject(database, tree.projectId, 'PAUSED');

    recovered.push({
      projectId: tree.projectId,
      projectDirectory,
      milestones: tree.milestones.length,
      tasks: tree.tasks.length,
      resumed,
      repaired: tree.repaired,
      frozen,
    });

    logger?.write({
      projectId: tree.projectId,
      agentRole: 'ORCHESTRATOR',
      logLevel: resumed.length === 0 && !frozen ? 'INFO' : 'WARN',
      message:
        `Состояние восстановлено с диска: вех ${String(tree.milestones.length)}, ` +
        `задач ${String(tree.tasks.length)}` +
        (resumed.length === 0
          ? '. Незавершённых итераций не было.'
          : `. Возобновлены после обрыва: ${resumed.join(', ')}.`) +
        (tree.repaired.length === 0
          ? ''
          : ` Стек определён по проекту для заданий: ${tree.repaired.join(', ')}.`) +
        (frozen
          ? ' Конвейер заморожен (handoff/FROZEN.md) — сам не возобновится, только «Возобновить».'
          : ''),
    });
  }

  return recovered;
}

function setStatusOnDisk(
  projectDirectory: string,
  taskId: string,
  status: HandoffTask['status'],
): void {
  const path = join(projectDirectory, HANDOFF.tasks, taskFileName(taskId));
  if (!existsSync(path)) return;

  const task = HandoffTask.parse(JSON.parse(readFileSync(path, 'utf8')));

  writeFileSync(
    path,
    `${JSON.stringify(HandoffTask.parse({ ...task, status }), null, 2)}\n`,
    'utf8',
  );
}

const Row = z.object({ task_id: z.string(), milestone_id: z.string() });

/** A column that cannot be read is no dependencies — the same rule the dashboard's reader uses. */
function parseDependsOn(value: string | null): string[] {
  try {
    return z.array(z.string()).parse(JSON.parse(value ?? '[]'));
  } catch {
    return [];
  }
}

/**
 * The next task that may run: `PENDING`, and in a milestone whose dependencies are all complete.
 *
 * The milestone graph is what the slicing computed, so nothing here re-derives an order — it reads
 * the one the intake already decided and asks whether this milestone's turn has come.
 */
export function nextRunnableTask(
  database: DatabaseSync,
  projectId: string,
): { taskId: string; milestoneId: string } | null {
  const completedMilestones = new Set(
    database
      .prepare("SELECT milestone_id FROM milestones WHERE project_id = ? AND status = 'COMPLETED'")
      .all(projectId)
      .map((row) => z.object({ milestone_id: z.string() }).parse(row).milestone_id),
  );

  const dependencies = new Map<string, string[]>();
  for (const row of database
    .prepare('SELECT milestone_id, depends_on FROM milestones WHERE project_id = ?')
    .all(projectId)) {
    const parsed = z
      .object({ milestone_id: z.string(), depends_on: z.string().nullable() })
      .parse(row);

    dependencies.set(parsed.milestone_id, parseDependsOn(parsed.depends_on));
  }

  const rows = database
    .prepare(
      `SELECT t.task_id, t.milestone_id
       FROM tasks t JOIN milestones m
         ON m.project_id = t.project_id AND m.milestone_id = t.milestone_id
       WHERE m.project_id = ? AND t.status = 'PENDING'
       ORDER BY m.position, t.position, t.task_id`,
    )
    .all(projectId)
    .map((row) => Row.parse(row));

  for (const row of rows) {
    const waiting = dependencies.get(row.milestone_id) ?? [];
    if (waiting.every((milestone) => completedMilestones.has(milestone))) {
      return { taskId: row.task_id, milestoneId: row.milestone_id };
    }
  }

  return null;
}

/**
 * A milestone is complete when every task in it is.
 *
 * Проект — параметр, а не находка (А-38 п.3). До составного ключа веха адресовалась одним именем, и
 * счёт «сколько задач в вехе принято» шёл по всем проектам разом: у двух проектов с `ms_01` веха
 * первого завершалась задачами второго. Это тот же класс, что D-324, и в самой чувствительной точке —
 * ровно здесь решается, разблокирована ли следующая веха.
 */
export function refreshMilestoneStatus(
  database: DatabaseSync,
  projectId: string,
  milestoneId: string,
): void {
  const counts = z
    .object({ total: z.coerce.number(), done: z.coerce.number(), running: z.coerce.number() })
    .parse(
      database
        .prepare(
          `SELECT count(*) AS total,
                  sum(CASE WHEN status = 'COMPLETED' THEN 1 ELSE 0 END) AS done,
                  sum(CASE WHEN status IN ('IN_PROGRESS') THEN 1 ELSE 0 END) AS running
           FROM tasks WHERE project_id = ? AND milestone_id = ?`,
        )
        .get(projectId, milestoneId) ?? { total: 0, done: 0, running: 0 },
    );

  const status =
    counts.total > 0 && counts.done === counts.total
      ? 'COMPLETED'
      : counts.running > 0 || counts.done > 0
        ? 'IN_PROGRESS'
        : 'PENDING';

  database
    .prepare('UPDATE milestones SET status = ? WHERE project_id = ? AND milestone_id = ?')
    .run(status, projectId, milestoneId);

  eventBus().publish({ type: 'milestone-status', projectId, milestoneId, status });
}

/**
 * The plan as the scheduler needs it: rows, not objects with behaviour (task 159).
 *
 * Read fresh on every pass of the pipeline, because everything it reports can have moved since the
 * last one — a milestone completed, a task blocked by a person, a status restored by `retry`.
 */
export function readPlan(database: DatabaseSync, projectId: string): SchedulePlan {
  const milestones = database
    .prepare(
      `SELECT milestone_id, status, position, depends_on FROM milestones
       WHERE project_id = ? ORDER BY position, milestone_id`,
    )
    .all(projectId)
    .map((row): ScheduleMilestone => {
      const parsed = z
        .object({
          milestone_id: z.string(),
          status: z.string(),
          position: z.coerce.number().int(),
          depends_on: z.string().nullable(),
        })
        .parse(row);

      return {
        milestoneId: parsed.milestone_id,
        status: parsed.status,
        position: parsed.position,
        dependsOn: parseDependsOn(parsed.depends_on),
      };
    });

  const tasks = database
    .prepare(
      `SELECT t.task_id, t.milestone_id, t.status, t.position, t.files_to_edit, t.depends_on
       FROM tasks t JOIN milestones m
         ON m.project_id = t.project_id AND m.milestone_id = t.milestone_id
       WHERE m.project_id = ? ORDER BY t.position, t.task_id`,
    )
    .all(projectId)
    .map((row): ScheduleTask => {
      const parsed = z
        .object({
          task_id: z.string(),
          milestone_id: z.string(),
          status: z.string(),
          position: z.coerce.number().int(),
          files_to_edit: z.string().nullable(),
          depends_on: z.string().nullable(),
        })
        .parse(row);

      return {
        taskId: parsed.task_id,
        milestoneId: parsed.milestone_id,
        status: parsed.status,
        position: parsed.position,
        filesToEdit: parseDependsOn(parsed.files_to_edit),
        dependsOn: parseDependsOn(parsed.depends_on),
      };
    });

  return { milestones, tasks };
}

/**
 * The pipelines this process is driving right now (task 160).
 *
 * `retry` has to know whether the iterations a freeze paused still have a reader: if they do,
 * unpausing puts them back on their feet; if the server was restarted while frozen, they are
 * containers nobody is listening to and have to start again. Only the process itself knows, so it
 * says so here — on `globalThis`, for the same reason the event bus is there: Next reloads modules
 * in development, and a second copy of this map would be a second, empty answer.
 */
export interface LivePipeline {
  projectDirectory: string;
  /** Tasks with an iteration this process is still awaiting. */
  running: () => string[];
}

const PIPELINES = Symbol.for('spec-platform.loop.pipelines');

interface PipelineHolder {
  [PIPELINES]?: Map<string, LivePipeline>;
}

export function livePipelines(): Map<string, LivePipeline> {
  const holder = globalThis as unknown as PipelineHolder;
  holder[PIPELINES] ??= new Map<string, LivePipeline>();
  return holder[PIPELINES];
}

export function livePipeline(projectId: string): LivePipeline | null {
  return livePipelines().get(projectId) ?? null;
}

/** What one settled iteration carries back to the pipeline. */
interface Settled {
  taskId: string;
  milestoneId: string;
  result: CycleResult;
}

/**
 * Drives one project until there is nothing left to run (tasks 158, 159, 160).
 *
 * A slot-filling loop rather than a queue: on every pass it asks the plan what may start now,
 * starts as many of those as the ceiling allows, and then waits for **whichever** iteration finishes
 * first. That is what makes ten executors ten executors — a queue with a worker pool would have
 * needed the pool to know about milestones, and the milestone rule would then live in two places.
 *
 * Three things can hold it, and each is a different state with a different ending:
 *
 * - **the plan** — a milestone waiting for its dependencies, or a file two tasks both want. Nothing
 *   is wrong; fewer containers run, and the run is obeying its own plan (task 159).
 * - **the tariff** — a `rate_limit_event` that is not `allowed`. New starts stop, running
 *   iterations finish, the feed says when it resumes, and the loop waits. **Not an error**: a
 *   pipeline that failed here would cascade ten tasks into red over a budget working as designed
 *   (А-24 §2), which is a red condition of the M16а gate.
 * - **a red verdict** — the acceptance said no. Everything freezes, on disk, and only `retry` lifts
 *   it (task 160).
 *
 * `maxCycles` bounds iterations *started*, not passes of the loop. A backstop, not a working limit.
 */
export async function driveProject(
  projectId: string,
  projectDirectory: string,
  deps: OrchestratorDeps,
  maxCycles: number | undefined = 100,
): Promise<CycleResult[]> {
  const { database, logger } = deps;
  const now = deps.now ?? (() => Date.now());
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const limit = deps.maxExecutors ?? DEFAULT_MAX_EXECUTORS;

  const say = (message: string, level: 'INFO' | 'WARN' | 'ERROR' = 'INFO') => {
    logger.write({ projectId, agentRole: 'ORCHESTRATOR', logLevel: level, message });
  };

  const results: CycleResult[] = [];
  const running = new Map<string, Promise<Settled>>();
  /**
   * Iterations that have finished and not yet been accounted for.
   *
   * A queue rather than an awaited value, because the loop has three different reasons to wake up —
   * an iteration finished, a tariff window reopened, a freeze was lifted — and only one of them is a
   * settled promise. Draining this at the top of every pass means an iteration is accounted for
   * whichever of the three woke the loop, including the pass on which the pipeline is frozen and
   * therefore not waiting on it at all.
   */
  const done: Settled[] = [];
  /**
   * How many times the controller has handed each task back (task 161).
   *
   * A returned task goes to `PENDING` and the scheduler picks it up again, which is the right
   * behaviour and also an unbounded loop if the executor never fixes the style. The bound is here
   * rather than on disk because it is a fact about *this run*: after a restart the executor is a new
   * one and deserves its own tries.
   */
  const returns = new Map<string, number>();
  let throttle: ThrottleState = IDLE_THROTTLE;
  let started = 0;
  /** Последнее, что проход знал о блокировке: только для финальной строки (см. шаг 3). */
  let blocked = false;

  /**
   * The hold, announced once when it starts and once when it ends.
   *
   * `announced` rather than «say it whenever the state differs», because the two ends of a hold
   * arrive by different routes: the start is an event on an executor's stream, and the end is either
   * another event or simply the clock passing the reset time, which nothing announces. One flag
   * covers both and cannot produce two «resumed» lines for one pause.
   */
  const hold = { announced: false, warned: false };

  const onRateLimit = (signal: RateLimitSignal) => {
    throttle = observeRateLimit(throttle, signal, now());

    if (throttled(throttle, now())) {
      if (!hold.announced) {
        hold.announced = true;
        say(describeThrottle(throttle, now()), 'WARN');
      }
      return;
    }

    /*
     * Предупреждение о конце окна — сказать один раз за прогон и НЕ держать (А-38 п.1).
     *
     * CLI повторяет его на каждом вызове, поэтому без флага лента получила бы одну и ту же строку
     * десятками. Один раз — потому что содержание её не меняется, а изменится (окно кончится) —
     * придёт уже отказ, и он говорится своей строкой.
     */
    if (isWindowWarning(throttle.status) && !hold.warned) {
      hold.warned = true;
      say(describeWindowWarning(throttle), 'WARN');
    }
  };

  /*
   * **Один проект — один водитель** (А-38 п.1).
   *
   * Раунд А-37.1 показал, чем это кончается без правила: конвейер стоял на ложном тарифе, оператор
   * четырежды жал «запустить», и каждое нажатие заводило ВТОРОЙ проход по той же доске. Карта
   * живых конвейеров ключуется проектом, поэтому второй молча вытеснял первого из неё: «Возобновить»
   * после этого разговаривал с новым проходом, а старый оставался спать, держа свои итерации. Два
   * планировщика над одной доской — это и двойной старт одной задачи, и заморозка, которую видит не
   * тот, кто её ждёт.
   *
   * Отказ здесь, а не в маршруте, потому что маршрутов два (`start-loop` и `retry`) и правило одно.
   * Он не ошибка: разблокированные задачи подхватывает тот проход, что уже идёт, — и строка ленты
   * говорит человеку ровно это.
   */
  const already = livePipelines().get(projectId);
  if (already !== undefined) {
    const inFlight = already.running();
    say(
      `Конвейер этого проекта уже идёт в этом процессе (в работе задач ${String(inFlight.length)}` +
        `${inFlight.length === 0 ? '' : `: ${inFlight.join(', ')}`}). ` +
        'Второй проход не запускается: разблокированные задачи подхватит идущий.',
    );
    return results;
  }

  const pipeline: LivePipeline = { projectDirectory, running: () => [...running.keys()] };
  livePipelines().set(projectId, pipeline);

  try {
    for (;;) {
      /* 1. Account for everything that finished, whichever of the three signals woke this pass. */
      for (const settled of done.splice(0, done.length)) {
        running.delete(settled.taskId);
        results.push(settled.result);
        refreshMilestoneStatus(database, projectId, settled.milestoneId);

        if (settled.result.outcome === 'FAILED') await freeze(settled);

        if (settled.result.outcome === 'RETURNED') {
          const taken = (returns.get(settled.taskId) ?? 0) + 1;
          returns.set(settled.taskId, taken);

          if (taken > MAX_CONTROLLER_RETURNS) {
            /*
             * The style never came right. At this point it *is* a verdict about the work — the
             * executor has had its tries and the pipeline is going in circles — so it becomes the
             * red one, with the reason naming how many attempts it took to decide that.
             */
            say(
              `Задача ${settled.taskId} возвращалась контролёром ${String(taken - 1)} раз(а) ` +
                'и снова красная по стилю. Это уже вердикт: конвейер замораживается.',
              'ERROR',
            );
            await freeze(settled);
          } else {
            say(
              `Задача ${settled.taskId} возвращена исполнителю (попытка ${String(taken)} из ` +
                `${String(MAX_CONTROLLER_RETURNS)}). Тесты приёмки не запускались.`,
              'WARN',
            );

            /* The workspace has moved since the intake read it; the next attempt reads it fresh. */
            const surveyed = await research(projectDirectory, deps.researchChain ?? null);
            say(
              `Исследователь пересобрал контекст: записей ${String(surveyed.survey.tree.length)}, ` +
                `манифестов ${String(surveyed.survey.manifests.length)}.`,
            );
          }
        }

        if (settled.result.outcome === 'BLOCKED') {
          /*
           * The executor's own legitimate stop, and a person's to lift (`BLOCKED_<taskId>.md`). It
           * is not a red verdict — nothing was judged — so the pipeline does not freeze; it stops
           * *starting* work, lets what is running finish, and ends. «The loop never walks past a red
           * task» (бандл A0), kept as it was in M15а.
           */
          say(
            `Задача ${settled.taskId} заблокирована. Новые исполнители не запускаются; ` +
              'запущенные доигрывают. Снимите блокировку — конвейер продолжит сам.',
            'WARN',
          );
          /*
           * Флага здесь больше нет намеренно (А-42 п.3): статус BLOCKED уже записан на диск и в
           * индекс, а шаг 3 читает доску заново каждым проходом. Защёлка в переменной пережила бы
           * снятие блокировки человеком и была бы вторым источником правды рядом с доской.
           */
        }
      }

      /* 2. Frozen: nothing new starts, and the loop waits rather than returning — so that `retry`
       *    resumes the very same iterations instead of starting them again. */
      if (isFrozen(projectDirectory)) {
        if (running.size === 0) break;
        await Promise.race([...running.values(), sleep(FREEZE_POLL_MS)]);
        continue;
      }

      const holding = throttled(throttle, now());
      if (hold.announced && !holding) {
        hold.announced = false;
        say('Окно тарифа снова открыто — запуск исполнителей возобновляется.');
      }

      /*
       * 3. Fill the free slots, unless the tariff or a block says otherwise.
       *
       * **Блокировка — факт ДОСКИ, а не защёлка прохода** (А-42 п.3). Раньше первая же BLOCKED
       * задача взводила флаг на весь проход, и снятие блокировки человеком не могло его снять:
       * даже идущий конвейер, у которого доигрывали соседние задачи, разблокированную не брал.
       * Перечитанная каждым проходом доска делает снятие самоисполняющимся — человек удалил файл,
       * вотчер починил статус, следующий проход это увидел. Правило «конвейер не идёт мимо
       * заблокированной задачи» сохранено дословно, изменился только источник ответа.
       */
      const plan = readPlan(database, projectId);
      blocked = plan.tasks.some((task) => task.status === 'BLOCKED');

      if (!holding && !blocked && started < maxCycles) {
        const { start } = schedule({
          plan,
          running: [...running.keys()],
          limit,
        });

        for (const task of start) {
          if (started >= maxCycles) break;
          started += 1;
          running.set(task.taskId, launch(task));
        }
      }

      /* 4. Wait for whichever comes first: an iteration, or the window reopening. */
      if (running.size === 0) {
        if (!holding) break;

        await sleep(Math.min(Math.max(remainingMs(throttle, now()), 1), FREEZE_POLL_MS));
        continue;
      }

      await Promise.race([
        ...running.values(),
        ...(holding ? [sleep(Math.min(remainingMs(throttle, now()), FREEZE_POLL_MS))] : []),
      ]);
    }

    /*
     * Nothing runnable and nothing running — and the pipeline says which of the two endings this is.
     *
     * A quiet return was the shape the gate rehearsal found hardest to read: two tasks red, their
     * milestone unable to complete, fifteen tasks pending, and a log that simply stopped. «Not
     * finished» has several shapes and the operator needs the one that happened, in a line, at the
     * bottom of the feed they are already looking at.
     */
    const plan = readPlan(database, projectId);
    const count = (status: string) => plan.tasks.filter((task) => task.status === status).length;

    if (plan.tasks.length > 0 && count('COMPLETED') === plan.tasks.length) {
      /*
       * **Суд качества — СТАДИЯ, и последняя** (А-44 п.2). Все задачи приняты — это утверждение о
       * ЗАДАЧАХ; вершинный критерий обязан быть утверждением о ЗАДУМКЕ. Между ними и стоит суд:
       * контур открывает продукт браузером, пользуется им и выносит доску четырёх осей.
       *
       * До сих пор `visual-judge.ts` был мёртвым кодом — его импортировал только собственный тест,
       * а суд все раунды выносил операторский скрипт снаружи. Продукт с 74 мёртвыми ссылками из 86
       * и тостом «Демо-версия, функция недоступна» проходил вершинный критерий целиком.
       */
      say('Все задачи приняты. Суд качества: открываю продукт и пользуюсь им.');

      const judged = await judgeProduct(
        { projectDirectory, seed: readSeed(projectDirectory), projectId },
        {
          engine: deps.engine,
          chain: deps.judgeChain ?? null,
          onLine: (line) => {
            say(line.text, line.stream === 'stderr' ? 'WARN' : 'INFO');
          },
        },
      ).catch((error: unknown): QualityOutcome => ({
        status: 'skipped',
        reason: `стадия суда упала: ${error instanceof Error ? error.message : String(error)}`,
      }));

      const line = qualityLine(judged);
      say(line.text, line.complete ? 'INFO' : 'ERROR');

      /*
       * Вердикт — владельцу, всегда. Без этого «все задачи приняты, продукт не принят» было бы
       * тишиной: `project-status` при незелёной доске не публикуется, а молчащий конец прохода и
       * есть тот режим отказа, который стоил раунду А-37.1 четырёх внешних ходов.
       */
      eventBus().publish({
        type: 'quality',
        projectId,
        green: line.kind === 'green',
        kind: line.kind,
        text: line.text,
      });

      /*
       * **«Проект завершён» при любой красной оси невозможно** (А-44 п.2). Вердикт входит в
       * вершинную строку ДОСЛОВНО: не смягчён, не пересказан, не сокращён до галочки. Задачи при
       * этом приняты честно и статус проекта это отражает — но статус задач и приговор задумке суть
       * разные утверждения, и второе теперь произносится вслух.
       */
      markProject(database, projectId, line.complete ? 'COMPLETED' : 'ACTIVE');

      /*
       * **Петля калибровки бюджета замыкается здесь** (А-51, вердикт §10.4).
       *
       * Оценка модели была ПРЕДСКАЗАНИЕМ (`keptUnits` суждения об объёме); четвёртая ось суда
       * только что дала ФАКТ (`counts.working` — сколько элементов проба потрогала и они
       * сработали). Отношение одного к другому и есть коэффициент, на который правится бюджет
       * следующих проектов, — измеренный, а не угаданный. Пишется только когда суд СОСТОЯЛСЯ:
       * несудившийся продукт факта не даёт, и записать по нему ноль значило бы сфабриковать
       * систематическое занижение.
       */
      if (judged.status === 'judged') {
        const scope = readScope(projectDirectory);

        if (scope !== null) {
          recordCalibration(projectDirectory, {
            projectId,
            at: new Date().toISOString(),
            predictedUnits: scope.keptUnits,
            workingUnits: judged.board.operability.counts.working,
          });
          say(
            `Калибровка бюджета: предсказано ${String(scope.keptUnits)} единиц, вышло рабочим ` +
              `${String(judged.board.operability.counts.working)}. Запись легла в журнал ` +
              'калибровки — бюджет следующих проектов правится на измеренное отношение.',
          );
        }
      }

      const registry = verificationLine(findSelfCheckReport(projectDirectory));

      /*
       * **Вершинная строка называет ТОТ исход, который случился** (А-51 п.4).
       *
       * Прежде здесь стояли две ветки, и незелёная зашивала «но суд качества красный» независимо
       * от того, был ли суд вообще. Несостоявшийся суд объявлялся владельцу красным — то есть
       * строка врала о продукте в единственном месте, которое владелец читает. Исходов четыре,
       * и различает их `line.kind`, а не наличие галочки.
       */
      const headline =
        line.kind === 'green'
          ? `Проект завершён: принято задач ${String(plan.tasks.length)}.`
          : line.kind === 'unjudgeable'
            ? `Проект завершён С ДОЛГОМ: принято задач ${String(plan.tasks.length)}, но продукт ` +
              'НЕ СУДИМ судом качества — судьи для невизуальной работы у контура нет. Долг записан.'
            : line.kind === 'not-held'
              ? `Проект НЕ завершён: все ${String(plan.tasks.length)} задач приняты, а суд ` +
                'качества НЕ СОСТОЯЛСЯ — это отказ контура, а не приговор продукту.'
              : `Проект НЕ завершён: все ${String(plan.tasks.length)} задач приняты, но суд ` +
                'качества КРАСНЫЙ.';

      say(
        `${headline} ${registry}\n${line.text}`,
        line.kind === 'green' ? 'INFO' : line.kind === 'unjudgeable' ? 'WARN' : 'ERROR',
      );
    } else {
      /*
       * **Проход не заканчивается там, где очередь не пуста — а если закончился, он называет чем**
       * (А-38 п.1).
       *
       * Причин уйти при непустой очереди ровно три, и каждая — решение, а не молчание: заблокированная
       * задача ждёт человека, замороженный конвейер ждёт «Возобновить», потолок прохода — заказанный
       * предел вызова. Четвёртой быть не должно; если планировщик всё же отдаёт задачу, которую
       * никто не взял, это дефект управляющего потока, и он обязан быть громким, а не выглядеть
       * тихим финалом. Ровно такой тихий финал стоил раунду А-37.1 четырёх внешних ходов.
       */
      const stillRunnable = schedule({ plan, running: [], limit }).start.length;
      const ceiling = started >= maxCycles;

      const named = blocked || isFrozen(projectDirectory) || ceiling || count('FAILED') > 0;
      const unnamed = !named && stillRunnable > 0;

      const why = blocked
        ? 'Заблокированная задача ждёт человека — снимите блокировку и запустите конвейер снова.'
        : count('FAILED') > 0
          ? 'Красные задачи держат свои вехи — «Возобновить» отправит их на повторный прогон.'
          : isFrozen(projectDirectory)
            ? 'Конвейер заморожен — продолжение только «Возобновить».'
            : ceiling
              ? `Достигнут потолок прохода: запущено итераций ${String(started)} из ${String(maxCycles)}. ` +
                'Это заказанный предел вызова, а не конец плана — запустите конвейер снова.'
              : unnamed
                ? `ДЕФЕКТ УПРАВЛЯЮЩЕГО ПОТОКА: задач, готовых идти прямо сейчас, ${String(stillRunnable)}, ` +
                  'а проход завершился. Останавливаться было не на чем.'
                : 'Запускать больше нечего.';

      say(
        `Конвейер остановился: принято ${String(count('COMPLETED'))} из ` +
          `${String(plan.tasks.length)}; красных ${String(count('FAILED'))}, ` +
          `заблокированных ${String(count('BLOCKED'))}, приостановленных ${String(count('PAUSED'))}, ` +
          `ожидают ${String(count('PENDING'))}. ${why}`,
        unnamed ? 'ERROR' : count('FAILED') > 0 ? 'WARN' : 'INFO',
      );
    }

    return results;
  } finally {
    livePipelines().delete(projectId);
  }

  /** One iteration, and never a rejection: a thrown cycle is a failed task, not a dead pipeline. */
  function launch(task: ScheduleTask): Promise<Settled> {
    const { executorCommand, ...rest } = deps;

    return runCycle(
      { projectId, taskId: task.taskId, projectDirectory },
      {
        ...rest,
        onRateLimit,
        ...(executorCommand === undefined
          ? {}
          : { executorCommand: executorCommand(task.taskId, projectId) }),
      },
    )
      .catch((error: unknown): CycleResult => ({
        taskId: task.taskId,
        outcome: 'FAILED',
        reported: null,
        executor: {
          outcome: 'FAILED',
          exitCode: null,
          durationMs: 0,
          containerName: '',
          usage: {},
        },
        acceptance: null,
        reason: `итерация упала: ${error instanceof Error ? error.message : String(error)}`,
        decisionId: null,
        techStackRewritten: false,
      }))
      .then((result) => {
        const settled = { taskId: task.taskId, milestoneId: task.milestoneId, result };
        done.push(settled);
        return settled;
      });
  }

  /** The red verdict, made into a state the disk carries (task 160). */
  async function freeze(settled: Settled): Promise<void> {
    const inFlight = [...running.keys()].map((taskId) => ({
      taskId,
      previousStatus: 'IN_PROGRESS' as const,
    }));

    say(
      `КРАСНЫЙ CI: задача ${settled.taskId} не принята — ${settled.result.reason} ` +
        `Конвейер заморожен, приостановлено исполнителей: ${String(inFlight.length)}. ` +
        'Продолжение — только «Возобновить».',
      'ERROR',
    );

    await freezePipeline(database, deps.engine, {
      projectId,
      projectDirectory,
      taskId: settled.taskId,
      reason: settled.result.reason,
      inFlight,
    });
  }
}

/**
 * Снятие блокировки возвращает конвейер в строй само (А-42 п.3).
 *
 * Тот же класс, что «без нажатий» (А-38 п.1): человек УЖЕ принял решение — прочитал `BLOCKED_*.md`,
 * сделал, что там просили, и удалил файл. Требовать после этого второго действия — дефект, а не
 * безопасность. Само снятие остаётся человеческим по определению: файл удаляет человек.
 *
 * Идущему проходу этого вызова не нужно — доска перечитывается каждым проходом, и разблокированную
 * задачу он возьмёт сам; отказ «один водитель на проект» (D-329) отработает молча. Вызов нужен для
 * обычного случая, когда проход уже закончился: заблокированная задача ждала человека, а ждать
 * больше нечего.
 */
export function resumeAfterUnblock(
  projectId: string,
  projectDirectory: string,
  deps: OrchestratorDeps,
): void {
  if (livePipelines().has(projectId)) return;

  void driveProject(projectId, projectDirectory, deps).catch((error: unknown) => {
    deps.logger.write({
      projectId,
      agentRole: 'ORCHESTRATOR',
      logLevel: 'ERROR',
      message:
        'Продолжение после снятия блокировки упало: ' +
        (error instanceof Error ? error.message : String(error)),
    });
  });
}

/** How often a frozen or throttled pipeline looks up to see whether the world has changed. */
export const FREEZE_POLL_MS = 1_000;

/**
 * How many times one task may be handed back over style before it is a verdict (task 161).
 *
 * Two, and the number is an argument about who is failing. Once is an executor that forgot to run
 * the formatter — ordinary, and cheap to fix. Twice is an executor that cannot satisfy the
 * project's own tooling, and a third attempt would be the loop hoping rather than deciding. The
 * ceiling belongs to the run, not to the task: a restart hands the assignment to a new executor,
 * which starts even.
 */
export const MAX_CONTROLLER_RETURNS = 2;
