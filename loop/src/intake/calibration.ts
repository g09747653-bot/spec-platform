import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';

import { z } from 'zod';

import { LEDGER_DIRECTORY } from '../gate/measurement.ts';

/**
 * Журнал калибровки бюджета объёма — петля, замкнутая на уже собираемых числах (А-51, §10.4).
 *
 * **Что было незамкнуто.** Бюджет `SCOPE_BUDGET_UNITS = 44` был константой с провенансом: столько
 * живых элементов довёл до рабочего состояния один контекст, выбиравший себе объём сам (NEURA,
 * замер А-46). Проверка А-51 уточнила провенанс честнее самого числа: **это счёт ссылок ОДНОГО
 * сайта, а единица в промпте определена шире** — страница, ссылка, форма, меню. Значит 44 —
 * аналогия, а не замер работы, и подпирать её второй аналогией было бы гаданием по гаданию.
 *
 * **Чем петля замыкается.** Двумя числами, которые контур УЖЕ собирает и которые не надо ни у кого
 * спрашивать:
 *
 * - **предсказание** — `keptUnits` суждения об объёме: во что модель оценила работу, за которую
 *   контур взялся (`scope.ts`). Это оценка, и она объявляется предсказанием, а не фактом;
 * - **факт** — `counts.working` четвёртой оси суда качества: сколько элементов продукта проба
 *   ПОТРОГАЛА и они сработали (`visual-judge.ts`). Ось уже считает рабочие, инертные и сломанные;
 *   ничего нового измерять не нужно.
 *
 * Отношение «вышло рабочим / предсказано» и есть коэффициент. Меньше единицы означает, что контур
 * систематически берёт на себя больше, чем доводит, — и тогда бюджет уменьшается, чтобы он брал
 * меньше и доводил всё. Больше единицы — обратное. За два-три прогона перекос видно; на одном
 * прогоне видно только шум, поэтому коэффициент не применяется, пока записей меньше трёх.
 *
 * **Журнал живёт СНАРУЖИ рабочих директорий**, рядом с книгой замеров и по той же причине (А-51
 * п.1): число, которое правит бюджет следующего проекта, не может лежать там, куда пишет
 * исполнитель текущего.
 */

/** Как называется журнал. Один на корень рабочих директорий: коэффициент меряется по прогонам. */
export const CALIBRATION_FILE = 'CALIBRATION.json';

/** Меньше трёх прогонов — это шум, а не перекос. Правка бюджета по шуму хуже отсутствия правки. */
export const CALIBRATION_MIN_RUNS = 3;

/**
 * Границы, за которые коэффициент не выпускается.
 *
 * Не осторожность ради осторожности: одна аварийная запись (суд не нашёл ни одного рабочего
 * элемента при большом предсказании) утащила бы бюджет в ноль и остановила бы все следующие
 * проекты на одном пункте. Зажим — это признание, что журнал считает по маленькой выборке.
 */
export const CALIBRATION_CLAMP = Object.freeze({ min: 0.25, max: 4 });

const CalibrationEntry = z.object({
  projectId: z.string(),
  at: z.string(),
  /** Оценка модели, принятая кодом, — ПРЕДСКАЗАНИЕ. */
  predictedUnits: z.number().int().nonnegative(),
  /** Что оказалось рабочим по четвёртой оси суда — ФАКТ. */
  workingUnits: z.number().int().nonnegative(),
});

export type CalibrationEntry = z.infer<typeof CalibrationEntry>;

const CalibrationJournal = z.object({ entries: z.array(CalibrationEntry).default([]) });

export type CalibrationJournal = z.infer<typeof CalibrationJournal>;

const EMPTY: CalibrationJournal = { entries: [] };

/** Путь журнала: `<корень рабочих директорий>/.loop-ledger/CALIBRATION.json`. */
export function calibrationPath(projectDirectory: string): string {
  const absolute = resolve(projectDirectory);
  return join(dirname(absolute), LEDGER_DIRECTORY, CALIBRATION_FILE);
}

/**
 * Чтение журнала. Испорченный журнал — это ОТСУТСТВИЕ коэффициента, а не повод отказать проекту.
 *
 * Разница с книгой замеров намеренная и она в цене ошибки: там нечитаемая книга стирает базовую
 * линию сходимости и потому краснеет, здесь нечитаемый журнал означает всего лишь «правим бюджет
 * стартовой константой, как и до всякой калибровки».
 */
export function readCalibration(projectDirectory: string): CalibrationJournal {
  const path = calibrationPath(projectDirectory);
  if (!existsSync(path)) return EMPTY;

  try {
    return CalibrationJournal.parse(JSON.parse(readFileSync(path, 'utf8')));
  } catch {
    return EMPTY;
  }
}

/** Одна запись в журнал: предсказание против факта, по имени проекта. */
export function recordCalibration(projectDirectory: string, entry: CalibrationEntry): void {
  const journal = readCalibration(projectDirectory);
  const path = calibrationPath(projectDirectory);

  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(
    path,
    `${JSON.stringify(
      CalibrationJournal.parse({
        /* Одна запись на проект: перезаход того же проекта уточняет свою, а не заводит вторую. */
        entries: [
          ...journal.entries.filter((existing) => existing.projectId !== entry.projectId),
          entry,
        ],
      }),
      null,
      2,
    )}\n`,
    'utf8',
  );
}

/**
 * Коэффициент калибровки — ЧИСТАЯ функция над журналом (P1: считает код).
 *
 * Отношение сумм, а не среднее отношений: маленький проект с одним элементом иначе весил бы
 * столько же, сколько большой, и один аварийный прогон определял бы бюджет всем.
 *
 * `null` — записей мало или предсказывать было нечего; тогда бюджет остаётся стартовой константой,
 * и это говорится вслух.
 */
export function calibrationCoefficient(journal: CalibrationJournal): number | null {
  const usable = journal.entries.filter((entry) => entry.predictedUnits > 0);
  if (usable.length < CALIBRATION_MIN_RUNS) return null;

  const predicted = usable.reduce((total, entry) => total + entry.predictedUnits, 0);
  const working = usable.reduce((total, entry) => total + entry.workingUnits, 0);
  if (predicted === 0) return null;

  return Math.min(Math.max(working / predicted, CALIBRATION_CLAMP.min), CALIBRATION_CLAMP.max);
}

/** Бюджет, поправленный на ИЗМЕРЕННЫЙ коэффициент. Без коэффициента — стартовая константа. */
export function calibratedBudget(base: number, coefficient: number | null): number {
  if (coefficient === null) return base;
  return Math.max(1, Math.round(base * coefficient));
}

/** Строка ленты: чем правится бюджет и на чём это измерено. Число без провенанса — догадка. */
export function describeCalibration(
  base: number,
  journal: CalibrationJournal,
  coefficient: number | null,
): string {
  if (coefficient === null) {
    return (
      `Бюджет объёма: ${String(base)} единиц — стартовая константа (замер А-46: столько живых ` +
      `элементов довёл один контекст, выбиравший себе объём сам). Журнал калибровки содержит ` +
      `${String(journal.entries.length)} записей из ${String(CALIBRATION_MIN_RUNS)} нужных — ` +
      'поправлять пока не на что, и это сказано, а не умолчано.'
    );
  }

  const predicted = journal.entries.reduce((total, entry) => total + entry.predictedUnits, 0);
  const working = journal.entries.reduce((total, entry) => total + entry.workingUnits, 0);

  return (
    `Бюджет объёма: ${String(calibratedBudget(base, coefficient))} единиц — стартовая константа ` +
    `${String(base)}, поправленная на ИЗМЕРЕННЫЙ коэффициент ${coefficient.toFixed(2)} ` +
    `(по ${String(journal.entries.length)} прогонам: предсказано ${String(predicted)}, вышло ` +
    `рабочим ${String(working)}). Оценка модели — предсказание, четвёртая ось суда — факт; ` +
    'бюджет правится на их отношение, а не на догадку.'
  );
}

/** Имя проекта по его рабочей директории — ключ записи журнала, когда идентификатор не под рукой. */
export function projectKeyOf(projectDirectory: string): string {
  return basename(resolve(projectDirectory));
}
