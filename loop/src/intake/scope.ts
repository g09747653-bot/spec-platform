import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { z } from 'zod';

import type { Chain } from '../llm/chain.ts';

/**
 * Суждение об ОБЪЁМЕ — парное суждению о выполнимости (А-44 п.4).
 *
 * **Откуда оно.** Заказчик поставил рядом два результата одного и того же контура: у NEURA **44
 * ссылки и ни одной в никуда**, у копии — **86 и 74 в никуда**. Причина не в мастерстве и не в
 * модели: **одна сессия ВЫБИРАЛА СЕБЕ ОБЪЁМ** и потому доводила всё, что начинала, а другая взяла
 * объём, назначенный ей брифом, и добрала недостающее декорацией.
 *
 * Выполнимость судит МАТЕРИАЛ: что вообще возможно наличными средствами. **Объём против бюджета не
 * судит никто** — и это ровно та дыра, сквозь которую в продукт попадают 74 мёртвые ссылки.
 *
 * **Сокращение ДО сборки — это выбор. Сокращение ПОСЛЕ — это заглушка.** Отсюда место стадии:
 * сразу за выполнимостью, до плана, и суженный объём уезжает плану уже суженным.
 *
 * **Разделение труда — конституция P1, то же, что у выполнимости.** Модель отвечает на два вопроса
 * о КАЖДОМ пункте брифа: во что он обойдётся (в единицах доведённого) и какого он рода — основное,
 * поддерживающее, необязательное (перечень закрыт). **Решает КОД**: сортирует по роду, набирает до
 * бюджета, остальное режет. Модель, которой позволено самой объявить «всё влезает», объявит это.
 *
 * **Стадия ничего не останавливает** и воротами не бывает: сужение — факт, который называют
 * владельцу одним алертом вместе с суждением о выполнимости, а работа идёт дальше.
 */

export const SCOPE_FILE = join('handoff', 'SCOPE.json');

/**
 * Род пункта брифа — закрытый перечень (тот же приём, что у причин недостижимости).
 *
 * Закрытый, потому что по нему режут: свободная формулировка рода превратила бы порядок сокращения
 * в спор о словах, а он обязан быть арифметикой.
 */
export const NECESSITIES = ['основное', 'поддерживающее', 'необязательное'] as const;
export type Necessity = (typeof NECESSITIES)[number];

const RANK: Readonly<Record<Necessity, number>> = {
  основное: 0,
  поддерживающее: 1,
  необязательное: 2,
};

/**
 * Бюджет объёма — в ЕДИНИЦАХ ДОВЕДЁННОГО, и число измерено, а не назначено.
 *
 * 44 — столько живых, никуда не ведущих в никуда элементов довёл до рабочего состояния ОДИН
 * контекст, выбиравший себе объём сам (NEURA, замер А-46). Это не идеал и не предел: это
 * единственное известное нам число, при котором контур довёл всё, что начал. Оператор вправе
 * поставить своё — но своё, а не «сколько получится».
 */
export const SCOPE_BUDGET_UNITS = 44;

/** Во что обходится пункт, о котором модель не сказала ничего. Средняя цена, а не ноль. */
const DEFAULT_UNITS = 4;

const ModelItem = z.object({
  /** Заголовок пункта брифа — дословно тот, что дан во входе. */
  title: z.string().min(1),
  /** Во что обойдётся ДОВЕДЕНИЕ пункта до рабочего состояния, в единицах. */
  units: z.number().int().positive().max(500),
  necessity: z.enum(NECESSITIES),
  why: z.string().min(1),
});

const ModelScope = z.object({ items: z.array(ModelItem).min(1) });

/** Оценка одного пункта — то, что модель отдаёт, а код превращает в решение. */
export type ScopeEstimate = z.infer<typeof ModelItem>;

/**
 * Исходы суждения — ТРИ, и третий заведён живым багом (А-51 п.3).
 *
 * `сверх бюджета` — случай, при котором даже САМОЕ ГЛАВНОЕ дороже отпущенного. Прежде его не было
 * в перечне, и он молча становился «полностью»: единственный пункт ценой 500 при бюджете 10 давал
 * владельцу «Объём брифа укладывается в отпущенное: 500 единиц работы при бюджете 10. Сокращать
 * нечего — делается всё», то есть ровно противоположное правде. Обещано было другое: «делай самое
 * главное И ГОВОРИ ОБ ЭТОМ».
 */
export const SCOPE_VERDICTS = ['полностью', 'сужено', 'сверх бюджета'] as const;
export type ScopeVerdict = (typeof SCOPE_VERDICTS)[number];

const ScopeItem = z.object({
  title: z.string(),
  units: z.number().int().nonnegative(),
  necessity: z.enum(NECESSITIES),
  why: z.string(),
});

export type ScopeItem = z.infer<typeof ScopeItem>;

export const ScopeRecord = z.object({
  verdict: z.enum(SCOPE_VERDICTS),
  budgetUnits: z.number().int().positive(),
  /** Во что обошёлся бы бриф целиком — сумма оценок. */
  plannedUnits: z.number().int().nonnegative(),
  keptUnits: z.number().int().nonnegative(),
  cutUnits: z.number().int().nonnegative(),
  kept: z.array(ScopeItem),
  cut: z.array(ScopeItem),
  /** Пункты брифа, о которых модель не сказала ничего: цена по умолчанию, и это названо. */
  unestimated: z.array(z.string()),
  judgedBy: z.string(),
  at: z.string(),
});

export type ScopeRecord = z.infer<typeof ScopeRecord>;

export type ScopeOutcome =
  { status: 'judged'; record: ScopeRecord } | { status: 'skipped'; reason: string };

/* ─────────────────────────── решает код ─────────────────────────── */

const normalise = (title: string): string => title.trim().toLowerCase().replace(/\s+/g, ' ');

/**
 * Сужение объёма — ЧИСТАЯ функция над оценками и бюджетом (P1).
 *
 * Порядок набора: сперва всё основное, потом поддерживающее, потом необязательное; внутри рода —
 * порядок брифа. Пункт, который в бюджет не помещается, режется, а НЕ ужимается: ужатый пункт и
 * есть та самая заглушка, ради запрета которой стадия заведена. Единственное исключение —
 * первый пункт: бюджет, в который не влезает ничего, означает «делай самое главное и говори об
 * этом», а не «не делай ничего».
 */
export function narrowScope(args: {
  titles: readonly string[];
  estimates: readonly ScopeEstimate[];
  budgetUnits: number;
}): {
  kept: ScopeItem[];
  cut: ScopeItem[];
  unestimated: string[];
  /**
   * Даже удержанное не влезло в бюджет (А-51 п.3).
   *
   * Возможно ровно в одном случае — первый по роду пункт дороже всего бюджета, — и именно он
   * прежде выдавался за «укладывается». Возвращается фактом, а не выводится из чисел вызывающим:
   * «сумма больше бюджета» вычислима, но СМЫСЛ («самое главное не влезло») живёт здесь.
   */
  overBudget: boolean;
} {
  const byTitle = new Map(args.estimates.map((item) => [normalise(item.title), item]));
  const unestimated: string[] = [];

  const items: ScopeItem[] = args.titles.map((title) => {
    const found = byTitle.get(normalise(title));
    if (found === undefined) {
      unestimated.push(title);
      return {
        title,
        units: DEFAULT_UNITS,
        necessity: 'поддерживающее' as const,
        why: 'модель этот пункт не оценила — цена по умолчанию',
      };
    }
    return { title, units: found.units, necessity: found.necessity, why: found.why };
  });

  const ordered = items
    .map((item, index) => ({ item, index }))
    .sort((left, right) => {
      const byRank = RANK[left.item.necessity] - RANK[right.item.necessity];
      return byRank === 0 ? left.index - right.index : byRank;
    })
    .map((entry) => entry.item);

  const kept: ScopeItem[] = [];
  const cut: ScopeItem[] = [];
  let spent = 0;

  for (const item of ordered) {
    if (kept.length > 0 && spent + item.units > args.budgetUnits) {
      cut.push(item);
      continue;
    }
    kept.push(item);
    spent += item.units;
  }

  /* Порядок брифа возвращается обоим спискам: владелец читает свой бриф, а не нашу сортировку. */
  const position = new Map(args.titles.map((title, index) => [title, index]));
  const inBriefOrder = (list: ScopeItem[]): ScopeItem[] =>
    [...list].sort(
      (left, right) => (position.get(left.title) ?? 0) - (position.get(right.title) ?? 0),
    );

  return {
    kept: inBriefOrder(kept),
    cut: inBriefOrder(cut),
    unestimated,
    overBudget: spent > args.budgetUnits,
  };
}

const sum = (items: readonly ScopeItem[]): number =>
  items.reduce((total, item) => total + item.units, 0);

/** Алерт владельцу: сокращение названо ДО сборки, вместе с суждением о выполнимости. */
export function describeScope(record: ScopeRecord): string {
  if (record.verdict === 'полностью') {
    return (
      `Объём брифа укладывается в отпущенное: ${String(record.plannedUnits)} единиц работы при ` +
      `бюджете ${String(record.budgetUnits)}. Сокращать нечего — делается всё.`
    );
  }

  /*
   * **Свой алерт своему случаю** (А-51 п.3). Обещание §5 звучало «делай самое главное и говори об
   * этом»; молчаливое «укладывается» было нарушением обеих его половин сразу.
   */
  if (record.verdict === 'сверх бюджета') {
    const first = record.kept[0];

    return [
      `Объём брифа НЕ УКЛАДЫВАЕТСЯ даже в один пункт: самое главное — «${first?.title ?? '—'}» — ` +
        `стоит ${String(record.keptUnits)} единиц при бюджете ${String(record.budgetUnits)}.`,
      '',
      'Берусь за него одного и говорю об этом ЗАРАНЕЕ, а не покажу заглушку потом. Всё остальное',
      `(${String(record.cut.length)} пунктов, ${String(record.cutUnits)} единиц) не берётся.`,
      ...(record.cut.length === 0
        ? []
        : [
            '',
            'Не берусь:',
            ...record.cut.map((item) => `• ${item.title} — ${item.necessity}; ${item.why}`),
          ]),
      '',
      'Бюджет, в который не влезает ничего, означает «делай самое главное», а не «не делай ничего»',
      '— но и не «всё влезло». Число публикуется как есть; воротами оно не становится.',
    ].join('\n');
  }

  return [
    `Объём брифа СУЖЕН ДО СБОРКИ: ${String(record.plannedUnits)} единиц работы при бюджете ` +
      `${String(record.budgetUnits)}. Довожу до рабочего состояния ${String(record.kept.length)} ` +
      `пунктов (${String(record.keptUnits)} единиц), не берусь за ${String(record.cut.length)} ` +
      `(${String(record.cutUnits)}).`,
    '',
    'Не берусь:',
    ...record.cut.map((item) => `• ${item.title} — ${item.necessity}; ${item.why}`),
    '',
    'Сокращение ДО сборки — это выбор; сокращение ПОСЛЕ — это заглушка. Поэтому оно названо здесь,',
    'а не обнаружится в продукте декоративной ссылкой.',
  ].join('\n');
}

/**
 * Условия для плана: что делать НЕ НАДО — прямым запретом.
 *
 * Пара к `planConditions` выполнимости, и разница между ними — существо стадии: там названо
 * недостижимое и замена ему, здесь — достижимое, за которое сознательно не берутся. Замены нет и
 * быть не должно: замена сокращённому пункту и есть заглушка.
 */
export function scopeExclusions(record: ScopeRecord): string[] {
  return record.cut.map(
    (item) =>
      `${item.title} — НЕ ДЕЛАТЬ: объём сужен до сборки (${item.necessity}; ${item.why}). ` +
      'Ни заглушки, ни декоративной ссылки на это место не ставить — пункта просто нет.',
  );
}

/* ─────────────────────────── диск и модель ─────────────────────────── */

export function readScope(projectDirectory: string): ScopeRecord | null {
  const path = join(projectDirectory, SCOPE_FILE);
  if (!existsSync(path)) return null;

  try {
    return ScopeRecord.parse(JSON.parse(readFileSync(path, 'utf8')));
  } catch {
    return null;
  }
}

export function writeScope(projectDirectory: string, record: ScopeRecord): void {
  mkdirSync(join(projectDirectory, 'handoff'), { recursive: true });
  writeFileSync(
    join(projectDirectory, SCOPE_FILE),
    `${JSON.stringify(ScopeRecord.parse(record), null, 2)}\n`,
    'utf8',
  );
}

const SYSTEM = [
  'Ты — Архитектор, оценивающий ОБЪЁМ работы ДО начала сборки. Твоя единственная тема — во что',
  'обойдётся доведение каждого пункта брифа ДО РАБОЧЕГО СОСТОЯНИЯ и какого этот пункт рода.',
  'Ты НЕ решаешь, что делать, а что нет: это решает код по бюджету. Ты НЕ оцениваешь качество',
  'и НЕ предлагаешь технологий. Отвечай ТОЛЬКО JSON-объектом, без пояснений и без обрамляющих',
  'кавычек кода.',
].join(' ');

/**
 * Промпт стадии — экспортирован, чтобы регрессия судила ВХОД, а не только выход.
 *
 * **Бюджета в промпте НЕТ, и это правка, а не упущение** (А-51 п.3, вердикт §10.4). Прежде число
 * называлось модели прямым текстом — а кто знает ворота, тот под них подгоняет: оценка перестаёт
 * быть оценкой и становится подгонкой под «всё влезло». Модель отвечает на вопрос «во что
 * обойдётся довести пункт до рабочего состояния», и ответ обязан не зависеть от того, сколько нам
 * отпущено. Сравнение с бюджетом — работа кода, и код не спрашивает у модели разрешения.
 *
 * Единица определена в промпте по-прежнему: без определения число не значит ничего.
 */
export function scopePrompt(seed: string, titles: readonly string[]): string {
  return [
    'Задумка владельца (дословно):',
    seed,
    '',
    'Пункты брифа — то, чего задумка требует по охвату:',
    ...titles.map((title, index) => `${String(index + 1)}. ${title}`),
    '',
    'ЕДИНИЦА — это один элемент, доведённый до РАБОЧЕГО состояния: страница, которая открывается',
    'и живёт; ссылка, которая ведёт куда обещает; форма, которая отправляет; меню, которое',
    'раскрывается и не ломается. Декоративная ссылка, пустой раздел и кнопка с сообщением',
    '«функция недоступна» единицами НЕ являются и в счёт не идут.',
    '',
    'ПРАВИЛА ОЦЕНКИ:',
    '1. Оцени КАЖДЫЙ пункт: units — во что обойдётся довести его до рабочего состояния.',
    '2. necessity — ровно одно из трёх:',
    '   "основное" — без этого задумки нет вовсе;',
    '   "поддерживающее" — задумка узнаётся и без него, но заметно беднеет;',
    '   "необязательное" — приятно иметь.',
    '3. Оценивай ЧЕСТНО. Сколько всего работы отпущено, тебе НЕ СООБЩАЕТСЯ намеренно: подогнать',
    '   оценку под чужой предел — значит не оценить, а угадать. Заниженная оценка не увеличивает',
    '   сделанное — она превращает недоделанное в заглушку, а заглушка запрещена безусловно.',
    '4. Что делать, а что нет, решаешь НЕ ты: код наберёт по роду до бюджета и остальное отрежет.',
    '',
    'Верни JSON вида:',
    '{"items":[{"title":"дословный заголовок пункта из списка выше","units":6,',
    '  "necessity":"основное","why":"почему столько и почему такого рода"}]}',
  ].join('\n');
}

/** Модель, обернувшая JSON в ограду или во фразу, всё же ответила — приём общий со всей веткой. */
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
 * Суждение целиком: оценки модели → сужение кодом → запись на диск.
 *
 * Идемпотентно по диску, как и суждение о выполнимости: однажды объявленный владельцу объём менять
 * под ним — второй ответ на тот же вопрос. Пересудить можно, снеся файл, и это осознанный акт.
 */
export async function judgeScope(args: {
  projectDirectory: string;
  seed: string | null;
  titles: readonly string[];
  chain: Chain | null;
  budgetUnits?: number;
  now?: () => number;
}): Promise<ScopeOutcome> {
  const existing = readScope(args.projectDirectory);
  if (existing !== null) return { status: 'judged', record: existing };

  if (args.seed === null) {
    return { status: 'skipped', reason: 'задумки (SEED.md) в рабочей директории нет' };
  }
  if (args.titles.length === 0) {
    return { status: 'skipped', reason: 'бриф не называет ни одного пункта охвата' };
  }
  if (args.chain === null) {
    return { status: 'skipped', reason: 'провайдер роли архитектора не настроен' };
  }

  const budgetUnits = args.budgetUnits ?? SCOPE_BUDGET_UNITS;

  let answer: { text: string; provider: string };
  try {
    answer = await args.chain.generate({
      system: SYSTEM,
      prompt: scopePrompt(args.seed, args.titles),
      maxOutputTokens: 8192,
    });
  } catch (error) {
    return {
      status: 'skipped',
      reason: `провайдеры недоступны: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  const parsed = ModelScope.safeParse(extractJson(answer.text));
  if (!parsed.success) {
    return {
      status: 'skipped',
      reason: `ответ модели не разобран: ${z.prettifyError(parsed.error)}`,
    };
  }

  const narrowed = narrowScope({
    titles: args.titles,
    estimates: parsed.data.items,
    budgetUnits,
  });

  const record: ScopeRecord = {
    /*
     * Порядок проверок — порядок правды: «не влезло даже главное» бьёт первым, потому что при
     * пустом `cut` оно прежде читалось как «полностью», и это был живой баг (А-51 п.3).
     */
    verdict: narrowed.overBudget
      ? 'сверх бюджета'
      : narrowed.cut.length === 0
        ? 'полностью'
        : 'сужено',
    budgetUnits,
    plannedUnits: sum(narrowed.kept) + sum(narrowed.cut),
    keptUnits: sum(narrowed.kept),
    cutUnits: sum(narrowed.cut),
    kept: narrowed.kept,
    cut: narrowed.cut,
    unestimated: narrowed.unestimated,
    judgedBy: answer.provider,
    at: new Date((args.now ?? Date.now)()).toISOString(),
  };

  writeScope(args.projectDirectory, record);
  return { status: 'judged', record };
}
