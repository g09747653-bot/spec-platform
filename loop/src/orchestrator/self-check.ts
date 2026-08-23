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

export interface SelfCheckReport {
  /** Путь отчёта относительно рабочей директории — то, что алерт называет владельцу. */
  relativePath: string;
  /** Строк-записей в таблицах реестра — главный агрегат отчёта, посчитанный кодом. */
  entries: number;
  sizeKb: number;
}

export const SELF_CHECK_FILE = 'DEVIATIONS.md';

/** Куда не заглядываем: чужие деревья, вход конвейера и его собственная бухгалтерия. */
const SKIPPED_DIRECTORIES = new Set(['node_modules', '.git', '.next', 'bundle', 'handoff']);

const SEARCH_DEPTH = 2;

/**
 * Счёт записей реестра: строки-данные markdown-таблиц.
 *
 * Строка данных начинается с `|` и не является ни разделителем (`|---|`), ни шапкой. Шапок ровно
 * столько, сколько разделителей — по одной над каждым, так что арифметика не требует разбора
 * структуры: данные = все pipe-строки − 2 × разделители. Модельный текст вокруг таблиц счёту не
 * мешает и в него не входит.
 */
export function countRegistryEntries(markdown: string): number {
  const pipeRows = markdown
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('|'));

  const separators = pipeRows.filter((line) => /^\|[\s:|-]+\|?$/.test(line)).length;

  return Math.max(pipeRows.length - 2 * separators, 0);
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

  return (
    `Сверка с задумкой: план снимал самопроверку — зафиксировано расхождений: ${String(report.entries)} ` +
    `(${report.relativePath}, ${String(report.sizeKb)} КБ). Оценка «похоже/не похоже» — за владельцем.`
  );
}
