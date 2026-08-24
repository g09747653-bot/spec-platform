import { existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';

import type { Chain } from '../llm/chain.ts';
import type { Logger } from '../observability/log.ts';
import { research, researchForPrompt } from './researcher.ts';

import { classifyArtifact, type ArtifactClass } from './artifact-class.ts';
import { buildAssignment } from './assignments.ts';
import {
  HANDOFF,
  HandoffTask,
  importHandoff,
  readTaskFile,
  taskFileName,
  writeHandoff,
  type TechStack,
} from './handoff.ts';
import {
  describeSlice,
  sliceMilestones,
  type SliceResult,
  type SlicedMilestone,
} from './milestones.ts';
import {
  describeCensus,
  judgeFeasibility,
  planConditions,
  type FeasibilityRecord,
} from './feasibility.ts';
import { PLAN_REVIEW_FILE, readPlanReview, readSeed } from './plan-review.ts';
import { readBundle, type Bundle } from './validate.ts';
import { buildWholeArtifactPlan } from './whole-artifact-plan.ts';

/**
 * Taking a bundle in and turning it into a runnable plan (task 156).
 *
 * The whole movement in one function, in the order that makes it recoverable: validate, slice
 * (code, not model), write the assignments to disk, then index them in the database. Disk before
 * database, always — a database row referring to an assignment nobody wrote is a plan the loop
 * cannot recover from, while an assignment on disk that the database has not seen yet is repaired
 * by the next import.
 */

export class IntakeRefused extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IntakeRefused';
  }
}

export interface IntakeRequest {
  /** `<WORKSPACE_ROOT_PATH>/<projectId>` — where `bundle/` sits and `handoff/` will. */
  projectDirectory: string;
  projectTitle?: string;
  techStack?: TechStack;
  /**
   * Throw the handoff tree away and write it again from scratch (task 172).
   *
   * The operator's explicit act, never a resume's side effect: it costs a model call per task and it
   * replaces the brief every executor is working from. Refused outright while any task is in
   * progress or frozen — rewriting the assignment under a running container is how a report comes
   * back describing work nobody asked for.
   */
  regenerate?: boolean;
}

export interface IntakeDeps {
  database: DatabaseSync;
  logger: Logger;
  /** Absent means «no provider configured»; the assignments are then written deterministically. */
  chain: Chain | null;
  /**
   * The researcher's chain, when it is configured differently from the architect's (task 161).
   *
   * Absent means «the same one», which is the default the amendment asks for: every role runs on the
   * executor's own vendor unless the operator says otherwise.
   */
  researchChain?: Chain | null;
}

export interface IntakeResult {
  projectId: string;
  bundleId: string;
  strategy: 'dependencies' | 'phases';
  milestones: number;
  tasks: HandoffTask[];
  /** How many assignments the model wrote, and how many fell back to the bundle's own text. */
  writtenByModel: number;
  /** Assignments already on disk, kept verbatim and never sent to a model (task 172). */
  keptFromDisk: number;
  /** True when this intake threw the previous tree away first. */
  regenerated: boolean;
  /**
   * Класс задумки, под который писался план (А-36 п.1).
   *
   * Уезжает наружу, чтобы суд формы не спрашивал модель второй раз об уже решённом: интейк
   * классифицирует, суд принимает класс готовым. `unknown` — суд класса не состоялся.
   */
  artifactClass: ArtifactClass | 'unknown';
  /**
   * Суждение о выполнимости задумки, вынесенное ДО плана (А-42 п.2).
   *
   * Уезжает наружу, потому что объявить его владельцу обязан маршрут, а не интейк: расхождения
   * называются ДО сборки, первым сообщением (А-39), и алерт — дело шлюза. `null` — суждение не
   * состоялось, причина уже названа в ленте.
   */
  feasibility: FeasibilityRecord | null;
  degradations: string[];
}

/** Marker files the tech-stack guess reads. The gate's own detection (task 157) refines it. */
function guessTechStack(projectDirectory: string): TechStack {
  const has = (name: string) => existsSync(join(projectDirectory, name));

  if (has('package.json')) return 'nodejs';
  if (has('requirements.txt') || has('pyproject.toml')) return 'python';
  if (has('go.mod')) return 'go';
  if (has('Cargo.toml')) return 'rust';
  return 'generic';
}

export async function intakeBundle(
  request: IntakeRequest,
  deps: IntakeDeps,
): Promise<IntakeResult> {
  const { database, logger, chain } = deps;

  const bundle: Bundle = readBundle(join(request.projectDirectory, 'bundle'));
  const projectId = bundle.projectId;

  /*
   * The project row exists before the first log line, because `agent_logs` has a foreign key to it
   * — and a loop whose first act is «report what I am doing» must be able to.
   */
  database
    .prepare(
      `INSERT INTO projects (project_id, title, description, status, workspace_dir)
       VALUES (?, ?, ?, 'ACTIVE', ?)
       ON CONFLICT (project_id) DO UPDATE SET
         title = excluded.title,
         workspace_dir = COALESCE(excluded.workspace_dir, projects.workspace_dir)`,
    )
    .run(
      projectId,
      request.projectTitle ?? projectId,
      'Импортирован из машинного бандла Spec Platform',
      /*
       * **Absolute, always** (task 160). The column is read back by an endpoint that resolves paths
       * against `WORKSPACE_ROOT_PATH`, so a relative value stored here would be joined to the root a
       * second time and point at a directory that does not exist. Whoever calls the intake may say
       * it either way; what is written down has one meaning.
       */
      resolve(request.projectDirectory),
    );

  const say = (message: string, level: 'INFO' | 'WARN' | 'ERROR' = 'INFO') => {
    logger.write({ projectId, agentRole: 'ARCHITECT', logLevel: level, message });
  };

  say(`Принят бандл ${bundle.bundleId}: задач ${String(bundle.tasks.length)}.`);

  /*
   * Пробелы, названные суду ПРОШЛОГО плана, переживают его снос (А-36 п.1, находка прогона).
   *
   * Вердикт уходит вместе с деревом — он описывает план, которого больше нет, ровно по тому же
   * закону, по которому уходят отчёты. Но его СОДЕРЖАНИЕ — единственное, что контур уже знает о
   * том, чего плану не хватало, и оно едет в промпт нового плана. Иначе «перегенерировать» —
   * подбрасывание монеты: суд назвал, автор не услышал, план вышел тот же.
   */
  const carriedGaps =
    request.regenerate === true ? (readPlanReview(request.projectDirectory)?.gaps ?? []) : [];

  if (request.regenerate === true) {
    const wiped = wipeHandoffTree(request.projectDirectory);
    say(
      `Полная перегенерация по явной команде оператора: снесено заданий ${String(wiped)}, ` +
        'отчёты и вердикт суда плана удалены вместе с ними. Задания будут написаны заново.',
      'WARN',
    );

    if (carriedGaps.length > 0) {
      say(
        `Пробелы прошлого суда плана (${String(carriedGaps.length)}) переданы автору нового плана ` +
          'как обязательное покрытие — названный пробел возвращается тому, кто его допустил.',
        'WARN',
      );
    }
  }

  const techStack = request.techStack ?? guessTechStack(request.projectDirectory);

  /*
   * The researcher, once per intake and before the first assignment is written (task 161). Its
   * report goes into every assignment's prompt and onto the disk the executors mount, so the
   * architect and the executors read the same account of the workspace.
   */
  const surveyed = await research(
    request.projectDirectory,
    deps.researchChain === undefined ? chain : deps.researchChain,
  );
  say(
    `Исследователь: записей в дереве ${String(surveyed.survey.tree.length)}, ` +
      `манифестов ${String(surveyed.survey.manifests.length)}` +
      (surveyed.writtenBy === null
        ? '. Справку писал не провайдер — только снимок диска.'
        : `. Справку написал провайдер ${surveyed.writtenBy}.`),
  );

  /*
   * **Класс задумки — ДО плана, а не после него** (А-36 п.1).
   *
   * Суд формы (А-35 п.2а) стоит между интейком и конвейером и умеет одно: забраковать нарезку
   * связного артефакта. Владельцу оставалось «продолжить с пробелами» — то есть исполнить ровно ту
   * нарезку, из-за которой суд и появился. Класс, спрошенный здесь, решает не «годен ли план», а
   * «КАКОЙ план писать»: под цельный артефакт пишется цельно-артефактная форма, под систему —
   * прежняя, по записи на задачу бандла.
   *
   * Спрошено один раз за интейк: класс уезжает в `IntakeResult`, и суд полноты его больше не
   * переспрашивает. Не определился — прежнее поведение, как для системы (именованная деградация).
   */
  const seed = readSeed(request.projectDirectory);
  const degradations: string[] = [];
  let artifactClass: ArtifactClass | 'unknown' = 'unknown';

  if (seed === null) {
    say('Класс задумки не определялся: SEED.md в рабочей директории нет.', 'WARN');
  } else if (chain === null) {
    say('Класс задумки не определялся: провайдер роли архитектора не настроен.', 'WARN');
  } else {
    const classified = await classifyArtifact(seed, chain);

    if (classified.status === 'classified') {
      artifactClass = classified.artifactClass;
      say(
        `Класс задумки: ${
          classified.artifactClass === 'coherent-artifact'
            ? 'связный визуальный артефакт одного контекста'
            : 'система'
        } (определил ${classified.judgedBy}).`,
      );
    } else {
      say(
        `Класс задумки не определён: ${classified.reason}. ` +
          'План пишется по общему правилу (как для системы).',
        'WARN',
      );
    }
  }

  /*
   * **Суждение о выполнимости — здесь, между классом и планом** (А-42 п.2).
   *
   * Место выбрано не по удобству: суждение обязано родиться ДО плана, потому что план обязан нести
   * его условиями (иначе полировка погонится за недостижимым — урок D-323), и ДО сборки, потому что
   * расхождения называются заранее, а не после показа продукта (А-39). Между классом и планом —
   * единственная точка, где выполнены оба.
   *
   * Оно ничего не останавливает: невыполнимость части задумки не ошибка, а факт, который называют и
   * обходят. Не состоялось — именованная деградация, как у всякой модельной роли (D-229).
   */
  const judged = await judgeFeasibility({
    projectDirectory: request.projectDirectory,
    seed,
    chain,
  });
  const feasibility = judged.status === 'judged' ? judged.record : null;

  if (judged.status === 'skipped') {
    say(`Суждение о выполнимости не вынесено: ${judged.reason}. План пишется без условий.`, 'WARN');
    /*
     * Запуск БЕЗ задумки деградацией не считается — как и у класса артефакта: судить не по чему,
     * а не «судили хуже обычного». Деградация — это когда задумка есть, а суждения по ней нет.
     */
    if (seed !== null) degradations.push(`суждение о выполнимости: ${judged.reason}`);
  } else {
    const feasibility = judged.record;
    say(
      `Суждение о выполнимости (судил ${feasibility.judgedBy}): ${feasibility.verdict}. ` +
        `Воспроизводимо пунктов: ${String(feasibility.reproducible.length)}, ` +
        `недостижимо: ${String(feasibility.outOfReach.length)}. ` +
        describeCensus(feasibility.material) +
        ' Перечень целиком — в handoff/FEASIBILITY.json и в алерте владельцу.',
      feasibility.verdict === 'полностью' ? 'INFO' : 'WARN',
    );

    /* Каждое недостижимое — своей строкой: перечень, читаемый в ленте, а не сноска к числу. */
    for (const entry of feasibility.outOfReach) {
      say(`Не воспроизводится: ${entry.what} (${entry.why}). Взамен: ${entry.instead}`, 'WARN');
    }
  }

  const conditions = feasibility === null ? [] : planConditions(feasibility);

  const tasks: HandoffTask[] = [];
  let writtenByModel = 0;
  let keptFromDisk = 0;
  let slice: SliceResult;

  /*
   * Ветка класса не переписывает план, уже лежащий на диске: по нему исполнитель мог начать
   * работу, и замена плана под ним — это доклад о работе, которой никто не заказывал (тот же
   * закон, что у `mergeWithDisk`). Замена плана — явный акт оператора: `regenerate` сносит дерево
   * выше, и тогда ветка пишет заново.
   */
  const existingTree = countAssignments(request.projectDirectory);

  if (artifactClass === 'coherent-artifact' && seed !== null && existingTree === 0) {
    const plan = await buildWholeArtifactPlan({
      seed,
      context: {
        architecture: bundle.architecture,
        bundleTitles: bundle.tasks.map((task) => task.title),
        research: researchForPrompt(surveyed.report),
        techStack,
        mustCover: carriedGaps,
        conditions,
      },
      chain,
      knownArtifactFiles: surveyed.survey.tree,
      scope: milestoneScope(projectId),
    });

    slice = sliceMilestones(plan.tasks, milestoneScope(projectId));
    say(describeSlice(slice), slice.ok ? 'INFO' : 'ERROR');
    if (!slice.ok) throw new IntakeRefused(describeSlice(slice));

    const milestoneOf = milestoneIndex(slice.milestones);

    for (const planned of plan.tasks) {
      const milestone = milestoneOf.get(planned.taskId);
      if (milestone === undefined) {
        throw new IntakeRefused(
          `задача ${planned.taskId} не попала ни в одну веху — это дефект нарезки`,
        );
      }

      tasks.push(
        HandoffTask.parse({
          taskId: planned.taskId,
          milestoneId: milestone.milestoneId,
          title: planned.title,
          description: planned.description,
          techStack,
          filesToEdit: planned.filesToEdit,
          dependsOn: planned.dependsOn,
          ...(planned.unitTestCmd === undefined ? {} : { unitTestCmd: planned.unitTestCmd }),
          ...(planned.e2eTestCmd === undefined ? {} : { e2eTestCmd: planned.e2eTestCmd }),
          ...(planned.iterationTimeoutSec === undefined
            ? {}
            : { iterationTimeoutSec: planned.iterationTimeoutSec }),
          expectedArtifacts: [],
          status: 'PENDING',
        }),
      );
    }

    const owner = plan.tasks.find((planned) => planned.role === 'whole');

    if (plan.writtenBy === null) {
      const reason = plan.degradedBecause ?? 'причина не названа';
      degradations.push(`цельно-артефактный план: ${reason}`);
      say(`Цельно-артефактный план написан скелетом кода (${reason}).`, 'WARN');
    } else {
      writtenByModel = tasks.length;
      say(
        `Цельно-артефактный план написал провайдер ${plan.writtenBy}: задач ` +
          `${String(tasks.length)}, артефактом целиком владеет ` +
          `${owner?.taskId ?? '—'} («${owner?.title ?? '—'}»).`,
      );
    }

    if (plan.retriedBecause.length > 0) {
      say(
        `План переспрошен с названными пробелами формы (${String(plan.retriedBecause.length)}): ` +
          plan.retriedBecause.join(' / '),
        'WARN',
      );
    }
  } else if (artifactClass === 'coherent-artifact' && existingTree > 0) {
    /*
     * **Возобновление цельного плана: план на диске И ЕСТЬ план** (D-326, находка живого прогона).
     *
     * Прежде здесь стояло только предупреждение, а дальше шла общая ветка — и она резала БАНДЛ,
     * дописывая сорок шесть заданий нарезки рядом с шестью цельными. Сторож защищал цельный план
     * от перезаписи и не защищал от ДОБАВЛЕНИЯ поверх него ровно той нарезки, против которой класс
     * заведён; каждое такое задание к тому же стоило модельного вызова.
     *
     * Возобновление не спрашивает модель ни о чём: задания читаются с диска дословно, вехи
     * пересчитываются кодом из их же зависимостей. Это и есть «диск — источник правды», доведённое
     * до конца: перезаход по готовому плану обязан быть дешёвым и не иметь мнения.
     */
    const onDisk = readPlannedTree(request.projectDirectory);

    slice = sliceMilestones(onDisk, milestoneScope(projectId));
    say(describeSlice(slice), slice.ok ? 'INFO' : 'ERROR');
    if (!slice.ok) throw new IntakeRefused(describeSlice(slice));

    const milestoneOf = milestoneIndex(slice.milestones);

    for (const task of onDisk) {
      const milestone = milestoneOf.get(task.taskId);
      if (milestone === undefined) {
        throw new IntakeRefused(
          `задача ${task.taskId} не попала ни в одну веху — это дефект нарезки`,
        );
      }
      tasks.push(task);
    }

    keptFromDisk = onDisk.length;
    say(
      `Возобновление по цельному плану с диска: заданий ${String(onDisk.length)}, ` +
        'модель не спрошена ни разу — бандл при живом цельном плане не режется.',
    );
  } else {
    slice = sliceMilestones(bundle.tasks, milestoneScope(projectId));
    say(describeSlice(slice), slice.ok ? 'INFO' : 'ERROR');
    if (!slice.ok) throw new IntakeRefused(describeSlice(slice));

    const milestoneOf = milestoneIndex(slice.milestones);

    for (const task of bundle.tasks) {
      const milestone = milestoneOf.get(task.taskId);
      if (milestone === undefined) {
        throw new IntakeRefused(
          `задача ${task.taskId} не попала ни в одну веху — это дефект нарезки`,
        );
      }

      /*
       * **An assignment that already exists is not written again** (task 172).
       *
       * Not merely because rewriting it costs a model call per task on every resume — though it does,
       * and the M15а gate spent a free tier discovering that — but because the file is what an executor
       * may already be working from. `writeHandoff` keeps its prose whatever arrives here; skipping the
       * call is the same rule applied one step earlier, where it also saves the money.
       */
      const onDisk = readTaskFile(
        join(request.projectDirectory, HANDOFF.tasks, taskFileName(task.taskId)),
      );

      if (onDisk !== null) {
        tasks.push(onDisk);
        keptFromDisk += 1;
        continue;
      }

      const built = await buildAssignment(
        task,
        milestone,
        {
          architecture: bundle.architecture,
          techStack,
          research: researchForPrompt(surveyed.report),
        },
        chain,
      );

      tasks.push(built.task);

      if (built.writtenBy === null) {
        const reason = built.degradedBecause ?? 'причина не названа';
        degradations.push(`${task.taskId}: ${reason}`);
        say(`Задание ${task.taskId} написано без модели (${reason}).`, 'WARN');
      } else {
        writtenByModel += 1;
        say(`Задание ${task.taskId} написано провайдером ${built.writtenBy}.`);
      }
    }

    if (keptFromDisk > 0) {
      say(
        `Заданий сохранено с диска без изменений: ${String(keptFromDisk)} — ` +
          'по ним исполнитель уже мог начать работу, и модель их не переписывает.',
      );
    }
  }

  mkdirSync(join(request.projectDirectory, HANDOFF.reports), { recursive: true });
  writeHandoff(request.projectDirectory, slice.milestones, tasks, projectId);

  const pruned = pruneVanishedTasks(database, projectId, tasks);
  if (pruned > 0) {
    say(
      `Индекс приведён к дереву: снято строк задач, которых на диске больше нет — ` +
        `${String(pruned)}. Диск — источник правды.`,
      'WARN',
    );
  }

  importHandoff(
    database,
    projectId,
    request.projectTitle ?? projectId,
    slice.milestones,
    tasks,
    resolve(request.projectDirectory),
  );

  say(
    `Handoff записан: вех ${String(slice.milestones.length)}, заданий ${String(tasks.length)}, ` +
      `стек ${techStack}. Диск — источник правды, база — индекс.`,
  );

  return {
    projectId,
    bundleId: bundle.bundleId,
    strategy: slice.strategy,
    milestones: slice.milestones.length,
    tasks,
    writtenByModel,
    keptFromDisk,
    regenerated: request.regenerate === true,
    artifactClass,
    feasibility,
    degradations,
  };
}

/**
 * Область идентификаторов вех — короткий хвост проекта (D-324).
 *
 * Короткий намеренно: идентификатор вехи читает человек в ленте и в доске, и `ms_9c57b180_01`
 * ещё читаемо, а полный UUID — уже нет. Восьми знаков хватает: столкнуться должны два проекта
 * одного контура, а не два проекта на свете.
 */
function milestoneScope(projectId: string): string {
  return projectId.replace(/[^A-Za-z0-9]/g, '').slice(0, 8);
}

/**
 * Задания, уже лежащие на диске, дословно (D-326).
 *
 * Нечитаемый файл — не «пустая задача», а названный отказ: молча потерять задание значит вернуть
 * конвейеру план, которого никто не писал.
 */
function readPlannedTree(projectDirectory: string): HandoffTask[] {
  const tasksDirectory = join(projectDirectory, HANDOFF.tasks);
  const names = readdirSync(tasksDirectory)
    .filter((name) => name.startsWith('task_') && name.endsWith('.json'))
    .sort();

  const tasks: HandoffTask[] = [];

  for (const name of names) {
    const task = readTaskFile(join(tasksDirectory, name));
    if (task === null) {
      throw new IntakeRefused(
        `задание ${name} на диске не читается — возобновлять по нему нельзя; ` +
          'перепишите план явной командой оператора (regenerate)',
      );
    }
    tasks.push(task);
  }

  return tasks;
}

/** Заданий на диске сейчас — по ним решается, переписывать ли план (А-36 п.1). */
function countAssignments(projectDirectory: string): number {
  const tasksDirectory = join(projectDirectory, HANDOFF.tasks);
  if (!existsSync(tasksDirectory)) return 0;

  return readdirSync(tasksDirectory).filter(
    (name) => name.startsWith('task_') && name.endsWith('.json'),
  ).length;
}

/** Задача → её веха. Один индекс на обе ветки плана, чтобы «дефект нарезки» ловился одинаково. */
function milestoneIndex(milestones: readonly SlicedMilestone[]): Map<string, SlicedMilestone> {
  const index = new Map<string, SlicedMilestone>();
  for (const milestone of milestones) {
    for (const taskId of milestone.taskIds) index.set(taskId, milestone);
  }
  return index;
}

/**
 * Строки индекса, которых в дереве больше нет, — вон (А-36 п.1).
 *
 * База — индекс диска, и до этой правки расхождение было невозможно: перегенерация писала
 * задания с теми же идентификаторами, что снесла. Ветка цельного артефакта ЗАМЕЩАЕТ план целиком,
 * и её `WA01…` не совпадают с `T001…` бандла — сорок пять строк прошлого плана остались бы в
 * индексе исполнимыми задачами, которых нет на диске. Каскад по внешнему ключу уносит их итерации
 * и отчёты вместе с ними; сами отчёты лежат в `handoff/reports` и не индексом хранятся.
 */
function pruneVanishedTasks(
  database: DatabaseSync,
  projectId: string,
  tasks: readonly HandoffTask[],
): number {
  const alive = new Set(tasks.map((task) => task.taskId));

  const rows = database
    .prepare('SELECT task_id AS taskId FROM tasks WHERE project_id = ?')
    .all(projectId) as { taskId: string }[];

  const vanished = rows.map((row) => row.taskId).filter((taskId) => !alive.has(taskId));
  if (vanished.length === 0) return 0;

  /* Пара `(project_id, task_id)` — иначе чистка своего плана унесла бы одноимённую задачу соседа. */
  const remove = database.prepare('DELETE FROM tasks WHERE project_id = ? AND task_id = ?');
  for (const taskId of vanished) remove.run(projectId, taskId);

  return vanished.length;
}

/** Statuses that mean somebody is holding this task right now. */
const IN_HAND: readonly HandoffTask['status'][] = ['IN_PROGRESS', 'PAUSED'];

/**
 * Throws the handoff tree away, or refuses to (task 172).
 *
 * Refusal comes first and is absolute: an assignment rewritten under a running executor is a
 * container working from one brief while the orchestrator judges it against another. `PAUSED` counts
 * as in hand for the same reason — a frozen task is one somebody intends to resume (task 160).
 *
 * Reports go with the assignments. A report describes a brief; kept beside a regenerated one it
 * would describe a brief that no longer exists, which is worse than no report at all.
 */
function wipeHandoffTree(projectDirectory: string): number {
  const tasksDirectory = join(projectDirectory, HANDOFF.tasks);
  if (!existsSync(tasksDirectory)) return 0;

  const names = readdirSync(tasksDirectory).filter(
    (name) => name.startsWith('task_') && name.endsWith('.json'),
  );

  const held = names
    .map((name) => readTaskFile(join(tasksDirectory, name)))
    .filter((task): task is HandoffTask => task !== null && IN_HAND.includes(task.status));

  if (held.length > 0) {
    throw new IntakeRefused(
      'полная перегенерация отказана: в работе ' +
        `${String(held.length)} задач(и) — ${held.map((task) => task.taskId).join(', ')}. ` +
        'Дождитесь их завершения или снимите их вручную.',
    );
  }

  for (const name of names) rmSync(join(tasksDirectory, name), { force: true });
  rmSync(join(projectDirectory, HANDOFF.milestones), { force: true });
  rmSync(join(projectDirectory, HANDOFF.reports), { recursive: true, force: true });

  /*
   * Вердикт суда плана уходит с планом — по тому же доводу, что и отчёты. Оставленный рядом с
   * переписанным планом он и судил бы не его: гейт прочёл бы «пробелы без решения» и остановил бы
   * запуск свежего плана, ни разу его не увидев.
   */
  rmSync(join(projectDirectory, PLAN_REVIEW_FILE), { force: true });

  return names.length;
}
