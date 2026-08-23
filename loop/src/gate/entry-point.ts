import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * Один входной канал в готовую работу (А-35 п.2в, уточнено А-35.2).
 *
 * **Формулировка заказчика дословна и она про ОПЫТ, а не про форму файла:** «недопустимо разбить
 * готовый сайт на непонятные части: обычный человек не разберётся — ему нужен localhost или одно
 * нажатие, которое собирает всё; провал — ходить по папке и смотреть каждую деталь». Внутренняя
 * структура остаётся свободой архитектора исполнения; проверяется ровно одно: существует ли
 * ОДНО действие, после которого работа открыта целиком.
 *
 * Механически это разложено на два вопроса, и оба чистые:
 *
 * 1. **Есть ли одно действие?** Корневой `index.html` (двойной щелчок), либо объявленная команда
 *    запуска (`npm start` / `start.cmd` / `start.sh`), поднимающая адрес.
 * 2. **Открывает ли оно работу целиком?** Каждая страница артефакта обязана быть достижима из
 *    этой точки по ссылкам — прямо или через страницу, которая уже достижима. Страница, до которой
 *    можно добраться только открыв её файл руками, и есть «часть html, разбитая по другому месту».
 *
 * Достижимость считается обходом в ширину, а не проверкой «есть ли ссылка на главной»: осознанная
 * навигация в два шага (главная → каталог → карточка) остаётся одним входом, а вот страница-сирота
 * не спасается ничем.
 */

export interface EntryFacts {
  /** Точки входа, найденные в корне: страница и/или команда запуска. */
  entries: readonly string[];
  /** Все страницы артефакта, путями от корня рабочей директории. */
  pages: readonly string[];
  /** Ссылки со страницы на страницы: ключ — страница, значение — куда она ведёт. */
  links: Readonly<Record<string, readonly string[]>>;
}

export interface EntryVerdict {
  verdict: 'single-entry' | 'scattered';
  /** Точка входа, если она одна и работает. */
  entry: string | null;
  findings: string[];
  /** Страницы, до которых от входа не дойти. Пусто — путь есть до каждой. */
  unreachable: string[];
}

/** Каталоги, которые артефактом не являются: инструменты, эталоны, сборки, зависимости. */
const NOT_THE_ARTIFACT = [
  'node_modules',
  '.git',
  '.next',
  'bundle',
  'handoff',
  'tools',
  'test-results',
  'dist',
  'coverage',
];

/** Команды запуска, которые считаются «одним нажатием». */
const START_FILES = ['start.cmd', 'start.bat', 'start.sh', 'start.ps1', 'Makefile'];

/**
 * Вердикт по фактам — ЧИСТАЯ функция, без диска.
 *
 * Пробелы называются так, как их прочтёт владелец: не «нарушен инвариант», а что именно ему
 * придётся делать руками, если оставить как есть.
 */
export function judgeEntryPoint(facts: EntryFacts): EntryVerdict {
  const findings: string[] = [];

  if (facts.entries.length === 0) {
    findings.push(
      'Одного входа нет: в корне нет ни index.html, ни объявленной команды запуска. ' +
        'Работу придётся открывать по файлам — это и есть «ходить по папке».',
    );
    return { verdict: 'scattered', entry: null, findings, unreachable: [...facts.pages] };
  }

  /*
   * Несколько способов запустить ОДНУ и ту же работу — не дефект, а удобство: щёлкнуть по файлу
   * или поднять адрес. Дефект — когда работа не открывается целиком ни одним из них. Поэтому
   * входов может быть больше одного, а называется главный: команда запуска впереди файла, потому
   * что «собирает и показывает всё» — сильнее, чем «открывает одну страницу».
   */
  const entry =
    facts.entries.find((candidate) => !candidate.endsWith('.html')) ?? facts.entries[0] ?? null;

  /* Обход в ширину от корневой страницы: навигация в два шага — всё ещё один вход. */
  const start = facts.pages.includes('index.html') ? 'index.html' : facts.pages[0];
  const reached = new Set<string>(start === undefined ? [] : [start]);
  const queue = start === undefined ? [] : [start];

  while (queue.length > 0) {
    const page = queue.shift();
    if (page === undefined) continue;
    for (const link of facts.links[page] ?? []) {
      if (facts.pages.includes(link) && !reached.has(link)) {
        reached.add(link);
        queue.push(link);
      }
    }
  }

  const unreachable = facts.pages.filter((page) => !reached.has(page));

  if (unreachable.length > 0) {
    findings.push(
      `Из точки входа не открывается вся работа: ${String(unreachable.length)} ` +
        `${unreachable.length === 1 ? 'страница' : 'страниц'} достижимы только открытием файла ` +
        `руками (${unreachable.join(', ')}).`,
    );
  }

  return {
    verdict: findings.length === 0 ? 'single-entry' : 'scattered',
    entry,
    findings,
    unreachable,
  };
}

/** Страницы артефакта на диске: html вне инструментальных и служебных каталогов. */
function collectPages(directory: string, current = directory, found: string[] = []): string[] {
  for (const item of readdirSync(current, { withFileTypes: true })) {
    if (NOT_THE_ARTIFACT.includes(item.name)) continue;
    const path = join(current, item.name);
    if (item.isDirectory()) {
      collectPages(directory, path, found);
    } else if (/\.html?$/i.test(item.name)) {
      found.push(relative(directory, path).replaceAll('\\', '/'));
    }
  }
  return found;
}

/** Ссылки страницы на другие страницы — href из разметки, приведённые к путям от корня. */
function linksOf(directory: string, page: string): string[] {
  const html = readFileSync(join(directory, page), 'utf8');
  const base = page.includes('/') ? `${page.slice(0, page.lastIndexOf('/'))}/` : '';
  const links = new Set<string>();

  for (const match of html.matchAll(/href\s*=\s*["']([^"'#?]+)/gi)) {
    const href = match[1];
    if (href === undefined || /^(https?:|mailto:|tel:|data:)/i.test(href)) continue;
    if (!/\.html?$/i.test(href)) continue;

    const resolved = href.startsWith('/')
      ? href.slice(1)
      : `${base}${href}`
          .split('/')
          .reduce<string[]>((parts, part) => {
            if (part === '.' || part === '') return parts;
            if (part === '..') return parts.slice(0, -1);
            return [...parts, part];
          }, [])
          .join('/');

    links.add(resolved);
  }

  return [...links];
}

/** Факты о рабочей директории — единственное место, где этот модуль трогает диск. */
export function collectEntryFacts(directory: string): EntryFacts {
  const pages = collectPages(directory).sort((a, b) => a.localeCompare(b));

  const entries: string[] = [];
  if (pages.includes('index.html')) entries.push('index.html');

  for (const file of START_FILES) {
    if (existsSync(join(directory, file)) && statSync(join(directory, file)).isFile()) {
      entries.push(file);
    }
  }

  const packageJson = join(directory, 'package.json');
  if (existsSync(packageJson)) {
    try {
      const parsed: unknown = JSON.parse(readFileSync(packageJson, 'utf8'));
      const scripts =
        typeof parsed === 'object' && parsed !== null && 'scripts' in parsed
          ? (parsed as { scripts?: Record<string, unknown> }).scripts
          : undefined;
      if (scripts !== undefined && typeof scripts.start === 'string') entries.push('npm start');
    } catch {
      /* Нечитаемый package.json точкой входа не является — и молчать об этом нечего. */
    }
  }

  const links: Record<string, string[]> = {};
  for (const page of pages) links[page] = linksOf(directory, page);

  return { entries, pages, links };
}
