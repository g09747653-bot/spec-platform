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
import { judgeScope, SCOPE_BUDGET_UNITS, scopeExclusions, type ScopeRecord } from './scope.ts';
import { readBundle, type Bundle, type BundleTask } from './validate.ts';
import { buildWholeArtifactPlan } from './whole-artifact-plan.ts';
import { DEFAULT_INTAKE_CONCURRENCY, mapWithLimit } from './fan-out.ts';
import {
  calibratedBudget,
  calibrationCoefficient,
  describeCalibration,
  readCalibration,
} from './calibration.ts';
import { stampLedger } from '../gate/measurement.ts';

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
  /**
   * Сколько заданий пишется РАЗОМ (А-51 п.3).
   *
   * Без него — `DEFAULT_INTAKE_CONCURRENCY`. Ноль и отрицательное значение веер приводит к
   * единице сам: «параллельность, выключенная опечаткой» должна быть последовательностью, а не
   * остановкой.
   */
  concurrency?: number;
}

/**
 * Сколько заняла одна стадия интейка и сколько модельных вызовов она стоила (А-51 п.3).
 *
 * **Замер стоит первым, а не после правки.** Мандат требует распараллелить планирование, но
 * оптимизировать вслепую нельзя: 127,4 секунды интейка — это сумма шести разных работ, и пока не
 * видно, какая из них чего стоит, ускорение одной может оказаться шумом на фоне другой. Спан —
 * тот же приём, что у замера параллельности (`bench/parallel-measure.ts`): концы отрезка совпадают
 * с настоящими концами работы, а не с опросом сбоку.
 */
export interface IntakeStageSpan {
  stage: string;
  startedAt: number;
  endedAt: number;
  /** Модельных вызовов стадии. Ноль — стадия решалась кодом или не состоялась. */
  calls: number;
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
  /**
   * Суждение об объёме, вынесенное ДО плана (А-44 п.4).
   *
   * Уезжает наружу по той же причине, что и выполнимость: сокращение объявляет владельцу маршрут
   * ОДНИМ алертом вместе с ним — два сообщения об одном решении читались бы как два решения.
   */
  scope: ScopeRecord | null;
  degradations: string[];
  /** Разбивка стены интейка по стадиям — публикуемое число, воротами не бывает (А-51 п.3). */
  stages: IntakeStageSpan[];
}

/** Разбивка одной строкой: что сколько заняло и сколько вызовов стоило. */
export function describeStages(stages: readonly IntakeStageSpan[]): string {
  const total = stages.reduce((sum, span) => sum + (span.endedAt - span.startedAt), 0);
  const calls = stages.reduce((sum, span) => sum + span.calls, 0);

  const parts = stages.map((span) => {
    const ms = span.endedAt - span.startedAt;
    const share = total === 0 ? 0 : Math.round((ms / total) * 100);
    return (
      `${span.stage} ${String(Math.round(ms / 100) / 10)} с (${String(share)}%, ` +
      `вызовов ${String(span.calls)})`
    );
  });

  return (
    `Разбивка интейка по стадиям: ${parts.join('; ')}. ` +
    `Всего ${String(Math.round(total / 100) / 10)} с и ${String(calls)} модельных вызовов. ` +
    'Числа публикуются как есть; воротами они не становятся.'
  );
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

  /*
   * Спаны стадий (А-51 п.3). Концы отрезка — настоящие концы работы: `finally`, чтобы упавшая
   * стадия тоже попала в разбивку своим временем, а не исчезла из неё вместе с интейком.
   */
  const stages: IntakeStageSpan[] = [];

  async function timeStage<T>(
    stage: string,
    run: () => Promise<T>,
    calls: (value: T) => number = () => 0,
  ): Promise<T> {
    const startedAt = Date.now();
    let value: T | undefined;
    try {
      value = await run();
      return value;
    } finally {
      stages.push({
        stage,
        startedAt,
        endedAt: Date.now(),
        calls: value === undefined ? 0 : calls(value),
      });
    }
  }

  say(`Принят бандл ${bundle.bundleId}: задач ${String(bundle.tasks.length)}.`);

  /*
   * **Книга замеров клеймится владельцем ДО первой стадии** (А-51 п.1).
   *
   * Побочное следствие переноса книги наружу: она переживает снос рабочей директории, и проект,
   * пересозданный под тем же именем каталога, унаследовал бы чужую базовую линию сходимости. Здесь
   * — единственное место, знающее, ЧЕЙ это план; здесь и решается, продолжается ли цепочка
   * полировок или начинается заново.
   */
  const stamp = stampLedger(request.projectDirectory, { projectId, bundleId: bundle.bundleId });

  if (stamp.status === 'reset') {
    say(
      `Книга замеров контура заведена заново: она принадлежала бандлу ${stamp.previous?.bundleId ?? '—'} ` +
        `проекта ${stamp.previous?.projectId ?? '—'}, а этот заход — бандла ${bundle.bundleId}. ` +
        `Снято прошлых базовых линий: ${String(stamp.dropped)}. Сходимость чужого плана нашему не ориентир.`,
      'WARN',
    );
  }
  if (stamp.status === 'unreadable') {
    say(
      `Книга замеров контура не читается: ${stamp.reason}. Задачи с замером будут краснеть, пока ` +
        'книгу не починят или не снесут — тихого прохода по потерянному прошлому не будет.',
      'ERROR',
    );
  }

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
  const surveyed = await timeStage(
    'исследование',
    () =>
      research(
        request.projectDirectory,
        deps.researchChain === undefined ? chain : deps.researchChain,
      ),
    (value) => (value.writtenBy === null ? 0 : 1),
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
    const classified = await timeStage(
      'класс задумки',
      () => classifyArtifact(seed, chain),
      () => 1,
    );

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
  const judged = await timeStage(
    'выполнимость',
    () =>
      judgeFeasibility({
        projectDirectory: request.projectDirectory,
        seed,
        chain,
      }),
    (value) => (value.status === 'judged' ? 1 : 0),
  );
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

  /*
   * **Суждение об ОБЪЁМЕ — сразу за выполнимостью, до плана** (А-44 п.4).
   *
   * Пара к суждению о выполнимости и та же его половина, которой не было: выполнимость судит
   * МАТЕРИАЛ («этого нельзя»), объём судит БЮДЖЕТ («на это не хватит»). Замер заказчика на двух
   * прогонах одного контура: у NEURA 44 ссылки и ни одной в никуда, у копии — 86 и 74 в никуда.
   * Разница не в мастерстве: одна сессия ВЫБИРАЛА СЕБЕ ОБЪЁМ и доводила всё, что начинала.
   *
   * Сокращение ДО сборки — выбор; сокращение ПОСЛЕ — заглушка. Поэтому плану уезжает уже суженный
   * объём, а не полный бриф с надеждой.
   */
  /*
   * **Бюджет объёма правится ИЗМЕРЕННЫМ коэффициентом** (вердикт §10.4). Стартовая константа —
   * аналогия (44 ссылки одного сайта при шире определённой единице), и подпирать её второй
   * аналогией было бы гаданием по гаданию. Журнал калибровки сравнивает предсказание модели с
   * фактом четвёртой оси суда; коэффициент применяется с третьего прогона, а до него говорится,
   * что поправлять пока не на что.
   */
  const journal = readCalibration(request.projectDirectory);
  const coefficient = calibrationCoefficient(journal);
  const budgetUnits = calibratedBudget(SCOPE_BUDGET_UNITS, coefficient);

  say(describeCalibration(SCOPE_BUDGET_UNITS, journal, coefficient));

  const scoped = await timeStage(
    'объём',
    () =>
      judgeScope({
        projectDirectory: request.projectDirectory,
        seed,
        titles: bundle.tasks.map((task) => task.title),
        chain,
        budgetUnits,
      }),
    (value) => (value.status === 'judged' ? 1 : 0),
  );
  const scope = scoped.status === 'judged' ? scoped.record : null;

  if (scoped.status === 'skipped') {
    say(`Суждение об объёме не вынесено: ${scoped.reason}. План пишется на полный бриф.`, 'WARN');
    if (seed !== null) degradations.push(`суждение об объёме: ${scoped.reason}`);
  } else {
    say(
      `Суждение об объёме (судил ${scoped.record.judgedBy}): ${scoped.record.verdict}. ` +
        `Бюджет ${String(scoped.record.budgetUnits)} единиц, бриф просит ` +
        `${String(scoped.record.plannedUnits)}; довожу ${String(scoped.record.kept.length)} пунктов ` +
        `(${String(scoped.record.keptUnits)}), не берусь за ${String(scoped.record.cut.length)} ` +
        `(${String(scoped.record.cutUnits)}). Перечень — в handoff/SCOPE.json и в алерте владельцу.`,
      scoped.record.verdict === 'полностью' ? 'INFO' : 'WARN',
    );

    /*
     * Случай «даже самое главное дороже бюджета» — своей строкой (А-51 п.3). Прежде он молча
     * становился «полностью» и владельцу говорили «укладывается в отпущенное: 500 единиц при
     * бюджете 10», то есть прямо противоположное правде.
     */
    if (scoped.record.verdict === 'сверх бюджета') {
      say(
        `Даже САМОЕ ГЛАВНОЕ дороже бюджета: «${scoped.record.kept[0]?.title ?? '—'}» стоит ` +
          `${String(scoped.record.keptUnits)} единиц при бюджете ${String(scoped.record.budgetUnits)}. ` +
          'Берусь за него одного и говорю об этом заранее — заглушки на остальные места не ставятся.',
        'WARN',
      );
    }

    for (const item of scoped.record.cut) {
      say(`Не берусь: ${item.title} (${item.necessity}) — ${item.why}`, 'WARN');
    }
    if (scoped.record.unestimated.length > 0) {
      say(
        `Пункты, которые модель не оценила (взята цена по умолчанию): ` +
          scoped.record.unestimated.join(', '),
        'WARN',
      );
    }
  }

  /*
   * Условия плана — из обоих суждений. Разница между ними существенна и сохраняется дословно: у
   * выполнимости названы недостижимое И ЗАМЕНА ему, у объёма — только запрет. Замена сокращённому
   * пункту и была бы той заглушкой, ради запрета которой стадия заведена.
   */
  const conditions = [
    ...(feasibility === null ? [] : planConditions(feasibility)),
    ...(scope === null ? [] : scopeExclusions(scope)),
  ];

  /* Плану уезжает уже суженный охват, а не полный бриф. */
  const coverage =
    scope === null ? bundle.tasks.map((task) => task.title) : scope.kept.map((item) => item.title);

  /*
   * **Суженный охват действует и на ОБЩЕЙ ветке** (А-51 п.3).
   *
   * Прежде `coverage` и `conditions` потреблялись исключительно внутри ветки цельного артефакта, а
   * общая шла по ПОЛНОМУ бандлу и звала `buildAssignment` без единого условия — то есть в обоих
   * замерных прогонах стадия объёма была чисто декларативной: судила, писала SCOPE.json, говорила
   * владельцу и ни на что не влияла.
   *
   * Сокращение здесь означает буквально «задачи нет в плане»: `scopeExclusions` запрещает ставить
   * на её место заглушку, а задание, которое всё-таки написано, — это и есть приглашение поставить.
   *
   * **С одной оговоркой, и она обязательна: сокращённая задача, от которой ЗАВИСИТ удержанная,
   * остаётся.** Иначе нарезка вех получила бы висячую зависимость и отказала бы всему плану
   * (`sliceMilestones` → `dangling`), а «сокращение объёма» превратилось бы в «конвейер не
   * запускается». Зависимость от пункта означает, что он по существу основной, как бы его ни
   * оценила модель, — и об отмене сокращения говорится вслух.
   */
  const cutTitles = new Set((scope?.cut ?? []).map((item) => item.title));
  const planned: BundleTask[] = [];
  const dropped: BundleTask[] = [];
  const restored: BundleTask[] = [];

  if (cutTitles.size === 0) {
    planned.push(...bundle.tasks);
  } else {
    const keep = new Set(
      bundle.tasks.filter((task) => !cutTitles.has(task.title)).map((task) => task.taskId),
    );
    const byId = new Map(bundle.tasks.map((task) => [task.taskId, task]));

    /* Замыкание вниз по зависимостям: удержанное тянет за собой всё, чего оно ждёт. */
    for (let grew = true; grew;) {
      grew = false;
      for (const taskId of [...keep]) {
        for (const dependency of byId.get(taskId)?.dependsOn ?? []) {
          if (byId.has(dependency) && !keep.has(dependency)) {
            keep.add(dependency);
            grew = true;
          }
        }
      }
    }

    for (const task of bundle.tasks) {
      if (!cutTitles.has(task.title)) {
        planned.push(task);
      } else if (keep.has(task.taskId)) {
        planned.push(task);
        restored.push(task);
      } else {
        dropped.push(task);
      }
    }

    say(
      `Объём сужен и на общей ветке: из ${String(bundle.tasks.length)} задач бандла в план идут ` +
        `${String(planned.length)}, не берутся ${String(dropped.length)}. Сокращённой задаче ` +
        'задание не пишется вовсе — ни заглушки, ни декоративной ссылки на её место не ставится.',
      dropped.length === 0 ? 'INFO' : 'WARN',
    );

    for (const task of restored) {
      say(
        `Сокращение отменено для ${task.taskId} («${task.title}»): от неё зависят задачи, ` +
          'которые план оставляет. Зависимость и есть доказательство, что пункт основной.',
        'WARN',
      );
    }
  }

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
    const plan = await timeStage(
      'план',
      () =>
        buildWholeArtifactPlan({
          seed,
          context: {
            architecture: bundle.architecture,
            bundleTitles: coverage,
            research: researchForPrompt(surveyed.report),
            techStack,
            mustCover: carriedGaps,
            conditions,
          },
          chain,
          knownArtifactFiles: surveyed.survey.tree,
          scope: milestoneScope(projectId),
        }),
      (value) => (value.writtenBy === null ? 0 : 1 + value.retriedBecause.length),
    );

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
          /* Замер едет на задание частями — собирает из них прогон приёмка (А-44 п.1). */
          ...(planned.measurement === undefined ? {} : { measurement: planned.measurement }),
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
    slice = sliceMilestones(planned, milestoneScope(projectId));
    say(describeSlice(slice), slice.ok ? 'INFO' : 'ERROR');
    if (!slice.ok) throw new IntakeRefused(describeSlice(slice));

    const milestoneOf = milestoneIndex(slice.milestones);

    /*
     * **Фаза 1 — чтение диска, последовательно и без модели.**
     *
     * `readTaskFile` дёшев и синхронен; параллелить его нечего. Здесь же решается, какие задания
     * вообще пойдут в модель: задание, уже лежащее на диске, не переписывается (задача 172) — не
     * только потому, что перезапись стоит вызова на задачу при каждом перезаходе, но потому, что
     * файл есть то, из чего исполнитель мог уже начать работу.
     */
    const slots: { task: BundleTask; milestone: SlicedMilestone; onDisk: HandoffTask | null }[] =
      planned.map((task) => {
        const milestone = milestoneOf.get(task.taskId);
        if (milestone === undefined) {
          throw new IntakeRefused(
            `задача ${task.taskId} не попала ни в одну веху — это дефект нарезки`,
          );
        }

        return {
          task,
          milestone,
          onDisk: readTaskFile(
            join(request.projectDirectory, HANDOFF.tasks, taskFileName(task.taskId)),
          ),
        };
      });

    const toWrite = slots.filter((slot) => slot.onDisk === null);

    /*
     * **Фаза 2 — веер (А-51 п.3).**
     *
     * Десять независимых заданий писались десятью модельными вызовами ПО ОЧЕРЕДИ при нулевых
     * зависимостях между ними: `for (const task of bundle.tasks) { … await buildAssignment(…) }`.
     * Исполнительская полоса к этому моменту выжата на 97,2% идеала — потолок ставит планирование,
     * и ставит его вот этот цикл.
     *
     * Гонки записи здесь нет по построению: `buildAssignment` не пишет на диск ни байта, весь
     * ввод-вывод плана собран в `writeHandoff` ниже. Потолок — не осторожность вообще, а
     * конкретный довод: цепочка провайдеров перебирает все свои звенья на КАЖДОМ вызове, и без
     * потолка красное первое звено дало бы столько одновременных запросов ко второму, сколько
     * задач в вехе.
     */
    const width = deps.concurrency ?? DEFAULT_INTAKE_CONCURRENCY;

    if (toWrite.length > 1) {
      say(
        `Задания вехи пишутся ПАРАЛЛЕЛЬНО: ${String(toWrite.length)} независимых заданий, ` +
          `одновременно не больше ${String(Math.min(width, toWrite.length))}. Порядок задач в ` +
          'плане и порядок строк в ленте — прежние: их задаёт бандл, а не то, кто ответил первым.',
      );
    }

    const built = await timeStage(
      'задания',
      () =>
        mapWithLimit(toWrite, width, (slot) =>
          buildAssignment(
            slot.task,
            slot.milestone,
            {
              architecture: bundle.architecture,
              techStack,
              research: researchForPrompt(surveyed.report),
              /*
               * **Условия — и на общей ветке тоже** (А-51 п.3). Прежде их получала только ветка
               * цельного артефакта, и суждения о выполнимости и об объёме на системном плане не
               * доезжали до исполнителя вовсе.
               */
              conditions,
            },
            chain,
          ),
        ),
      (value) => value.filter((entry) => entry.writtenBy !== null).length,
    );

    /*
     * **Фаза 3 — сборка, строго по порядку бандла.**
     *
     * Веер вернул результаты в порядке входа; лента и массив собираются здесь, последовательно.
     * Это и есть цена, которую параллельность не платит: одновременность живёт в сетевых ходах, а
     * не в бухгалтерии, и бухгалтерия остаётся детерминированной.
     */
    const writtenFor = new Map(toWrite.map((slot, index) => [slot.task.taskId, built[index]]));

    for (const slot of slots) {
      if (slot.onDisk !== null) {
        tasks.push(slot.onDisk);
        keptFromDisk += 1;
        continue;
      }

      const result = writtenFor.get(slot.task.taskId);
      if (result === undefined) {
        throw new IntakeRefused(
          `задание ${slot.task.taskId} не написано ни моделью, ни скелетом — это дефект веера`,
        );
      }

      tasks.push(result.task);

      if (result.writtenBy === null) {
        const reason = result.degradedBecause ?? 'причина не названа';
        degradations.push(`${slot.task.taskId}: ${reason}`);
        say(`Задание ${slot.task.taskId} написано без модели (${reason}).`, 'WARN');
      } else {
        writtenByModel += 1;
        say(`Задание ${slot.task.taskId} написано провайдером ${result.writtenBy}.`);
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

  /*
   * Разбивка — в ленту, последней строкой интейка (А-51 п.3). Оптимизировать вслепую нельзя: до
   * этой строки «интейк 127,4 с» было одним числом, за которым скрывались шесть разных работ.
   */
  say(describeStages(stages));

  return {
    stages,
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
    scope,
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
