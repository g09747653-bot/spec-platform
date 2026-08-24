import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
  type Dirent,
} from 'node:fs';
import { join } from 'node:path';

import { z } from 'zod';

import type { Chain } from '../llm/chain.ts';

/**
 * Суждение о выполнимости задумки — на интейке, ДО сборки (А-42 п.2).
 *
 * **Первая задача, выбранная по карте отказов, а не по аварии** (`hazards.md` §1, «невыполнимая
 * задумка принята как выполнимая» — ОТКРЫТО). До сих пор каждый класс дефектов открывался
 * происшествием; этот ещё ни разу не бил, и тем ценнее закрыть его заранее.
 *
 * **Что закрывается.** Контур умеет сказать «план не покрывает задумку» (суд полноты) и не умеет
 * сказать «этого нельзя» — он берётся и молча выдаёт то, что вышло. Заказчик сформулировал лечение
 * как поведение бота: «автономный бот думает, возможно ли это, а если нет — не копирует точь-в-точь,
 * но может использовать ту же стилистику». Ключевое слово — автономный: ручное суждение сделало бы
 * прогон неавтономным ровно в том месте, о котором шла речь.
 *
 * **Разделение труда — конституция P1.** Модель отвечает на один вопрос: что из задумки
 * воспроизводимо наличными средствами, что нет, почему и что ставится взамен. **Вердикт выводит
 * КОД** из её же перечней: пусто в «недостижимом» — выполнимо целиком; пусто в «воспроизводимом» —
 * невыполнимо; иначе — частично. «Модель сказала, что всё хорошо» вердиктом не бывает.
 *
 * **Материал считает код, а не модель.** Вход суждения — не догадка о том, что лежит в директории,
 * а перепись: сколько изображений, шрифтов, страниц, байт. Модель, которой дали список файлов,
 * охотно рассуждает о материале, которого нет; переписи спорить не с чем.
 *
 * **Два следствия суждения, и оба обязательны** (А-42 п.2):
 * (а) оно объявляется владельцу ДО сборки, первым сообщением — расхождения называются заранее, а не
 *     после показа продукта (А-39);
 * (б) оно входит в план УСЛОВИЯМИ, чтобы полировка не гналась за недостижимым — тот же урок, что
 *     D-323: критерий, недостижимый по построению, не делает работу лучше, он делает её вечной.
 *
 * **Чего эта стадия НЕ делает.** Не останавливает конвейер: невыполнимость части задумки — не
 * ошибка, а факт, который надо назвать и обойти («делай максимум, объясняй расхождения заранее» —
 * А-39). Не спрашивает разрешений на материал. Не исследует — перепись и один вызов модели.
 */

export const FEASIBILITY_FILE = join('handoff', 'FEASIBILITY.json');

/**
 * Почему часть задумки недостижима — закрытый перечень из четырёх причин (А-42 п.2).
 *
 * Закрытый намеренно: свободная формулировка причины превращает суждение в эссе, а перечень
 * заставляет назвать, о чём речь. «Материал» — нужного файла нет и добыть законно нечем; «лицензия»
 * — есть, но брать нельзя; «доступ» — лежит там, куда нам ходить запрещено; «техника» — не
 * получается собрать наличным стеком.
 */
export const OBSTACLES = ['материал', 'лицензия', 'доступ', 'техника'] as const;
export type Obstacle = (typeof OBSTACLES)[number];

export const FEASIBILITY_VERDICTS = ['полностью', 'частично', 'невыполнимо'] as const;
export type FeasibilityVerdict = (typeof FEASIBILITY_VERDICTS)[number];

const OutOfReach = z.object({
  /** Что именно не воспроизводится — одной проверяемой строкой. */
  what: z.string().min(1),
  why: z.enum(OBSTACLES),
  /** Что ставится взамен. Пустой строки здесь не бывает: «ничего» — тоже решение, и его пишут. */
  instead: z.string().min(1),
});

export type OutOfReach = z.infer<typeof OutOfReach>;

/** Ответ модели: два перечня и ничего больше. Вердикт она не выносит — его выводит код. */
const ModelJudgement = z.object({
  reproducible: z.array(z.string().min(1)),
  outOfReach: z.array(OutOfReach),
});

export const FeasibilityRecord = z.object({
  verdict: z.enum(FEASIBILITY_VERDICTS),
  reproducible: z.array(z.string()),
  outOfReach: z.array(OutOfReach),
  /** Перепись материала на момент суждения — чтобы вердикт можно было перечитать вместе с фактами. */
  material: z.object({
    files: z.number().int().nonnegative(),
    bytes: z.number().int().nonnegative(),
    byKind: z.record(z.string(), z.number().int().nonnegative()),
  }),
  judgedBy: z.string(),
  at: z.string(),
});

export type FeasibilityRecord = z.infer<typeof FeasibilityRecord>;

export type FeasibilityOutcome =
  | { status: 'judged'; record: FeasibilityRecord }
  /** Суждение не состоялось — с причиной, которую лента называет. Файл не пишется. */
  | { status: 'skipped'; reason: string };

/* ─────────────────────────── перепись материала ─────────────────────────── */

/** Виды, которые перепись различает. Хватает ровно на вопрос «есть ли чем воспроизводить». */
const KINDS: readonly { kind: string; test: RegExp }[] = [
  { kind: 'изображения', test: /\.(png|jpe?g|gif|webp|avif|svg|ico|bmp)$/i },
  { kind: 'шрифты', test: /\.(woff2?|ttf|otf|eot)$/i },
  { kind: 'видео и звук', test: /\.(mp4|webm|mov|mp3|ogg|wav)$/i },
  { kind: 'разметка', test: /\.(html?|xhtml|md)$/i },
  { kind: 'стили', test: /\.(css|scss|sass|less)$/i },
  { kind: 'поведение', test: /\.(m?jsx?|tsx?|vue|svelte)$/i },
  { kind: 'данные', test: /\.(json|ya?ml|csv|xml|txt)$/i },
];

/** Служебные деревья переписи не касаются: это не материал задумки. */
const SKIP = new Set(['node_modules', '.git', '.next', 'dist', 'build', 'coverage', 'handoff']);

/** Потолок обхода — перепись остаётся переписью, а не полным сканом чужого диска. */
export const CENSUS_LIMIT = 20_000;

export interface MaterialCensus {
  files: number;
  bytes: number;
  byKind: Record<string, number>;
}

/**
 * Перепись наличного материала — обход диска, а не мнение о нём.
 *
 * Считает файлы и байты по видам. Это ровно тот вход, которого суждению не хватало бы иначе:
 * «в директории 141 изображение на 17 МБ и ни одного текстового начертания» — проверяемый факт, из
 * которого следует вывод, а «в проекте, кажется, есть картинки» — не следует ничего.
 */
export function censusMaterial(projectDirectory: string): MaterialCensus {
  const byKind: Record<string, number> = {};
  let files = 0;
  let bytes = 0;

  const walk = (directory: string): void => {
    if (files >= CENSUS_LIMIT) return;

    let entries: Dirent[];
    try {
      entries = readdirSync(directory, { withFileTypes: true, encoding: 'utf8' });
    } catch {
      /* Нечитаемая ветка — не повод ронять интейк: переписи в ней просто нет. */
      return;
    }

    for (const entry of entries) {
      if (files >= CENSUS_LIMIT) return;
      if (entry.name.startsWith('.') || SKIP.has(entry.name)) continue;

      const path = join(directory, entry.name);

      if (entry.isDirectory()) {
        walk(path);
        continue;
      }
      if (!entry.isFile()) continue;

      files += 1;
      try {
        bytes += statSync(path).size;
      } catch {
        // Файл, исчезнувший между обходом и замером, весит ноль — счётчик файлов уже верен.
      }

      const kind = KINDS.find((candidate) => candidate.test.test(entry.name))?.kind ?? 'прочее';
      byKind[kind] = (byKind[kind] ?? 0) + 1;
    }
  };

  if (existsSync(projectDirectory)) walk(projectDirectory);

  return { files, bytes, byKind };
}

/** Перепись человеческой строкой — она же уезжает в промпт и в алерт. */
export function describeCensus(census: MaterialCensus): string {
  const kinds = Object.entries(census.byKind)
    .sort(([, left], [, right]) => right - left)
    .map(([kind, count]) => `${kind}: ${String(count)}`);

  const megabytes = (census.bytes / 1_048_576).toFixed(1);

  return kinds.length === 0
    ? 'В рабочей директории материала нет.'
    : `Материал: файлов ${String(census.files)} (${megabytes} МБ) — ${kinds.join(', ')}.`;
}

/* ─────────────────────────── вердикт выводит код ─────────────────────────── */

/**
 * Вердикт — функция от двух перечней, а не мнение модели (P1).
 *
 * Модель, которой позволено самой объявить «выполнимо», объявит это и там, где перечислила пять
 * недостижимых пунктов: связность между её же списками и её же выводом ничем не обеспечена.
 */
export function verdictOf(judgement: {
  reproducible: readonly string[];
  outOfReach: readonly OutOfReach[];
}): FeasibilityVerdict {
  if (judgement.outOfReach.length === 0) return 'полностью';
  if (judgement.reproducible.length === 0) return 'невыполнимо';
  return 'частично';
}

/**
 * Условия для плана — то, ради чего суждение вообще входит в конвейер (А-42 п.2б).
 *
 * Полировка, которой не сказали, что половины материала нет, будет гнаться за расхождением, которого
 * не снять никакой работой, — и это ровно урок D-323, только с другой стороны: там недостижимым был
 * ЧИСЛОВОЙ порог, здесь недостижим сам предмет. Условие называет и то, чего не будет, и то, что
 * ставится взамен, — исполнителю нужно второе не меньше первого.
 */
export function planConditions(record: FeasibilityRecord): string[] {
  return record.outOfReach.map(
    (entry) => `${entry.what} — не воспроизводится (${entry.why}); вместо этого: ${entry.instead}`,
  );
}

/** Текст алерта владельцу: расхождения названы ДО сборки, а не после показа (А-39). */
export function describeFeasibility(record: FeasibilityRecord): string {
  const head =
    record.verdict === 'полностью'
      ? 'Задумка воспроизводима наличными средствами целиком.'
      : record.verdict === 'невыполнимо'
        ? 'Задумка наличными средствами не воспроизводится. Что можно сделать взамен — ниже.'
        : 'Задумка воспроизводима частично. Что не выйдет и что ставится взамен — ниже.';

  const reach =
    record.reproducible.length === 0
      ? []
      : ['', 'Воспроизводимо:', ...record.reproducible.map((line) => `• ${line}`)];

  const miss =
    record.outOfReach.length === 0
      ? []
      : [
          '',
          'Не воспроизводится:',
          ...record.outOfReach.map(
            (entry) => `• ${entry.what} — ${entry.why}. Взамен: ${entry.instead}`,
          ),
        ];

  return [head, ...reach, ...miss].join('\n');
}

/* ─────────────────────────── диск и модель ─────────────────────────── */

export function readFeasibility(projectDirectory: string): FeasibilityRecord | null {
  const path = join(projectDirectory, FEASIBILITY_FILE);
  if (!existsSync(path)) return null;

  try {
    return FeasibilityRecord.parse(JSON.parse(readFileSync(path, 'utf8')));
  } catch {
    /* Нечитаемое суждение — не суждение: оно просто состоится заново. */
    return null;
  }
}

export function writeFeasibility(projectDirectory: string, record: FeasibilityRecord): void {
  mkdirSync(join(projectDirectory, 'handoff'), { recursive: true });
  writeFileSync(
    join(projectDirectory, FEASIBILITY_FILE),
    `${JSON.stringify(FeasibilityRecord.parse(record), null, 2)}\n`,
    'utf8',
  );
}

const SYSTEM = [
  'Ты — Архитектор, судящий ВЫПОЛНИМОСТЬ задумки наличными средствами ДО начала сборки.',
  'Твоя единственная тема — что из задумки можно воспроизвести тем материалом, который уже лежит',
  'в рабочей директории, и что нельзя. Качество, порядок работ и выбор технологий — не твоя тема.',
  'Отвечай ТОЛЬКО JSON-объектом, без пояснений и без обрамляющих кавычек кода.',
].join(' ');

/** Промпт суждения — экспортирован, чтобы регрессия судила ВХОД, а не только выход. */
export function feasibilityPrompt(seed: string, census: MaterialCensus): string {
  return [
    'Задумка владельца (дословно):',
    seed,
    '',
    'Перепись наличного материала в рабочей директории (посчитана кодом, это факт, а не оценка):',
    describeCensus(census),
    '',
    'ПРАВИЛА СУЖДЕНИЯ:',
    '1. «Копия» по умолчанию означает узнаваемое воспроизведение состава, порядка, стилистики и',
    '   поведения — НЕ пиксельное тождество. Стопроцентная планка возникает только там, где владелец',
    '   произнёс её сам («от А до Я», «совпадение на 100%»).',
    '2. Невозможность воспроизвести часть — НЕ повод отказаться от работы. Всё, что возможно,',
    '   делается; недостающее возмещается той же стилистикой, и об этом говорится вслух.',
    '3. Разрешений на материал не спрашивают. Если чего-то нет или брать нельзя — это причина,',
    '   которую ты называешь, и замена, которую ты предлагаешь, а не вопрос владельцу.',
    '4. Причина недостижимости — ровно одна из четырёх:',
    '   "материал" — нужного файла нет и законно взять неоткуда;',
    '   "лицензия" — материал есть, но использовать его нельзя;',
    '   "доступ" — материал лежит там, куда ходить запрещено;',
    '   "техника" — наличным стеком это не собирается.',
    '5. Не выдумывай недостижимого из осторожности. Пункт попадает в outOfReach только тогда, когда',
    '   перепись или сама задумка ПРЯМО говорят, что средства отсутствуют.',
    '',
    'Верни JSON вида:',
    '{"reproducible":["что из задумки делается наличными средствами — одной проверяемой строкой", "…"],',
    ' "outOfReach":[{"what":"что именно не выйдет","why":"материал","instead":"что ставится взамен"}]}',
    '',
    'Пустой outOfReach — законный ответ: он означает «задумка выполнима целиком».',
  ].join('\n');
}

/** Модель, обернувшая JSON в ограду или во фразу, всё же ответила — приём общий с судом полноты. */
function extractJson(text: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
  const candidate = (fenced?.[1] ?? text).trim();

  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end <= start) return null;

  try {
    return JSON.parse(candidate.slice(start, end + 1));
  } catch {
    return null;
  }
}

/**
 * Суждение целиком: перепись → модель → вердикт кодом → запись на диск.
 *
 * Идемпотентно по диску, как и суд полноты: интейк идёт заново на каждом перезаходе, а суждение,
 * однажды объявленное владельцу, менять под ним — это второй ответ на тот же вопрос. Пересудить его
 * можно только снеся файл, и это осознанное действие оператора.
 */
export async function judgeFeasibility(args: {
  projectDirectory: string;
  seed: string | null;
  chain: Chain | null;
  now?: () => number;
}): Promise<FeasibilityOutcome> {
  const { projectDirectory, seed, chain } = args;

  const existing = readFeasibility(projectDirectory);
  if (existing !== null) return { status: 'judged', record: existing };

  if (seed === null) {
    return { status: 'skipped', reason: 'задумки (SEED.md) в рабочей директории нет' };
  }
  if (chain === null) {
    return { status: 'skipped', reason: 'провайдер роли архитектора не настроен' };
  }

  const material = censusMaterial(projectDirectory);

  let answer: { text: string; provider: string };
  try {
    answer = await chain.generate({ system: SYSTEM, prompt: feasibilityPrompt(seed, material) });
  } catch (error) {
    return {
      status: 'skipped',
      reason: `провайдеры недоступны: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  const parsed = ModelJudgement.safeParse(extractJson(answer.text));
  if (!parsed.success) {
    return {
      status: 'skipped',
      reason: `ответ модели не разобран: ${z.prettifyError(parsed.error)}`,
    };
  }

  const record: FeasibilityRecord = {
    verdict: verdictOf(parsed.data),
    reproducible: parsed.data.reproducible,
    outOfReach: parsed.data.outOfReach,
    material,
    judgedBy: answer.provider,
    at: new Date((args.now ?? Date.now)()).toISOString(),
  };

  writeFeasibility(projectDirectory, record);
  return { status: 'judged', record };
}
