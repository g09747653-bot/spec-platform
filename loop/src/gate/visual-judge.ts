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
    return { status: 'skipped', reason: `ответ модели не разобран: ${z.prettifyError(parsed.error)}` };
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

/** Что в исходниках вообще заявляет о движении. Список — то, что ищется, а не что доказано. */
const MOTION_SIGNALS: readonly { name: string; pattern: RegExp }[] = [
  { name: 'CSS-переходы (transition)', pattern: /\btransition(-[a-z]+)?\s*:/i },
  { name: 'CSS-анимации (@keyframes)', pattern: /@keyframes\b/i },
  { name: 'состояния наведения (:hover)', pattern: /:hover\b/i },
  { name: 'появление по видимости (IntersectionObserver)', pattern: /IntersectionObserver/ },
  { name: 'преобразования (transform)', pattern: /\btransform\s*:/i },
  { name: 'уважение к prefers-reduced-motion', pattern: /prefers-reduced-motion/i },
  { name: 'покадровая анимация (requestAnimationFrame)', pattern: /requestAnimationFrame/ },
];

/** Признаки движения в исходниках — чистая функция над уже прочитанными текстами. */
export function scanMotionSignals(
  sources: readonly { file: string; text: string }[],
): string[] {
  return MOTION_SIGNALS.filter((signal) =>
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

/* ─────────────────────────── доска ─────────────────────────── */

export interface QualityBoard {
  coherence: CoherenceOutcome;
  liveness: LivenessVerdict & { evidence: LivenessEvidence };
  entry: EntryVerdict;
  /** Зелено только когда все три оси зелены. Несостоявшийся суд зелёным не бывает. */
  green: boolean;
}

export function assembleBoard(args: {
  coherence: CoherenceOutcome;
  liveness: LivenessVerdict;
  evidence: LivenessEvidence;
  entry: EntryVerdict;
}): QualityBoard {
  return {
    coherence: args.coherence,
    liveness: { ...args.liveness, evidence: args.evidence },
    entry: args.entry,
    green:
      args.coherence.status === 'judged' &&
      args.coherence.verdict === 'coherent' &&
      args.liveness.verdict === 'alive' &&
      args.entry.verdict === 'single-entry',
  };
}

const bullet = (lines: readonly string[]): string[] =>
  lines.map((line) => `   • ${line}`);

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
    lines.push(`2. Живость — живой: ${String(moved)} из ${String(total)} проверок увидели движение.`);
  } else {
    lines.push(`2. Живость — СТАТИЧНЫЙ (${String(moved)} из ${String(total)} проверок сдвинулись):`);
    lines.push(...bullet(board.liveness.findings));
  }

  if (board.entry.verdict === 'single-entry') {
    lines.push(`3. Вход — один: ${board.entry.entry ?? '—'}, вся работа открывается из него.`);
  } else {
    lines.push('3. Вход — РАЗБРОСАНО:');
    lines.push(...bullet(board.entry.findings));
  }

  lines.push(
    board.green
      ? 'Итог: зелено по всем трём осям.'
      : 'Итог: НЕ ПРИНЯТО — красная ось выше называет, что чинить.',
  );

  return lines.join('\n');
}
