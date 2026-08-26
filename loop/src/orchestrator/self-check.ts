import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

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
 * Реестр расхождений — ДВА РАЗДЕЛА, и числа называются раздельно (А-44 п.3).
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
 * **Воротами не делается ни то, ни другое.** Реестр публикуется, а решает по нему человек.
 */

/** Заголовки разделов — один источник правды: их же требует промпт плана от исполнителя. */
export const REGISTRY_SECTIONS = Object.freeze({
  material: 'Замены по материалу',
  scope: 'Сокращения объёма',
} as const);

export interface RegistryCount {
  /** Раздел I — замены, у которых названа причина невозможности. */
  material: number;
  /** Раздел II — сокращения объёма: материал был, работа не сделана. */
  scope: number;
  /**
   * Строки вне обоих разделов — старая форма реестра, одной кучей.
   *
   * Считаются отдельно и называются вслух: молча приписать их к первому разделу значило бы выдать
   * сокращения за замены, то есть сделать ровно то, ради чего разделы и заведены.
   */
  unfiled: number;
}

export interface SelfCheckReport {
  /** Путь отчёта относительно рабочей директории — то, что алерт называет владельцу. */
  relativePath: string;
  /** Строк-записей в таблицах реестра, раздельно по разделам. */
  entries: RegistryCount;
  sizeKb: number;
}

export const SELF_CHECK_FILE = 'DEVIATIONS.md';

/** Куда не заглядываем: чужие деревья, вход конвейера и его собственная бухгалтерия. */
const SKIPPED_DIRECTORIES = new Set(['node_modules', '.git', '.next', 'bundle', 'handoff']);

const SEARCH_DEPTH = 2;

/**
 * Счёт записей реестра по разделам: строки-данные markdown-таблиц под своим заголовком.
 *
 * Строка данных начинается с `|` и не является ни разделителем (`|---|`), ни шапкой. Шапок ровно
 * столько, сколько разделителей — по одной над каждым, так что арифметика не требует разбора
 * структуры: данные = все pipe-строки − 2 × разделители. Модельный текст вокруг таблиц счёту не
 * мешает и в него не входит.
 *
 * Раздел определяется по ближайшему заголовку выше: он опознаётся по ВХОЖДЕНИЮ имени раздела, а не
 * по точному совпадению строки, — «## II. Сокращения объёма (решение исполнителя)» есть тот же
 * раздел, и придираться к его оформлению значило бы считать ноль там, где записи есть.
 */
export function countRegistryEntries(markdown: string): RegistryCount {
  const buckets: Record<keyof RegistryCount, string[]> = { material: [], scope: [], unfiled: [] };
  let current: keyof RegistryCount = 'unfiled';

  for (const raw of markdown.split('\n')) {
    const line = raw.trim();

    if (line.startsWith('#')) {
      const heading = line.toLowerCase();
      current = heading.includes(REGISTRY_SECTIONS.material.toLowerCase())
        ? 'material'
        : heading.includes(REGISTRY_SECTIONS.scope.toLowerCase())
          ? 'scope'
          : 'unfiled';
      continue;
    }

    if (line.startsWith('|')) buckets[current].push(line);
  }

  const rows = (lines: readonly string[]): number => {
    const separators = lines.filter((line) => /^\|[\s:|-]+\|?$/.test(line)).length;
    return Math.max(lines.length - 2 * separators, 0);
  };

  return {
    material: rows(buckets.material),
    scope: rows(buckets.scope),
    unfiled: rows(buckets.unfiled),
  };
}

function findReportPath(directory: string, depth: number): string | null {
  const direct = join(directory, SELF_CHECK_FILE);
  if (existsSync(direct)) return direct;

  if (depth === 0) return null;

  for (const entry of readdirSync(directory, { withFileTypes: true })) {
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

  return {
    relativePath: relative(projectDirectory, path).replaceAll('\\', '/'),
    entries: countRegistryEntries(content),
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

  const { material, scope, unfiled } = report.entries;

  const filed =
    `замен по материалу ${String(material)}, сокращений объёма ${String(scope)}` +
    (unfiled === 0
      ? ''
      : `; записей вне разделов ${String(unfiled)} — реестр старой формы, ` +
        'род расхождения по ним не назван');

  return (
    `Сверка с задумкой: план снимал самопроверку — зафиксировано расхождений: ${filed} ` +
    `(${report.relativePath}, ${String(report.sizeKb)} КБ). Оценка «похоже/не похоже» — за владельцем.`
  );
}
