import { readFileSync } from 'node:fs';
import { basename, extname } from 'node:path';

import { z } from 'zod';

import type { Chain } from '../llm/chain.ts';
import type { LlmImage } from '../llm/types.ts';

import type { EntryVerdict } from './entry-point.ts';

/**
 * Суд качества с глазами — две оси (А-35 п.2б, усилено А-35.1 п.2).
 *
 * **Почему приёмка до сих пор ничего не видела.** Она судила POSIX-инварианты («файл создан»,
 * «node --check прошёл») и pixel-diff. Оба замера были зелёными на продукте, о котором заказчик
 * сказал «кнопки расходятся, дизайн съезжает… набросок статичных картинок». Замер — не судья:
 * число расхождений пикселей ничего не говорит о том, читается ли вещь как одна вещь.
 *
 * Отсюда две оси, и обе судятся, а не предполагаются:
 *
 * **I. Связность** — глаза. Скриншоты уходят звену, которое их ДЕЙСТВИТЕЛЬНО смотрит, и оно
 * отвечает доской «связно / съехало, и что именно». Зонд 2026-08-23 намерил обе стороны: мост
 * подписки (`claude-cli`) на картинку в теле запроса честно ответил `{"seen":false}` — его
 * OpenAI-совместимая схема оставляет от сообщения только текст, а CLI за ним работает с
 * `--tools ''` и файлов не читает; google-звено на том же зонде ответило `{"seen":true}` и назвало
 * цвет. Поэтому цепочка отбирает звенья по способности видеть (`supportsImages`), а не по порядку:
 * звено, молча выбросившее картинку, вернуло бы уверенный текст о том, чего не смотрело.
 *
 * **II. Живость** — поведение. «Современный сайт обязан жить: hover, плавные появления,
 * работающие слайдеры, движение», и статичных скриншотов для этой оси недостаточно по построению.
 * Поэтому вердикт живости выносит КОД по поведенческим уликам: снял ли прогон реальное изменение
 * при наведении, при прокрутке, само по себе во времени. Признаки движения в исходниках
 * (`transition`, `@keyframes`, `IntersectionObserver`) на доску попадают, но вердикта не дают:
 * ровно это и значит «судится, а не предполагается» — код с анимацией, которая не срабатывает,
 * даёт статичную страницу и обязан читаться как статичная.
 *
 * Третья строка доски — **вход** (А-35 п.2в): её считает `entry-point.ts`, а сюда приходит готовым
 * вердиктом. Доска одна, потому что заказчик читает одно.
 */

/* ─────────────────────────── ось I: связность ─────────────────────────── */

export interface Shot {
  /** Что это за кадр: «главная, 1440, первый экран». Подпись уходит модели рядом с картинкой. */
  label: string;
  path: string;
}

export type CoherenceOutcome =
  | { status: 'judged'; verdict: 'coherent' | 'broken'; findings: string[]; judgedBy: string }
  /** Суд не состоялся — с причиной. Не «зелено по умолчанию» и не «красно назло». */
  | { status: 'skipped'; reason: string };

const MEDIA_TYPES: Readonly<Record<string, string>> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
};

/** Читает кадры с диска в образный вход. Незнакомое расширение — не картинка, а недоразумение. */
export function loadShots(shots: readonly Shot[]): LlmImage[] {
  return shots.map((shot) => {
    const mediaType = MEDIA_TYPES[extname(shot.path).toLowerCase()];
    if (mediaType === undefined) {
      throw new Error(`не картинка для суда: ${basename(shot.path)}`);
    }
    return { mediaType, data: readFileSync(shot.path).toString('base64'), label: shot.label };
  });
}

const SYSTEM = [
  'Ты — придирчивый дизайн-ревьюер, который смотрит на СОБРАННУЮ работу глазами обычного',
  'посетителя. Твоя тема — СВЯЗНОСТЬ: читается ли это как одна вещь, сделанная одним человеком с',
  'одним вкусом. Ты не оцениваешь идею, не предлагаешь улучшений и не хвалишь. Отвечай ТОЛЬКО',
  'JSON-объектом, без пояснений и без обрамляющих кавычек кода.',
].join(' ');

const ModelCoherence = z.union([
  z.object({ verdict: z.literal('coherent'), findings: z.array(z.string()).optional() }),
  z.object({ verdict: z.literal('broken'), findings: z.array(z.string().min(1)).min(1) }),
]);

/** Промпт оси связности — экспортирован, чтобы регрессия судила ВХОД, а не только выход. */
export function coherencePrompt(seed: string, shots: readonly Shot[]): string {
  return [
    'Задумка владельца (дословно):',
    seed,
    '',
    `Перед тобой ${String(shots.length)} кадров одной работы, по порядку:`,
    ...shots.map((shot, index) => `${String(index + 1)}. ${shot.label}`),
    '',
    'Ответь на один вопрос: это читается как ОДНА связная вещь или как набор кусков?',
    '',
    'Дефектами связности считай ровно это:',
    '- элементы одного ряда не выровнены между собой; кнопки разъезжаются по размеру, форме, отступу;',
    '- секция прижата к краю с пустым полем напротив; поля и ритм отступов скачут между секциями;',
    '- типографика не одна: заголовки разных секций живут в разных шкалах и весах;',
    '- цвета и акценты не складываются в одну палитру; куски выглядят с разных сайтов;',
    '- текст налезает на текст или на картинку, обрезан, вылезает за свой блок;',
    '- пустая или явно недоделанная секция среди готовых.',
    '',
    'Не считай дефектом: содержание, выбор слов, качество самих фотографий, отсутствие функций,',
    'вкусовые предпочтения по палитре. Спорное трактуй в пользу работы: ты ищешь расхождение, а не',
    'повод для улучшения.',
    '',
    'Верни JSON одного из двух видов:',
    '{"verdict":"coherent","findings":[]}',
    '{"verdict":"broken","findings":["кадр 3: кнопки блока цен разной высоты и не выровнены", "…"]}',
    '',
    'Каждый дефект — одной строкой, с номером кадра и местом на нём. Общих слов вроде «выглядит',
    'непрофессионально» не пиши: их нельзя починить. Не больше восьми дефектов — самых заметных:',
    'обрезанный на полуслове ответ не разбирается и суда не даёт.',
  ].join('\n');
}

/** Модель, обернувшая JSON в ограду или во фразу, всё же ответила — приём общий с судом плана. */
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

export async function reviewCoherence(args: {
  seed: string;
  shots: readonly Shot[];
  images: readonly LlmImage[];
  chain: Chain;
}): Promise<CoherenceOutcome> {
  if (args.images.length === 0) {
    return { status: 'skipped', reason: 'кадров для суда не снято' };
  }

  let answer: { text: string; provider: string };
  try {
    answer = await args.chain.generate({
      system: SYSTEM,
      prompt: coherencePrompt(args.seed, args.shots),
      images: args.images,
      /* Восемь дефектов кириллицей — это тысячи знаков; на 2048 живой замер обрезался на полуслове. */
      maxOutputTokens: 8192,
    });
  } catch (error) {
    return {
      status: 'skipped',
      reason: `звено с глазами не ответило: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  const parsed = ModelCoherence.safeParse(extractJson(answer.text));
  if (!parsed.success) {
    return {
      status: 'skipped',
      reason: `ответ модели не разобран: ${z.prettifyError(parsed.error)}`,
    };
  }

  return {
    status: 'judged',
    verdict: parsed.data.verdict,
    findings: parsed.data.verdict === 'broken' ? parsed.data.findings : [],
    judgedBy: answer.provider,
  };
}

/* ─────────────────────────── ось II: живость ─────────────────────────── */

/**
 * Три вида жизни, названные заказчиком дословно: «hover-состояния, плавные появления, работающие
 * слайдеры, движение». Слайдер и фоновое движение — один вид: и то и другое доказывается тем, что
 * страница меняется сама, без действий посетителя.
 */
export const LIVENESS_KINDS = ['hover', 'reveal', 'motion'] as const;

export type LivenessKind = (typeof LIVENESS_KINDS)[number];

export const LIVENESS_KIND_NAMES: Readonly<Record<LivenessKind, string>> = {
  hover: 'состояния при наведении',
  reveal: 'плавные появления при прокрутке',
  motion: 'собственное движение (слайдеры, фон)',
};

/** Одна поведенческая улика: что проверяли, на чём, и сдвинулось ли оно на самом деле. */
export interface LivenessProbe {
  kind: LivenessKind;
  name: string;
  moved: boolean;
  /** Чем именно доказано или почему не сдвинулось — на доску попадает дословно. */
  detail: string;
}

export interface LivenessEvidence {
  probes: readonly LivenessProbe[];
  /** Признаки движения, найденные в исходниках. Поддержка вердикта, но не вердикт. */
  signals: readonly string[];
}

export interface LivenessVerdict {
  verdict: 'alive' | 'static';
  findings: string[];
}

/**
 * Что в исходниках вообще заявляет о движении. Список — то, что ищется, а не что доказано.
 *
 * Экспортирован (А-44 п.2): те же выражения вставляются в скрипт пробы, потому что исходники
 * читаются теперь ВНУТРИ контейнера. Два списка означали бы два разных определения движения.
 */
export const MOTION_SIGNAL_PATTERNS: readonly { name: string; pattern: RegExp }[] = [
  { name: 'CSS-переходы (transition)', pattern: /\btransition(-[a-z]+)?\s*:/i },
  { name: 'CSS-анимации (@keyframes)', pattern: /@keyframes\b/i },
  { name: 'состояния наведения (:hover)', pattern: /:hover\b/i },
  { name: 'появление по видимости (IntersectionObserver)', pattern: /IntersectionObserver/ },
  { name: 'преобразования (transform)', pattern: /\btransform\s*:/i },
  { name: 'уважение к prefers-reduced-motion', pattern: /prefers-reduced-motion/i },
  { name: 'покадровая анимация (requestAnimationFrame)', pattern: /requestAnimationFrame/ },
];

/** Признаки движения в исходниках — чистая функция над уже прочитанными текстами. */
export function scanMotionSignals(sources: readonly { file: string; text: string }[]): string[] {
  return MOTION_SIGNAL_PATTERNS.filter((signal) =>
    sources.some((source) => signal.pattern.test(source.text)),
  ).map((signal) => signal.name);
}

/**
 * Вердикт живости — ЧИСТАЯ функция над уликами (P1: решает код).
 *
 * Жив тот артефакт, у которого КАЖДЫЙ из трёх видов жизни доказан хотя бы одной сдвинувшейся
 * проверкой. Признаки в коде без единой сдвинувшейся проверки — худший из случаев и назван
 * отдельно: это «анимация написана и не работает», а не «анимации нет».
 */
export function judgeLiveness(evidence: LivenessEvidence): LivenessVerdict {
  const findings: string[] = [];

  for (const kind of LIVENESS_KINDS) {
    const ofKind = evidence.probes.filter((probe) => probe.kind === kind);

    if (ofKind.length === 0) {
      findings.push(
        `${LIVENESS_KIND_NAMES[kind]}: не проверялось — живость не предполагается, а доказывается.`,
      );
      continue;
    }

    if (!ofKind.some((probe) => probe.moved)) {
      findings.push(
        `${LIVENESS_KIND_NAMES[kind]}: ни одна из ${String(ofKind.length)} проверок не увидела ` +
          `изменения (${ofKind.map((probe) => `${probe.name} — ${probe.detail}`).join('; ')}).`,
      );
    }
  }

  if (findings.length > 0 && evidence.signals.length > 0 && !evidence.probes.some((p) => p.moved)) {
    findings.push(
      `В исходниках признаки движения есть (${evidence.signals.join(', ')}), но ни одна ` +
        'поведенческая проверка не сдвинулась: анимация написана и не работает.',
    );
  }

  return { verdict: findings.length === 0 ? 'alive' : 'static', findings };
}

/* ─────────────────────────── ось IV: работоспособность ─────────────────────────── */

/**
 * Четвёртая ось — РАБОТОСПОСОБНОСТЬ (А-44 п.2).
 *
 * **Зачем она.** Три прежние оси судят продукт в ПОКОЕ: кадр, признаки движения, карта ссылок. Все
 * три были зелены на продукте, где 74 из 86 ссылок главной ведут в никуда, лежит
 * `decorative-stubs.js` с тостом «Демо-версия, функция недоступна», а раскрытое мега-меню налезает
 * текстом само на себя. Заказчик нашёл это за минуту, открыв продукт. Суд не нашёл — потому что не
 * открывал: в цепи «мысль → ТЗ → реализация → тестирование → полировка → готовое» звена
 * тестирования не было.
 *
 * **Три исхода, и различать их обязательно** — они не про степень, а про род:
 *
 * - **СЛОМАННОЕ** — реагирует, но результат испорчен: текст налезает, панель пуста, слой не
 *   закрывается. Красная ось всегда, без порогов;
 * - **ИНЕРТНОЕ** — не ведёт никуда и большего не обещает. Законно (макет вправе быть макетом), но
 *   СЧИТАЕТСЯ и публикуется числом: разница между 44 живыми ссылками и 86 с 74 мёртвыми — это и
 *   есть разница между продуктом и его видимостью;
 * - **САМООБЪЯВЛЕННАЯ ЗАГЛУШКА** — «демо», «функция недоступна», «coming soon», «в разработке».
 *   Абсолютный запрет, красная ось безусловно: **продукт не разговаривает с пользователем о своей
 *   незавершённости.** Честность живёт в отчёте, а не в интерфейсе.
 */
export const OPERABILITY_OUTCOMES = ['working', 'inert', 'broken', 'stub'] as const;
export type OperabilityOutcome = (typeof OPERABILITY_OUTCOMES)[number];

/**
 * Чем продукт объявляет о собственной незавершённости — закрытый перечень (А-44 п.2).
 *
 * Закрытый, потому что запрет абсолютный: расширять его вправе только человек, а угадывать
 * «похоже на заглушку» — значит вернуть суду мнение там, где нужен факт.
 */
export const STUB_PHRASES: readonly string[] = [
  'демо-версия',
  'демо версия',
  'демоверсия',
  'функция недоступна',
  'функционал недоступен',
  'недоступно в демо',
  'в разработке',
  'скоро будет',
  'ожидается',
  'coming soon',
  'not implemented',
  'not available in this demo',
  'demo only',
  'placeholder',
  'lorem ipsum',
  'todo:',
  'заглушка',
];

/** Ссылки, которые никуда не ведут по самой своей записи. */
const DEAD_HREF = /^\s*(#|javascript:\s*void\s*\(\s*0\s*\)|javascript:;|)\s*$/i;

/** Найденная в тексте самообъявленная заглушка, или null. Чистая функция над строкой. */
export function stubPhraseIn(text: string): string | null {
  const haystack = text.toLowerCase();
  return STUB_PHRASES.find((phrase) => haystack.includes(phrase)) ?? null;
}

/** Одна улика работоспособности: что трогали и что из этого вышло. Слова «сломано» здесь нет. */
export interface InteractiveProbe {
  label: string;
  tag: string;
  href: string | null;
  /** Элемент живёт в шапке, навигации или подвале — «верхний уровень» в буквальном смысле. */
  inChrome: boolean;
  hoverChanged: boolean;
  clicked: boolean;
  navigated: boolean;
  /** Страница изменилась после действия: раскрылось, перерисовалось, добавилось. */
  changed: boolean;
  /** Текст, ставший видимым после наведения или клика. */
  revealedText: string;
  /** Пары накладывающихся друг на друга текстовых блоков в раскрытом. */
  overlapPairs: number;
  emptyPanel: boolean;
  stuckOpen: boolean;
  /** Что продукт сказал через alert/confirm — тост «демо» приходит сюда. */
  alert: string;
  /** Клик не удался вовсе: элемент перекрыт, оторван, не кликается. */
  error: string | null;
}

export interface OperabilityEvidence {
  /** Сколько интерактивных элементов на входной странице всего. */
  total: number;
  probes: readonly InteractiveProbe[];
  /** Текст страницы в покое — самообъявление ищут и здесь. */
  pageText: string;
  /** Исходники продукта: имя и текст. `decorative-stubs.js` виден именно тут. */
  sources: readonly { file: string; text: string }[];
  /** Что проба не смогла или обрезала — печатается, а не проглатывается. */
  notes: readonly string[];
}

export interface OperabilityVerdict {
  verdict: 'operable' | 'broken';
  /** Классификация каждой улики — по ней и считаются числа. */
  outcomes: { probe: InteractiveProbe; outcome: OperabilityOutcome; why: string }[];
  /** Числа, которые публикуются: инертных столько-то из стольких-то. */
  counts: Record<OperabilityOutcome, number>;
  total: number;
  findings: string[];
}

/**
 * Исход одной улики — ЧИСТАЯ функция (P1: решает код).
 *
 * Порядок проверок — это порядок строгости, и он не случаен: самообъявление бьёт первым, потому что
 * оно запрещено безусловно; испорченный результат вторым, потому что он про качество работы; и
 * только потом «ничего не случилось», потому что это законный случай, который надо посчитать.
 */
export function classifyProbe(probe: InteractiveProbe): { outcome: OperabilityOutcome; why: string } {
  const declared =
    stubPhraseIn(probe.alert) ?? stubPhraseIn(probe.revealedText) ?? stubPhraseIn(probe.label);

  if (declared !== null) {
    return {
      outcome: 'stub',
      why: `продукт сам сообщает о незавершённости: «${declared}»`,
    };
  }

  if (probe.overlapPairs > 0) {
    return {
      outcome: 'broken',
      why: `раскрытое налезает само на себя: пар накладывающихся текстовых блоков ${String(probe.overlapPairs)}`,
    };
  }
  if (probe.emptyPanel) return { outcome: 'broken', why: 'раскрылась пустая панель' };
  if (probe.stuckOpen) {
    return { outcome: 'broken', why: 'раскрытый слой не закрылся ни по Escape, ни щелчком мимо' };
  }
  if (probe.error !== null) {
    return { outcome: 'broken', why: `нажать не удалось: ${probe.error}` };
  }

  if (probe.navigated || probe.changed) return { outcome: 'working', why: 'реагирует' };

  return {
    outcome: 'inert',
    why:
      probe.href !== null && DEAD_HREF.test(probe.href)
        ? `ссылка ведёт в никуда (href="${probe.href}")`
        : 'ни навигации, ни изменения на странице',
  };
}

/**
 * Вердикт оси — ЧИСТАЯ функция над уликами.
 *
 * Красная при любом сломанном и при любой самообъявленной заглушке — порогов здесь нет по
 * построению. Инертное красноты не даёт: оно даёт ЧИСЛО, и число едет во все три места, где его
 * читает человек.
 */
export function judgeOperability(evidence: OperabilityEvidence): OperabilityVerdict {
  const outcomes = evidence.probes.map((probe) => ({ probe, ...classifyProbe(probe) }));
  const counts: Record<OperabilityOutcome, number> = { working: 0, inert: 0, broken: 0, stub: 0 };
  for (const entry of outcomes) counts[entry.outcome] += 1;

  const findings: string[] = [];

  /* Самообъявление в исходниках и в тексте покоя — то, чего клик мог и не достать. */
  const inSources = evidence.sources
    .map((source) => ({ file: source.file, phrase: stubPhraseIn(source.text) }))
    .filter((found): found is { file: string; phrase: string } => found.phrase !== null);

  const inPage = stubPhraseIn(evidence.pageText);

  for (const entry of outcomes.filter((candidate) => candidate.outcome === 'stub')) {
    findings.push(`Заглушка объявлена интерфейсом: «${entry.probe.label}» — ${entry.why}.`);
  }
  for (const found of inSources) {
    findings.push(
      `Самообъявление незавершённости в исходнике ${found.file}: «${found.phrase}». ` +
        'Такой файл удаляется, а не переписывается: честность живёт в отчёте, а не в интерфейсе.',
    );
  }
  if (inPage !== null) {
    findings.push(`Страница в покое говорит о своей незавершённости: «${inPage}».`);
  }

  for (const entry of outcomes.filter((candidate) => candidate.outcome === 'broken')) {
    findings.push(`Сломано: «${entry.probe.label}» (${entry.probe.tag}) — ${entry.why}.`);
  }

  if (evidence.probes.length === 0) {
    findings.push(
      'Работоспособность не проверялась: проба не нашла ни одного интерактивного элемента — ' +
        'ось не бывает зелёной по умолчанию.',
    );
  }

  return {
    verdict: findings.length === 0 ? 'operable' : 'broken',
    outcomes,
    counts,
    total: evidence.total,
    findings,
  };
}

/* ─────────────────────────── доска ─────────────────────────── */

export interface QualityBoard {
  coherence: CoherenceOutcome;
  liveness: LivenessVerdict & { evidence: LivenessEvidence };
  entry: EntryVerdict;
  operability: OperabilityVerdict;
  /**
   * Задачи, которые приёмка физически не смогла проверить (А-44 п.1).
   *
   * На доске они не ось, а строка: приёмка сказала «не проверяемо» — значит вопрос дошёл сюда, а не
   * растворился. Зелёности они не отменяют, но и молчать о них суд не имеет права.
   */
  unverified: readonly { taskId: string; reason: string }[];
  /** Зелено только когда все ЧЕТЫРЕ оси зелены. Несостоявшийся суд зелёным не бывает. */
  green: boolean;
}

export function assembleBoard(args: {
  coherence: CoherenceOutcome;
  liveness: LivenessVerdict;
  evidence: LivenessEvidence;
  entry: EntryVerdict;
  operability: OperabilityVerdict;
  unverified?: readonly { taskId: string; reason: string }[];
}): QualityBoard {
  return {
    coherence: args.coherence,
    liveness: { ...args.liveness, evidence: args.evidence },
    entry: args.entry,
    operability: args.operability,
    unverified: args.unverified ?? [],
    green:
      args.coherence.status === 'judged' &&
      args.coherence.verdict === 'coherent' &&
      args.liveness.verdict === 'alive' &&
      args.entry.verdict === 'single-entry' &&
      args.operability.verdict === 'operable',
  };
}

const bullet = (lines: readonly string[]): string[] => lines.map((line) => `   • ${line}`);

/** Доска одним текстом — то, что уходит в ленту и в алерт. Формат один, читателей двое. */
export function renderQualityBoard(board: QualityBoard): string {
  const lines: string[] = ['Суд качества:'];

  if (board.coherence.status === 'skipped') {
    lines.push(`1. Связность — НЕ СУДИЛАСЬ: ${board.coherence.reason}.`);
  } else if (board.coherence.verdict === 'coherent') {
    lines.push(`1. Связность — связно (смотрел ${board.coherence.judgedBy}).`);
  } else {
    lines.push(`1. Связность — СЪЕХАЛО (смотрел ${board.coherence.judgedBy}):`);
    lines.push(...bullet(board.coherence.findings));
  }

  const moved = board.liveness.evidence.probes.filter((probe) => probe.moved).length;
  const total = board.liveness.evidence.probes.length;

  if (board.liveness.verdict === 'alive') {
    lines.push(
      `2. Живость — живой: ${String(moved)} из ${String(total)} проверок увидели движение.`,
    );
  } else {
    lines.push(
      `2. Живость — СТАТИЧНЫЙ (${String(moved)} из ${String(total)} проверок сдвинулись):`,
    );
    lines.push(...bullet(board.liveness.findings));
  }

  if (board.entry.verdict === 'single-entry') {
    lines.push(`3. Вход — один: ${board.entry.entry ?? '—'}, вся работа открывается из него.`);
  } else {
    lines.push('3. Вход — РАЗБРОСАНО:');
    lines.push(...bullet(board.entry.findings));
  }

  const counts = board.operability.counts;
  const probed = board.operability.outcomes.length;
  const tally =
    `нажато ${String(probed)} из ${String(board.operability.total)}; ` +
    `работает ${String(counts.working)}, инертных ${String(counts.inert)}, ` +
    `сломанных ${String(counts.broken)}, заглушек ${String(counts.stub)}`;

  if (board.operability.verdict === 'operable') {
    lines.push(`4. Работоспособность — работает: ${tally}.`);
  } else {
    lines.push(`4. Работоспособность — СЛОМАНО (${tally}):`);
    lines.push(...bullet(board.operability.findings));
  }

  if (counts.inert > 0) {
    lines.push(
      `   Инертное законно и потому посчитано: ${String(counts.inert)} элементов не ведут никуда. ` +
        'Число уходит в реестр расхождений, раздел II.',
    );
  }

  if (board.unverified.length > 0) {
    lines.push(`Не проверено приёмкой: задач ${String(board.unverified.length)}.`);
    lines.push(...bullet(board.unverified.map((entry) => `${entry.taskId}: ${entry.reason}`)));
  }

  lines.push(
    board.green
      ? 'Итог: зелено по всем четырём осям.'
      : 'Итог: НЕ ПРИНЯТО — красная ось выше называет, что чинить.',
  );

  return lines.join('\n');
}
