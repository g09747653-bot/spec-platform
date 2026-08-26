import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';

import { z } from 'zod';

import type { Measurement } from '../intake/handoff.ts';

/**
 * Замер, прогоняемый ПРИЁМКОЙ (А-44 п.1).
 *
 * **Что было сломано.** Приёмка полировки судила три «факта» — замер прогнан, отчёт записан,
 * расхождение не выросло, — и каждый из трёх удовлетворялся артефактом самого исполнителя:
 *
 * 1. команда замера шла через `|| true`, поставленный по D-323 против ПОРОГА, но глотавший заодно
 *    и «браузера в образе нет» — трижды за живой прогон;
 * 2. `test -s report.json` проходил на файле, который написал исполнитель внутри своей итерации;
 * 3. память сходимости `.loop-convergence.json` писал ТОТ ЖЕ исполнитель, и приёмка сравнивала его
 *    число с его же числом: `52.5925435555148 (было 52.5925435555148)` — значение с самим собой.
 *
 * **Правило, из которого всё ниже следует: приёмка не принимает артефакт, который она не могла
 * произвести сама.** Отсюда три свойства этого модуля:
 *
 * - **отчёт сносится ДО прогона** — подложенный отчёт чужого авторства приёмку не переживает;
 * - **`|| true` исчез** — команда замера обязана мерить, а не оценивать: её код возврата теперь
 *   говорит «прогналось ли», и не прогнавшийся замер краснеет, а не молчит. Порог воротами не
 *   становится по-прежнему — но не глотанием кода возврата, а тем, что число нигде не сравнивается
 *   с константой;
 * - **память сходимости живёт на стороне контура** — и с А-51 п.1 это МЕХАНИЗМ, а не нрав. Прежде
 *   книга лежала в `handoff/MEASUREMENTS.json` ВНУТРИ рабочей директории, которую исполнительский
 *   контейнер монтирует на запись (`executor/run.ts`), — то есть «подложить нельзя» держалось
 *   ровно на том, что исполнителю про книгу перестали говорить. Теперь книга лежит СНАРУЖИ
 *   рабочей директории (`ledgerPath`), куда ни один исполнительский бинд не дотягивается.
 *
 * **Отчёт читается из вывода контейнера, а не с диска хоста.** Тот же закон, что у `observe.ts`
 * (D-314): долгоживущий процесс контура на Windows стойко слеп к записям контейнера через
 * bind-mount, и host-чтение свежего отчёта было бы чтением вчерашнего мира.
 */

/**
 * Где книга лежала до А-51 п.1 — ВНУТРИ рабочей директории, то есть под пером исполнителя.
 *
 * Оставлено не для чтения, а для опознания: файл по этому пути больше не книга контура, и суд
 * говорит о нём вслух, если находит. Молча прочитать его значило бы вернуть ровно ту дыру.
 */
export const LEGACY_MEASUREMENTS_FILE = join('handoff', 'MEASUREMENTS.json');

/** Каталог книг контура — СОСЕД рабочих директорий, а не их содержимое. */
export const LEDGER_DIRECTORY = '.loop-ledger';

/**
 * Путь книги этого проекта (А-51 п.1).
 *
 * **Снаружи рабочей директории — и это единственное, что здесь важно.** Исполнитель монтирует
 * `<root>/<projectId>` как `/workspace` на запись; книга живёт в `<root>/.loop-ledger/<projectId>.json`,
 * то есть на уровень выше любого исполнительского бинда. Контейнеру туда не дотянуться никаким
 * путём внутри `/workspace`, и «подложить нельзя» перестаёт быть обещанием.
 *
 * Имя книги — имя рабочей директории: проекты одного корня различимы, проекты разных корней ведут
 * свои книги рядом со своими корнями и не встречаются.
 */
export function ledgerPath(projectDirectory: string): string {
  const absolute = resolve(projectDirectory);
  return join(dirname(absolute), LEDGER_DIRECTORY, `${basename(absolute)}.json`);
}

/**
 * Чем один замер отличается от другого — файлом отчёта и ключом числа в нём.
 *
 * Не задачей: цепочка полировок мерит ОДНО И ТО ЖЕ расхождение, и сходимость должна тянуться
 * сквозь всю цепочку, а не начинаться заново с каждой задачей. Ключом по задаче полировка №2
 * сравнивала бы себя с пустотой и проходила бы всегда.
 */
export function measurementKey(measurement: Measurement): string {
  return `${measurement.recordPath.replaceAll('\\', '/')}#${measurement.divergenceKey}`;
}

const MeasuredEntry = z.object({
  value: z.number(),
  /** Кто мерил последним — чтобы строку реестра можно было прочитать вместе с задачей. */
  taskId: z.string(),
  /** Каким образом мерили: независимость доказывается ещё и тем, ЧЕМ она получена. */
  image: z.string(),
  at: z.string(),
});

const UnverifiableEntry = z.object({
  taskId: z.string(),
  reason: z.string(),
  at: z.string(),
});

/**
 * Книга замеров контура.
 *
 * `measured` — последнее ПРИНЯТОЕ число по каждому замеру: базовая линия сходимости двигается
 * только принятой работой, иначе полировка, сделавшая хуже, назначала бы себе новый, худший
 * ориентир и следующая проходила бы против него.
 *
 * `unverifiable` — задачи, которые приёмка физически не смогла проверить. Список ведётся именно
 * потому, что молчаливый проход запрещён: суд качества читает его и называет владельцу.
 */
/**
 * Сколько раз подряд этот замер не улучшился (А-51, вердикт §10.2).
 *
 * Сходимость достижима всегда — но не обязана быть достигнута КАЖДЫМ заходом, и цепочка полировок
 * без предохранителя блокируется бесконечно. Счётчик и есть предохранитель: он растёт только на
 * невыросшем-в-худшую-сторону… точнее, на ВЫРОСШЕМ расхождении, и обнуляется принятой работой.
 */
const StallEntry = z.object({
  count: z.number().int().nonnegative(),
  taskId: z.string(),
  at: z.string(),
});

/**
 * Чья это книга (А-51 п.1, находка разведки).
 *
 * Побочное следствие переноса книги наружу: она теперь ПЕРЕЖИВАЕТ снос рабочей директории. Прежде
 * `rm -rf <projectDirectory>` уносил базовую линию заодно; теперь проект, пересозданный под тем же
 * именем каталога, унаследовал бы чужое прошлое число и чужой счётчик застоя — тот самый класс
 * отказа, что уже стоил нам прогона на унаследованных статусах индекса.
 *
 * Клеймо ставит интейк, который единственный знает, ЧЕЙ это план. Несовпадение — не ошибка: книга
 * заводится заново, и об этом говорится вслух.
 */
const LedgerOwner = z.object({ projectId: z.string(), bundleId: z.string() });

export type LedgerOwner = z.infer<typeof LedgerOwner>;

const Ledger = z.object({
  owner: LedgerOwner.optional(),
  measured: z.record(z.string(), MeasuredEntry).default({}),
  unverifiable: z.array(UnverifiableEntry).default([]),
  stalls: z.record(z.string(), StallEntry).default({}),
});

export type Ledger = z.infer<typeof Ledger>;

const EMPTY: Ledger = { measured: {}, unverifiable: [], stalls: {} };

/**
 * Чтение книги — ТРИ исхода, и средний из них больше не притворяется первым (А-51 п.1).
 *
 * Прежде функция отдавала пустую книгу и на отсутствие файла, и на его порчу. Разница между ними —
 * вся суть: отсутствие книги значит «первый замер цепочки, сравнивать не с чем», а порча значит
 * «прошлое число было и его больше нет». Второе, отданное как первое, даёт `previous = null` →
 * `converged: true` → **тихий проход**, то есть ровно то, что А-44 запретил. Испорченная книга
 * теперь краснеет.
 */
export type LedgerRead =
  | { status: 'read'; ledger: Ledger }
  /** Книги нет: цепочка начинается, и это законно. */
  | { status: 'absent'; ledger: Ledger }
  /** Книга есть и не читается: прошлое число потеряно, и молчать об этом нельзя. */
  | { status: 'unreadable'; reason: string };

export function readLedger(projectDirectory: string): LedgerRead {
  const path = ledgerPath(projectDirectory);
  if (!existsSync(path)) return { status: 'absent', ledger: EMPTY };

  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch (error) {
    return {
      status: 'unreadable',
      reason: `книга замеров контура ${path} не читается: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {
      status: 'unreadable',
      reason: `книга замеров контура ${path} не разбирается как JSON`,
    };
  }

  const ledger = Ledger.safeParse(parsed);
  if (!ledger.success) {
    return {
      status: 'unreadable',
      reason: `книга замеров контура ${path} не той формы: ${z.prettifyError(ledger.error)}`,
    };
  }

  return { status: 'read', ledger: ledger.data };
}

/** Что вышло из попытки записать книгу. Отказ называется, потому что он значит потерю прошлого. */
export type LedgerWrite = { ok: true } | { ok: false; reason: string };

/**
 * Запись поверх испорченной книги ЗАПРЕЩЕНА.
 *
 * Свежая книга поверх нечитаемой стёрла бы базовую линию — и следующий замер прошёл бы «первым в
 * цепочке». Починка испорченной книги есть акт человека, а не побочный эффект прохода.
 */
function writeLedger(projectDirectory: string, mutate: (ledger: Ledger) => Ledger): LedgerWrite {
  const read = readLedger(projectDirectory);
  if (read.status === 'unreadable') return { ok: false, reason: read.reason };

  const path = ledgerPath(projectDirectory);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(Ledger.parse(mutate(read.ledger)), null, 2)}\n`, 'utf8');

  return { ok: true };
}

/** Принятое число — новая базовая линия сходимости для этого же замера. */
export function recordMeasurement(
  projectDirectory: string,
  entry: { key: string; value: number; taskId: string; image: string; at: string },
): LedgerWrite {
  return writeLedger(projectDirectory, (ledger) => {
    /* Принятая работа обнуляет терпение: цепочка сдвинулась, отсчёт застоя начинается заново. */
    const { [entry.key]: _cleared, ...stalls } = ledger.stalls;

    return {
      ...ledger,
      stalls,
      measured: {
        ...ledger.measured,
        [entry.key]: { value: entry.value, taskId: entry.taskId, image: entry.image, at: entry.at },
      },
    };
  });
}

/** Замер, который не улучшился, — плюс один к терпению (вердикт §10.2). */
export function recordStall(
  projectDirectory: string,
  entry: { key: string; taskId: string; at: string },
): LedgerWrite {
  return writeLedger(projectDirectory, (ledger) => ({
    ...ledger,
    stalls: {
      ...ledger.stalls,
      [entry.key]: {
        count: (ledger.stalls[entry.key]?.count ?? 0) + 1,
        taskId: entry.taskId,
        at: entry.at,
      },
    },
  }));
}

/**
 * Клеймо владельца на книге — и снос книги, если владелец другой (А-51 п.1).
 *
 * Зовётся интейком, единожды за заход: он один знает пару «проект — бандл», и он один вправе
 * решить, что цепочка полировок началась заново. Исход возвращается словом, потому что каждый из
 * трёх говорится владельцу по-разному.
 */
export type LedgerStamp =
  | { status: 'kept' }
  | { status: 'stamped' }
  | { status: 'reset'; previous: LedgerOwner | null; dropped: number }
  | { status: 'unreadable'; reason: string };

export function stampLedger(projectDirectory: string, owner: LedgerOwner): LedgerStamp {
  const read = readLedger(projectDirectory);
  if (read.status === 'unreadable') return { status: 'unreadable', reason: read.reason };

  const existing = read.ledger.owner ?? null;

  if (
    existing !== null &&
    existing.projectId === owner.projectId &&
    existing.bundleId === owner.bundleId
  ) {
    return { status: 'kept' };
  }

  const dropped = Object.keys(read.ledger.measured).length;

  /* Книга без клейма — своя же, просто прежней формы: клеймим, ничего не теряя. */
  if (existing === null) {
    writeLedger(projectDirectory, (ledger) => ({ ...ledger, owner }));
    return { status: 'stamped' };
  }

  writeLedger(projectDirectory, () => ({ owner, measured: {}, unverifiable: [], stalls: {} }));
  return { status: 'reset', previous: existing, dropped };
}

/** «Приёмка этого проверить не может» — записывается, потому что молчать об этом запрещено. */
export function recordUnverifiable(
  projectDirectory: string,
  entry: { taskId: string; reason: string; at: string },
): LedgerWrite {
  return writeLedger(projectDirectory, (ledger) => ({
    ...ledger,
    unverifiable: [
      ...ledger.unverifiable.filter((existing) => existing.taskId !== entry.taskId),
      entry,
    ],
  }));
}

/* ─────────────────────────── чистые функции суждения ─────────────────────────── */

/** Число по ключу через точку. Не число и не конечное — не замер, сколько бы букв ни лежало рядом. */
export function numberAt(record: unknown, key: string): number | null {
  let cursor: unknown = record;

  for (const step of key.split('.')) {
    if (cursor === null || typeof cursor !== 'object') return null;
    cursor = (cursor as Record<string, unknown>)[step];
  }

  return typeof cursor === 'number' && Number.isFinite(cursor) ? cursor : null;
}

/**
 * Сколько заходов подряд без улучшения терпит цепочка полировок, прежде чем задача принимается.
 *
 * Три — потому что один заход может не сойтись случайно (шум замера), два подряд уже похожи на
 * упор, а три означают, что улучшать нечем. Число названо здесь, а не разбросано по вызовам:
 * предохранитель обязан быть одной константой, которую видно.
 */
export const CONVERGENCE_PATIENCE = 3;

export type ConvergenceVerdict =
  /** Сошлось: либо стало не хуже, либо терпение исчерпано и задача принимается (§10.2). */
  | { converged: true; exhausted: boolean; reason: string | null }
  | { converged: false; exhausted: false; reason: string };

/**
 * Сходимость: своё число против прошлого своего (А-44 п.1), с предохранителем (А-51, §10.2).
 *
 * Полировке позволено не дойти до идеала; ей не позволено делать хуже. Порогом это не является и
 * стать им не может — сравнение идёт с ИЗМЕРЕННЫМ прошлым, а не с константой, которую сборка с
 * нуля не возьмёт никогда (урок D-323).
 */
export function judgeConvergence(
  previous: number | null,
  value: number,
  /** Сколько раз подряд этот же замер уже не улучшался. Читается из книги контура. */
  stalls = 0,
): ConvergenceVerdict {
  if (previous === null) return { converged: true, exhausted: false, reason: null };
  if (value <= previous + 1e-9) return { converged: true, exhausted: false, reason: null };

  const attempt = stalls + 1;

  /*
   * **Предохранитель (вердикт §10.2).** Сходимость достижима всегда — но «достижима» не значит
   * «будет достигнута этим заходом», и цепочка полировок, которая раз за разом делает чуть хуже,
   * без предохранителя блокируется навсегда. Мы уже сожгли раунд на недостижимых воротах (D-323);
   * второй раз горит не порог, а терпение. Названное число попыток — и задача ПРИНИМАЕТСЯ, с
   * записью, что сходимость достигнута исчерпанием, а не улучшением.
   */
  if (attempt >= CONVERGENCE_PATIENCE) {
    return {
      converged: true,
      exhausted: true,
      reason:
        `Сходимость достигнута исчерпанием: попыток подряд без улучшения ${String(attempt)} ` +
        `из ${String(CONVERGENCE_PATIENCE)} (было ${String(previous)}, стало ${String(value)}). ` +
        'Задача принимается: блокировать полировку бесконечно — те же недостижимые ворота, ' +
        'только под другим именем. Число публикуется как есть.',
    };
  }

  return {
    converged: false,
    exhausted: false,
    reason:
      `Расхождение выросло против прошлого замера приёмки: было ${String(previous)}, ` +
      `стало ${String(value)} — полировке позволено не дойти, но не позволено сделать хуже. ` +
      `Попытка ${String(attempt)} из ${String(CONVERGENCE_PATIENCE)}: на последней задача будет ` +
      'принята с записью «сходимость достигнута исчерпанием».',
  };
}

/* ─────────────────────────── прогон в контейнере ─────────────────────────── */

/** Замер не запустился вовсе — не вопрос качества, а отсутствие замера. */
export const MEASUREMENT_FAILED = '__LOOP_MEASUREMENT_FAILED__';
/** Замер отработал и ничего не записал: отчёта нет, значит и числа нет. */
export const MEASUREMENT_ABSENT = '__LOOP_MEASUREMENT_ABSENT__';
/** Дальше в выводе идёт сам отчёт — прочитанный контейнерными глазами, не хостовыми. */
export const MEASUREMENT_RECORD = '__LOOP_MEASUREMENT_RECORD__';

const quote = (value: string): string => `'${value.replaceAll("'", String.raw`'\''`)}'`;

/**
 * Одна строка shell, исполняемая приёмочным контейнером.
 *
 * Порядок — и есть содержание: снести чужой отчёт, прогнать замер, потребовать НОВЫЙ отчёт,
 * напечатать его. Группировка в `{ …; }` обязательна: команда плана вправе быть конвейером или
 * цепочкой через `&&`, и `if ! cmd` разобрал бы такую цепочку не так, как её написали.
 */
export function measurementShell(measurement: Measurement): string {
  const record = quote(measurement.recordPath.replaceAll('\\', '/'));

  return [
    `rm -f ${record}`,
    `{ ${measurement.cmd}; } || { printf '%s\\n' '${MEASUREMENT_FAILED}'; exit 64; }`,
    `if [ ! -s ${record} ]; then printf '%s\\n' '${MEASUREMENT_ABSENT}'; exit 65; fi`,
    `printf '%s\\n' '${MEASUREMENT_RECORD}'`,
    `cat ${record}`,
  ].join('\n');
}

export type MeasurementReading =
  { status: 'read'; value: number; record: string } | { status: 'failed'; reason: string };

/**
 * Разбор вывода замерочного контейнера — чистая функция над тем, что напечатал контейнер.
 *
 * Каждый исход назван своим словом, потому что лечится по-разному: не прогналось — чинить среду
 * или команду; не записало — чинить замер; записало не число — чинить ключ.
 */
export function readMeasurementOutput(
  output: string,
  exitCode: number | null,
  measurement: Measurement,
): MeasurementReading {
  if (output.includes(MEASUREMENT_FAILED)) {
    return {
      status: 'failed',
      reason: `замер «${measurement.cmd}» не прогнался в приёмочном контейнере`,
    };
  }
  if (output.includes(MEASUREMENT_ABSENT)) {
    return {
      status: 'failed',
      reason: `замер прогнался, но отчёта ${measurement.recordPath} не написал`,
    };
  }
  if (exitCode !== 0) {
    return {
      status: 'failed',
      reason:
        exitCode === null
          ? 'замер не уложился в отведённое приёмке время'
          : `замерочный контейнер вернул ${String(exitCode)}`,
    };
  }

  const marker = output.indexOf(MEASUREMENT_RECORD);
  if (marker === -1) {
    return { status: 'failed', reason: 'вывод замера не содержит отчёта' };
  }

  const record = output.slice(marker + MEASUREMENT_RECORD.length).trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(record);
  } catch {
    return { status: 'failed', reason: `отчёт ${measurement.recordPath} не разбирается как JSON` };
  }

  const value = numberAt(parsed, measurement.divergenceKey);
  if (value === null) {
    return {
      status: 'failed',
      reason: `в отчёте нет числа по ключу ${measurement.divergenceKey}`,
    };
  }

  return { status: 'read', value, record };
}
