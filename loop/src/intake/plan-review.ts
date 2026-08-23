import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { z } from 'zod';

import type { Chain } from '../llm/chain.ts';

/**
 * Суд полноты плана против задумки — на интейке, ДО конвейера (А-33 п.4б).
 *
 * Дыра, которую это закрывает, стоила финальной приёмке голого сайта: модель-планировщик сузила
 * «графическую копию» до «структура + типографика», исполнители сделали ровно то, что велел план,
 * и НИКТО не судил сам план — ревью платформы судит документы изнутри, интейк судит схему,
 * конвейер судит задачи. Наш собственный handoff-протокол существует ровно против этого:
 * Архитектор ревьюит план до исполнения. Здесь контур получает ту же роль в себе.
 *
 * **Что судится и чем.** Вход — задумка владельца (SEED.md, дословный текст из Telegram) и
 * ИТОГОВЫЙ handoff-план (каждая задача с охватом: название, суть, файлы). Выход — named-вердикт:
 * план полон, или пробелы поимённо. Судит модель через тот же шов ролей, что пишет задания
 * (архитектор, задача 161): суд — это роль, а не новый провайдер.
 *
 * **Что суд может остановить и чего не может.** Пробелы останавливают запуск конвейера алертом с
 * перечнем; решение «продолжить как есть / дополнить задумку» — за владельцем, кнопкой (P2: суд
 * предлагает, человек решает). Недоступность суда конвейер НЕ останавливает — это именованная
 * деградация, как у всякой модельной роли (D-229: модель не в цепи управления), потому что суд —
 * ревью-защита, а не гейт корректности данных. Молча не пропускается ничего: не состоявшийся суд
 * называет причину в ленте.
 *
 * **Вердикт живёт на диске** (`handoff/PLAN_REVIEW.json`) — по той же причине, что FROZEN.md:
 * решение, пережившее рестарт процесса. Повторный start-loop не судит план заново и не даёт
 * конвейеру проскочить мимо нерешённых пробелов; решение владельца дописывается в тот же файл.
 */

export const SEED_FILE = 'SEED.md';

export const PLAN_REVIEW_FILE = join('handoff', 'PLAN_REVIEW.json');

/** Охват одной задачи — то, что суд читает о ней. Форма усечена до вопроса «что покрыто». */
export interface ReviewableTask {
  taskId: string;
  title: string;
  description: string;
  filesToEdit: readonly string[];
}

export type PlanReviewOutcome =
  | { status: 'complete'; judgedBy: string }
  | { status: 'gaps'; gaps: string[]; judgedBy: string }
  /** Суд не состоялся — с причиной, которую лента называет. Файл вердикта не пишется. */
  | { status: 'skipped'; reason: string };

/** Ответ модели: ровно две формы. `gaps` без единого пробела — противоречие, не вердикт. */
const ModelVerdict = z.union([
  z.object({ verdict: z.literal('complete') }),
  z.object({ verdict: z.literal('gaps'), gaps: z.array(z.string().min(1)).min(1) }),
]);

const PlanReviewRecord = z.object({
  verdict: z.enum(['complete', 'gaps']),
  gaps: z.array(z.string()),
  /** Кто судил — провайдер из цепочки роли; журналу нужен бюджет, не только факт. */
  judgedBy: z.string(),
  at: z.string(),
  /** Решение владельца по пробелам; null — ещё не принято. У полного плана решения не бывает. */
  decision: z.object({ action: z.literal('proceed'), at: z.string() }).nullable(),
});

export type PlanReviewRecord = z.infer<typeof PlanReviewRecord>;

/** Задумка владельца, дословно, или null — запуск без неё (ручной start-loop, старые прогоны). */
export function readSeed(projectDirectory: string): string | null {
  const path = join(projectDirectory, SEED_FILE);
  if (!existsSync(path)) return null;

  const text = readFileSync(path, 'utf8').trim();
  return text === '' ? null : text;
}

/** Задумка на диск — фасад пишет её рядом с бандлом, чтобы суд пережил рестарты и перезаходы. */
export function writeSeed(projectDirectory: string, seed: string): void {
  writeFileSync(join(projectDirectory, SEED_FILE), `${seed.trim()}\n`, 'utf8');
}

export function readPlanReview(projectDirectory: string): PlanReviewRecord | null {
  const path = join(projectDirectory, PLAN_REVIEW_FILE);
  if (!existsSync(path)) return null;

  try {
    return PlanReviewRecord.parse(JSON.parse(readFileSync(path, 'utf8')));
  } catch {
    /* Нечитаемый вердикт — не вердикт: суд просто состоится заново. */
    return null;
  }
}

export function writePlanReview(projectDirectory: string, record: PlanReviewRecord): void {
  const path = join(projectDirectory, PLAN_REVIEW_FILE);
  mkdirSync(join(projectDirectory, 'handoff'), { recursive: true });
  writeFileSync(path, `${JSON.stringify(PlanReviewRecord.parse(record), null, 2)}\n`, 'utf8');
}

/** Решение владельца «продолжить с пробелами», дописанное в вердикт. Null — решать не по чему. */
export function recordPlanDecision(projectDirectory: string, at: string): PlanReviewRecord | null {
  const existing = readPlanReview(projectDirectory);
  if (existing?.verdict !== 'gaps') return null;

  const updated: PlanReviewRecord = { ...existing, decision: { action: 'proceed', at } };
  writePlanReview(projectDirectory, updated);
  return updated;
}

/**
 * Решение гейта над существующим вердиктом — чистая функция, отдельная от route и от модели.
 *
 * - файла нет → `review`: суд ещё не проводился;
 * - `complete`, либо `gaps` с записанным решением → `run`;
 * - `gaps` без решения → `halt`, или `accept`, когда владелец сказал продолжать (кнопка/флаг).
 */
export type PlanGateAction =
  | { action: 'review' }
  | { action: 'run' }
  | { action: 'halt'; gaps: string[] }
  | { action: 'accept'; gaps: string[] };

export function planGate(existing: PlanReviewRecord | null, acceptPlan: boolean): PlanGateAction {
  if (existing === null) return { action: 'review' };
  if (existing.verdict === 'complete' || existing.decision !== null) return { action: 'run' };

  return acceptPlan
    ? { action: 'accept', gaps: existing.gaps }
    : { action: 'halt', gaps: existing.gaps };
}

const SYSTEM = [
  'Ты — Архитектор, ревьюящий ПОЛНОТУ плана работ против задумки владельца ДО запуска исполнения.',
  'Твоя единственная тема — покрытие: делает ли совокупность задач всё, что задумка требует явно',
  'или необходимо подразумевает. Качество формулировок, порядок задач, выбор технологий — не твоя',
  'тема. Отвечай ТОЛЬКО JSON-объектом, без пояснений и без обрамляющих кавычек кода.',
].join(' ');

/** Сути задач в промпте усечены: суд читает охваты, а не переписывает брифы. */
const DESCRIPTION_LIMIT = 300;

const trimTo = (text: string, limit: number): string => {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length <= limit ? flat : `${flat.slice(0, limit - 1)}…`;
};

/** Промпт суда — экспортирован, чтобы регрессия утверждала полноту ВХОДА, а не только выход. */
export function completenessPrompt(seed: string, tasks: readonly ReviewableTask[]): string {
  const plan = tasks.map((task, index) => {
    const lines = [
      `${String(index + 1)}. ${task.taskId} — ${task.title}`,
      ...(task.description.trim() === ''
        ? []
        : [`   Суть: ${trimTo(task.description, DESCRIPTION_LIMIT)}`]),
      ...(task.filesToEdit.length === 0 ? [] : [`   Файлы: ${task.filesToEdit.join(', ')}`]),
    ];
    return lines.join('\n');
  });

  return [
    'Задумка владельца (дословно):',
    seed,
    '',
    `План — все задачи с охватами (${String(tasks.length)} шт.):`,
    ...plan,
    '',
    'Верни JSON одного из двух видов:',
    '{"verdict":"complete"}',
    '{"verdict":"gaps","gaps":["именованный пробел — какой части задумки не покрывает ни одна задача", "…"]}',
    '',
    'Пробел — это часть задумки, которую не покрывает НИ ОДНА задача плана (например: задумка',
    'требует графическую копию сайта, а в плане нет ни одной задачи переноса контентных',
    'изображений). Не выдумывай пробелов из вкуса: улучшения, которых задумка не требует,',
    'пробелами не являются. Каждый пробел — одной строкой, поимённо и проверяемо.',
  ].join('\n');
}

/** Модель, обернувшая JSON в ограду или фразу, всё же ответила — тот же приём, что у заданий. */
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

export async function reviewPlanCompleteness(
  seed: string,
  tasks: readonly ReviewableTask[],
  chain: Chain,
): Promise<PlanReviewOutcome> {
  let answer: { text: string; provider: string };
  try {
    answer = await chain.generate({ system: SYSTEM, prompt: completenessPrompt(seed, tasks) });
  } catch (error) {
    return {
      status: 'skipped',
      reason: `провайдеры суда недоступны: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  const parsed = ModelVerdict.safeParse(extractJson(answer.text));
  if (!parsed.success) {
    return {
      status: 'skipped',
      reason: `ответ модели не разобран: ${z.prettifyError(parsed.error)}`,
    };
  }

  return parsed.data.verdict === 'complete'
    ? { status: 'complete', judgedBy: answer.provider }
    : { status: 'gaps', gaps: parsed.data.gaps, judgedBy: answer.provider };
}

/**
 * Весь суд одной точкой для start-loop: существующий вердикт → гейт; свежий план → суд с записью
 * вердикта на диск. Возвращает, может ли конвейер ехать, и пробелы для алерта, когда не может.
 */
export async function ensurePlanReviewed(args: {
  projectDirectory: string;
  tasks: readonly ReviewableTask[];
  chain: Chain | null;
  acceptPlan: boolean;
  now?: () => number;
  say: (message: string, level?: 'INFO' | 'WARN' | 'ERROR') => void;
}): Promise<{ proceed: boolean; gaps: string[] }> {
  const { projectDirectory, tasks, chain, acceptPlan, say } = args;
  const at = () => new Date((args.now ?? Date.now)()).toISOString();

  const gate = planGate(readPlanReview(projectDirectory), acceptPlan);

  if (gate.action === 'run') return { proceed: true, gaps: [] };

  if (gate.action === 'accept') {
    recordPlanDecision(projectDirectory, at());
    say(
      `Решение владельца: продолжить с названными пробелами (${String(gate.gaps.length)}). ` +
        'Перечень остаётся в handoff/PLAN_REVIEW.json.',
      'WARN',
    );
    return { proceed: true, gaps: [] };
  }

  if (gate.action === 'halt') {
    say(
      `Суд полноты плана уже нашёл пробелы (${String(gate.gaps.length)}), решение владельца не принято — ` +
        'конвейер не запускается. Продолжение — кнопкой в Telegram или start-loop с acceptPlan.',
      'ERROR',
    );
    return { proceed: false, gaps: gate.gaps };
  }

  /* action === 'review' — суд ещё не проводился. */
  const seed = readSeed(projectDirectory);
  if (seed === null) {
    say(
      'Суд полноты плана не проводился: задумка (SEED.md) в рабочей директории не записана — ' +
        'запуск без неё судить не по чему.',
      'WARN',
    );
    return { proceed: true, gaps: [] };
  }

  if (chain === null) {
    say('Суд полноты плана не проводился: провайдер роли архитектора не настроен.', 'WARN');
    return { proceed: true, gaps: [] };
  }

  const outcome = await reviewPlanCompleteness(seed, tasks, chain);

  if (outcome.status === 'skipped') {
    say(
      `Суд полноты плана не состоялся: ${outcome.reason}. Конвейер продолжает без вердикта.`,
      'WARN',
    );
    return { proceed: true, gaps: [] };
  }

  if (outcome.status === 'complete') {
    writePlanReview(projectDirectory, {
      verdict: 'complete',
      gaps: [],
      judgedBy: outcome.judgedBy,
      at: at(),
      decision: null,
    });
    say(`Суд полноты плана: план покрывает задумку (судил ${outcome.judgedBy}).`);
    return { proceed: true, gaps: [] };
  }

  writePlanReview(projectDirectory, {
    verdict: 'gaps',
    gaps: outcome.gaps,
    judgedBy: outcome.judgedBy,
    at: at(),
    decision: null,
  });
  say(
    `Суд полноты плана нашёл пробелы (судил ${outcome.judgedBy}):\n` +
      outcome.gaps.map((gap, index) => `${String(index + 1)}. ${gap}`).join('\n') +
      '\nКонвейер не запущен; решение продолжать/дополнить — за владельцем.',
    'ERROR',
  );
  return { proceed: false, gaps: outcome.gaps };
}
