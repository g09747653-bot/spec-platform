import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

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
 * - **память сходимости живёт на стороне контура** (`handoff/MEASUREMENTS.json`), а не в копии,
 *   которую приёмка удаляет за собой, и не в рабочей директории, куда пишет исполнитель. Сходимость
 *   поэтому сравнивает СВОЁ число с прошлым СВОИМ.
 *
 * **Отчёт читается из вывода контейнера, а не с диска хоста.** Тот же закон, что у `observe.ts`
 * (D-314): долгоживущий процесс контура на Windows стойко слеп к записям контейнера через
 * bind-mount, и host-чтение свежего отчёта было бы чтением вчерашнего мира.
 */

/** Где контур помнит свои замеры. Рабочей директории исполнителя этот файл не принадлежит. */
export const MEASUREMENTS_FILE = join('handoff', 'MEASUREMENTS.json');

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
const Ledger = z.object({
  measured: z.record(z.string(), MeasuredEntry).default({}),
  unverifiable: z.array(UnverifiableEntry).default([]),
});

export type Ledger = z.infer<typeof Ledger>;

const EMPTY: Ledger = { measured: {}, unverifiable: [] };

export function readMeasurements(projectDirectory: string): Ledger {
  const path = join(projectDirectory, MEASUREMENTS_FILE);
  if (!existsSync(path)) return EMPTY;

  try {
    return Ledger.parse(JSON.parse(readFileSync(path, 'utf8')));
  } catch {
    /* Нечитаемая книга — это отсутствие прошлого числа, а не повод отказать задаче. */
    return EMPTY;
  }
}

function writeLedger(projectDirectory: string, ledger: Ledger): void {
  mkdirSync(join(projectDirectory, 'handoff'), { recursive: true });
  writeFileSync(
    join(projectDirectory, MEASUREMENTS_FILE),
    `${JSON.stringify(Ledger.parse(ledger), null, 2)}\n`,
    'utf8',
  );
}

/** Принятое число — новая базовая линия сходимости для этого же замера. */
export function recordMeasurement(
  projectDirectory: string,
  entry: { key: string; value: number; taskId: string; image: string; at: string },
): void {
  const ledger = readMeasurements(projectDirectory);
  writeLedger(projectDirectory, {
    ...ledger,
    measured: {
      ...ledger.measured,
      [entry.key]: { value: entry.value, taskId: entry.taskId, image: entry.image, at: entry.at },
    },
  });
}

/** «Приёмка этого проверить не может» — записывается, потому что молчать об этом запрещено. */
export function recordUnverifiable(
  projectDirectory: string,
  entry: { taskId: string; reason: string; at: string },
): void {
  const ledger = readMeasurements(projectDirectory);
  writeLedger(projectDirectory, {
    ...ledger,
    unverifiable: [
      ...ledger.unverifiable.filter((existing) => existing.taskId !== entry.taskId),
      entry,
    ],
  });
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
 * Сходимость: своё число против прошлого своего (А-44 п.1).
 *
 * Полировке позволено не дойти до идеала; ей не позволено делать хуже. Порогом это не является и
 * стать им не может — сравнение идёт с ИЗМЕРЕННЫМ прошлым, а не с константой, которую сборка с
 * нуля не возьмёт никогда (урок D-323).
 */
export function judgeConvergence(
  previous: number | null,
  value: number,
): { converged: true } | { converged: false; reason: string } {
  if (previous === null) return { converged: true };
  if (value <= previous + 1e-9) return { converged: true };

  return {
    converged: false,
    reason:
      `Расхождение выросло против прошлого замера приёмки: было ${String(previous)}, ` +
      `стало ${String(value)} — полировке позволено не дойти, но не позволено сделать хуже.`,
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
  | { status: 'read'; value: number; record: string }
  | { status: 'failed'; reason: string };

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
