import { existsSync, readdirSync, readFileSync, statSync, type Dirent } from 'node:fs';
import { dirname, join, relative } from 'node:path';

import { z } from 'zod';

/**
 * Сверка финального алерта с задумкой (А-33 п.4а — «вершинный критерий»).
 *
 * Финальная приёмка Программы А получила «✅ Проект завершён» при голом сайте: конвейер сам же
 * замерил расхождения (DEVIATIONS.md на 125 КБ, 0/24 сегментов в пороге) — и промолчал об этом в
 * той единственной строке, которую читает заказчик. Алерт не солгал буквой («все задачи приняты» —
 * правда), но солгал умолчанием: галочка без замера читается как «продукт сверен с задумкой».
 *
 * Правило: **финальный алерт обязан нести главный замер самопроверки, когда конвейер им
 * располагает** — число принятых задач, счёт зафиксированных расхождений и путь к отчёту. Голая
 * галочка при существующем DEVIATIONS.md — дефект. Когда план самопроверку не снимал (отчёта нет),
 * алерт говорит и это — явным словом, а не отсутствием слова.
 *
 * Отчёт ищется по имени класса `DEVIATIONS.md` — пути FR-011 планов самопроверки («расхождения
 * фиксируются с обоснованием»); служебные деревья контура и продукта в поиск не входят.
 */

/**
 * Реестр расхождений — ДВА РОДА, и род есть ПОЛЕ, а не фраза в заголовке (А-44 п.3, А-51 п.2).
 *
 * **Почему их два.** Расхождения бывают двух родов, и они не равны:
 *
 * - **I. Замены по материалу** — прошли суждение о выполнимости, причина из закрытого перечня
 *   (`feasibility.ts`), объявлены владельцу ДО сборки. Это честный обход невозможного;
 * - **II. Сокращения объёма** — решение исполнителя: материал есть, работа не сделана. Род
 *   законный (макет вправе быть макетом, ссылка вправе быть декоративной), но своим именем.
 *
 * Второй род в одной колонке с первым превращает реестр в место, где недоделанное легализуется
 * задним числом: «сокращений 74» читается как «замен по материалу 74», то есть как «мы не могли».
 * Раздельные числа — единственное, что этому мешает.
 *
 * **Почему различение перестало быть чтением markdown (А-51 п.2).** Прежде род брался по
 * ближайшему заголовку выше — и это установлено исполнением, а не рассуждением: плоский реестр,
 * чей ТИТУЛ звучит `# Реестр расхождений: замены по материалу и сокращения объёма`, давал
 * `{material: 2, scope: 0}` и печатал владельцу «замен по материалу 2, сокращений объёма 0» — ни
 * слова о том, что форма старая. То есть сокращения были молча выданы за замены: ровно тот отказ,
 * ради которого разделы и заведены. Обратные ошибки того же механизма: подзаголовок внутри раздела
 * сбрасывал бакет, перифраз «Замена» вместо «Замены» уводил запись в «вне разделов», а строка
 * `| - | - |` — законный разделитель GFM — неотличима от записи из двух прочерков.
 *
 * Ни одну из них нельзя вылечить более умной регуляркой, потому что болезнь не в регулярке:
 * **фраза в заголовке — это мнение о записи, а нужен факт о ней.** Поэтому род теперь живёт в
 * `DEVIATIONS.json` полем `kind` из закрытого перечня, проверяемым схемой, а `DEVIATIONS.md`
 * остаётся тем, чем и был, — прозой для человека. Реестр без машинной записи не «считается
 * приблизительно»: он объявляется НЕРАСПОЗНАННОЙ ФОРМОЙ, и это говорится вслух.
 *
 * **Воротами не делается ни то, ни другое.** Реестр публикуется, а решает по нему человек.
 */

/** Заголовки разделов прозы — один источник правды: их же требует промпт плана от исполнителя. */
export const REGISTRY_SECTIONS = Object.freeze({
  material: 'Замены по материалу',
  scope: 'Сокращения объёма',
} as const);

/**
 * Род расхождения — ЗАКРЫТЫЙ перечень, и он же значения поля `kind` машинной записи.
 *
 * Закрытый по той же причине, что и перечень причин недостижимости: по роду читают итог, и
 * свободная формулировка вернула бы счёт к спору о словах.
 */
export const DEVIATION_KINDS = ['материал', 'объём'] as const;
export type DeviationKind = (typeof DEVIATION_KINDS)[number];

const Deviation = z.object({
  /** Род записи. Поле, а не фраза: именно оно и есть предмет правки А-51 п.2. */
  kind: z.enum(DEVIATION_KINDS),
  /** Что именно разошлось с задумкой. */
  what: z.string().min(1),
  /** Почему. Для материала — причина невозможности; для объёма — решение не доводить. */
  why: z.string().min(1),
  /**
   * Что поставлено взамен. Только у материала: замена сокращённому пункту и есть та заглушка,
   * ради запрета которой роды разделены (`scope.ts`, `scopeExclusions`).
   */
  instead: z.string().optional(),
});

export type Deviation = z.infer<typeof Deviation>;

const DeviationRegistry = z.object({ entries: z.array(Deviation) });

export interface RegistryCount {
  /** Род «материал» — замены, у которых названа причина невозможности. */
  material: number;
  /** Род «объём» — сокращения: материал был, работа не сделана. */
  scope: number;
}

/**
 * Форма реестра — и она часть ответа, а не служебная подробность.
 *
 * `filed` — род каждой записи назван полем и проверен схемой; числа раздельны и им можно верить.
 * `unrecognised` — машинной записи нет либо она не той формы. Тогда числа по родам НЕ НАЗЫВАЮТСЯ
 * вовсе: приблизительный род хуже отсутствующего, потому что его читают как точный.
 */
export type RegistryForm =
  | { kind: 'filed'; counts: RegistryCount; recordPath: string }
  | { kind: 'unrecognised'; rows: number; reason: string };

export interface SelfCheckReport {
  /** Путь отчёта относительно рабочей директории — то, что алерт называет владельцу. */
  relativePath: string;
  form: RegistryForm;
  sizeKb: number;
}

export const SELF_CHECK_FILE = 'DEVIATIONS.md';

/** Машинная запись реестра — та, в которой род есть поле. Лежит рядом с прозой. */
export const SELF_CHECK_RECORD = 'DEVIATIONS.json';

/** Куда не заглядываем: чужие деревья, вход конвейера и его собственная бухгалтерия. */
const SKIPPED_DIRECTORIES = new Set(['node_modules', '.git', '.next', 'bundle', 'handoff']);

const SEARCH_DEPTH = 2;

/**
 * Сколько в прозе строк, ПОХОЖИХ на записи, — и слово «похожих» здесь обязательно.
 *
 * Считается только для нераспознанной формы и только чтобы владелец знал порядок величины. Точным
 * это число не бывает и быть не может: `| - | - |` есть законный разделитель GFM и одновременно
 * законная запись из двух прочерков, и никакое чтение markdown их не различит. Ровно поэтому род
 * уехал в поле, а это число сопровождается словом «примерно» везде, где произносится.
 */
export function countRegistryRows(markdown: string): number {
  const lines = markdown
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('|'));

  const separators = lines.filter((line) => /^\|[\s:|-]+\|?$/.test(line)).length;

  /* Шапок ровно столько, сколько разделителей: по одной над каждым. */
  return Math.max(lines.length - 2 * separators, 0);
}

/** Разбор машинной записи реестра. Три исхода, и средний не притворяется первым. */
export function readDeviationRecord(path: string):
  | { status: 'read'; counts: RegistryCount }
  | { status: 'absent' }
  | {
      status: 'unreadable';
      reason: string;
    } {
  if (!existsSync(path)) return { status: 'absent' };

  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch (error) {
    return {
      status: 'unreadable',
      reason: `не читается: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { status: 'unreadable', reason: 'не разбирается как JSON' };
  }

  const registry = DeviationRegistry.safeParse(parsed);
  if (!registry.success) {
    return { status: 'unreadable', reason: `не той формы: ${z.prettifyError(registry.error)}` };
  }

  return {
    status: 'read',
    counts: {
      material: registry.data.entries.filter((entry) => entry.kind === 'материал').length,
      scope: registry.data.entries.filter((entry) => entry.kind === 'объём').length,
    },
  };
}

function findReportPath(directory: string, depth: number): string | null {
  const direct = join(directory, SELF_CHECK_FILE);
  if (existsSync(direct)) return direct;

  if (depth === 0) return null;

  let entries: Dirent[];
  try {
    entries = readdirSync(directory, { withFileTypes: true });
  } catch {
    return null;
  }

  for (const entry of entries) {
    if (!entry.isDirectory() || SKIPPED_DIRECTORIES.has(entry.name)) continue;

    const found = findReportPath(join(directory, entry.name), depth - 1);
    if (found !== null) return found;
  }

  return null;
}

/** Отчёт самопроверки этого workspace, или null — «план самопроверку не снимал». */
export function findSelfCheckReport(projectDirectory: string): SelfCheckReport | null {
  if (!existsSync(projectDirectory)) return null;

  const path = findReportPath(projectDirectory, SEARCH_DEPTH);
  if (path === null) return null;

  let content: string;
  try {
    content = readFileSync(path, 'utf8');
  } catch {
    return null;
  }

  const recordPath = join(dirname(path), SELF_CHECK_RECORD);
  const record = readDeviationRecord(recordPath);
  const relativeRecord = relative(projectDirectory, recordPath).replaceAll('\\', '/');

  const form: RegistryForm =
    record.status === 'read'
      ? { kind: 'filed', counts: record.counts, recordPath: relativeRecord }
      : {
          kind: 'unrecognised',
          rows: countRegistryRows(content),
          reason:
            record.status === 'absent'
              ? `машинной записи реестра (${relativeRecord}) рядом с прозой нет`
              : `машинная запись реестра (${relativeRecord}) ${record.reason}`,
        };

  return {
    relativePath: relative(projectDirectory, path).replaceAll('\\', '/'),
    form,
    sizeKb: Math.round(statSync(path).size / 1024),
  };
}

/**
 * Строка сверки — одна на обе поверхности (лента оркестратора и TG-алерт), чтобы две формы
 * финального сообщения жили в одном месте и тестировались как контракт, а не как совпадение.
 */
export function verificationLine(report: SelfCheckReport | null): string {
  if (report === null) {
    return (
      'Сверка с задумкой: отчёта расхождений (DEVIATIONS.md) в рабочей директории нет — ' +
      'план самопроверку не снимал, продукт судился только приёмками задач.'
    );
  }

  const where = `(${report.relativePath}, ${String(report.sizeKb)} КБ)`;

  /*
   * **Нераспознанная форма произносится вслух и БЕЗ чисел по родам** (А-51 п.2). Соблазн назвать
   * «примерно столько-то замен» здесь и был дефектом: приблизительный род читается как точный, и
   * сокращения выдаются за замены ровно тем же движением, что и прежде.
   */
  if (report.form.kind === 'unrecognised') {
    return (
      `Сверка с задумкой: план снимал самопроверку, но ФОРМА РЕЕСТРА НЕ РАСПОЗНАНА — ` +
      `${report.form.reason}. Род расхождений не назван ни по одной записи, поэтому числа по ` +
      `родам не приводятся: строк, похожих на записи, примерно ${String(report.form.rows)} ` +
      `${where}. Реестр без поля рода — это реестр, по которому нельзя отличить «мы не могли» от ` +
      '«мы не стали». Оценка «похоже/не похоже» — за владельцем.'
    );
  }

  const { material, scope } = report.form.counts;

  return (
    `Сверка с задумкой: план снимал самопроверку — зафиксировано расхождений: замен по ` +
    `материалу ${String(material)}, сокращений объёма ${String(scope)} ${where}; род каждой ` +
    `записи назван полем в ${report.form.recordPath}. Оценка «похоже/не похоже» — за владельцем.`
  );
}
