import { z } from 'zod';

import type { Chain } from '../llm/chain.ts';
import type { ReviewableTask } from './plan-review.ts';

/**
 * Класс артефакта и форма плана под него — на интейке, до конвейера (А-35 п.2а).
 *
 * **Дыра, которую это закрывает, стоила заказчику продукта.** Задумка «сайт — графическая копия»
 * превратилась в план из 41 задачи с заборами `filesToEdit`, и каждый исполнитель видел свой ломоть:
 * шапку, футер, одну секцию, один CSS-файл. Локально всё было корректно; целого не собралось —
 * «кнопки расходятся, дизайн съезжает». Связность — глобальное свойство ОДНОГО артефакта, и
 * декомпозиция разрушает её по построению, а не по недосмотру исполнителя.
 *
 * Конвейер силён там, где продукт больше одного контекста, и слеп там, где качество ЕСТЬ
 * целостность. Различение этих двух случаев и живёт здесь.
 *
 * **Разделение труда — по конституции P1.** Модель отвечает ровно на один вопрос: к какому классу
 * относится ЗАДУМКА («связный визуальный артефакт одного контекста» против «системы»). Годность
 * плана под класс решает КОД — чистой функцией над охватами задач: сколько долей, и владеет ли
 * хоть одна задача артефактом целиком. «Модель посчитала план нормальным» вердиктом не является.
 *
 * Недоступность классификатора — именованная деградация со сваливанием в `system`, то есть в
 * сегодняшнее поведение: страж, который при отказе модели ужесточает правила, останавливал бы
 * конвейер на каждом сетевом сбое.
 */

export const ARTIFACT_CLASSES = ['coherent-artifact', 'system'] as const;

export type ArtifactClass = (typeof ARTIFACT_CLASSES)[number];

export type ClassificationOutcome =
  | { status: 'classified'; artifactClass: ArtifactClass; judgedBy: string }
  /** Суд класса не состоялся — с причиной, которую лента называет. */
  | { status: 'skipped'; reason: string };

/**
 * Потолок долей цельно-артефактного плана.
 *
 * Восемь — не вкус, а форма плана, которую класс допускает: «собери артефакт целиком», затем
 * несколько проходов полировки и проверок. Всё, что крупнее, — уже нарезка: она заводит второго
 * исполнителя в тот же артефакт, а второй исполнитель в артефакте и есть механизм расхождения.
 * Слепок приёмки (41 задача) обязан ломаться об это число с запасом, а не впритык.
 */
export const WHOLE_ARTIFACT_TASK_LIMIT = 8;

/**
 * Файлы, из которых артефакт состоит как ВЕЩЬ: разметка, стили, поведение, шаблоны.
 *
 * Забор вокруг такого файла — это забор внутри артефакта. Конфиги, данные и инструменты сюда не
 * входят: задача «поставь playwright» не делит вещь, даже если живёт в том же плане.
 */
const PRESENTATIONAL_EXTENSIONS = [
  '.html',
  '.htm',
  '.css',
  '.scss',
  '.sass',
  '.less',
  '.js',
  '.jsx',
  '.mjs',
  '.ts',
  '.tsx',
  '.vue',
  '.svelte',
  '.astro',
] as const;

const isPresentational = (file: string): boolean => {
  const lower = file.toLowerCase();
  return PRESENTATIONAL_EXTENSIONS.some((extension) => lower.endsWith(extension));
};

/** Инструментальная обвязка артефактом не является: она про него, а не он. */
const TOOLING_PREFIXES = ['tools/', 'tests/', 'test/', 'e2e/', 'scripts/', 'bundle/', 'handoff/'];

const isTooling = (file: string): boolean => {
  const normalized = file.replaceAll('\\', '/').toLowerCase();
  return TOOLING_PREFIXES.some((prefix) => normalized.startsWith(prefix));
};

/** Файлы самого артефакта в охвате одной задачи. */
function artifactFilesOf(task: ReviewableTask): string[] {
  return task.filesToEdit
    .map((file) => file.replaceAll('\\', '/'))
    .filter((file) => isPresentational(file) && !isTooling(file));
}

/**
 * Годен ли план форме «цельный артефакт» — ЧИСТАЯ функция над охватами (без модели).
 *
 * Возвращает пробелы формы поимённо; пустой список — план цельно-артефактный. Пробелы говорят
 * числами прогона, а не лозунгами: их читает владелец, решая «продолжить или переписать план».
 */
export function judgeWholeArtifactPlan(tasks: readonly ReviewableTask[]): string[] {
  const gaps: string[] = [];

  if (tasks.length > WHOLE_ARTIFACT_TASK_LIMIT) {
    gaps.push(
      `Форма плана не соответствует классу «связный визуальный артефакт»: план нарезан на ` +
        `${String(tasks.length)} задач при потолке ${String(WHOLE_ARTIFACT_TASK_LIMIT)}. ` +
        'Связность — свойство целого: артефакт собирает ОДИН исполнитель целиком, а остальные ' +
        'задачи полируют его итерациями, а не собирают по кускам.',
    );
  }

  const owners = tasks
    .map((task) => ({ task, files: artifactFilesOf(task) }))
    .filter((entry) => entry.files.length > 0);

  const union = new Set(owners.flatMap((entry) => entry.files));

  if (owners.length > 1 && union.size > 1) {
    const whole = owners.find((entry) => [...union].every((file) => entry.files.includes(file)));

    if (whole === undefined) {
      const biggest = owners.reduce((best, entry) =>
        entry.files.length > best.files.length ? entry : best,
      );

      gaps.push(
        `Заборы режут артефакт: ${String(union.size)} файлов самого артефакта поделены между ` +
          `${String(owners.length)} задачами, и НИ ОДНА не владеет им целиком (самый широкий охват — ` +
          `${biggest.task.taskId}, ${String(biggest.files.length)} из ${String(union.size)}). ` +
          'Ни один исполнитель не увидит вещь целиком — расхождение кнопок и вёрстки заложено в план.',
      );
    }
  }

  return gaps;
}

const SYSTEM = [
  'Ты — Архитектор, определяющий КЛАСС задумки перед планированием работ. Ровно один вопрос:',
  'является ли задуманное связным визуальным артефактом одного контекста или системой.',
  'Отвечай ТОЛЬКО JSON-объектом, без пояснений и без обрамляющих кавычек кода.',
].join(' ');

const ModelClass = z.object({
  artifactClass: z.enum(ARTIFACT_CLASSES),
  reason: z.string().optional(),
});

/** Промпт классификатора — экспортирован, чтобы регрессия судила ВХОД, а не только выход. */
export function classificationPrompt(seed: string): string {
  return [
    'Задумка владельца (дословно):',
    seed,
    '',
    'Классы:',
    '- "coherent-artifact" — СВЯЗНЫЙ ВИЗУАЛЬНЫЙ АРТЕФАКТ ОДНОГО КОНТЕКСТА: качество результата есть',
    '  его целостность, и оценивается он глазами целиком. Сайт-визитка или лендинг в одну–несколько',
    '  страниц, единый интерфейс, презентация, постер, отчёт-документ. Признак класса: расхождение',
    '  частей между собой — это дефект первого сорта, а «каждая часть по отдельности корректна» не',
    '  спасает.',
    '- "system" — СИСТЕМА: продукт больше одного контекста, состоит из модулей с границами и',
    '  контрактами, части проверяются собственными тестами по отдельности. Сервис с API, библиотека,',
    '  конвейер обработки, приложение с бэкендом и хранилищем.',
    '',
    'Спорный случай решай по вопросу «чем измеряется провал»: если провалом будет «выглядит',
    'несвязно» — это "coherent-artifact"; если провалом будет «модуль не работает» — это "system".',
    'Размер задумки сам по себе класс не определяет: большой одностраничный сайт остаётся связным',
    'артефактом, крохотный сервис остаётся системой.',
    '',
    'Верни JSON:',
    '{"artifactClass":"coherent-artifact","reason":"одной строкой — почему"}',
    'или',
    '{"artifactClass":"system","reason":"одной строкой — почему"}',
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

export async function classifyArtifact(seed: string, chain: Chain): Promise<ClassificationOutcome> {
  let answer: { text: string; provider: string };
  try {
    answer = await chain.generate({ system: SYSTEM, prompt: classificationPrompt(seed) });
  } catch (error) {
    return {
      status: 'skipped',
      reason: `провайдеры недоступны: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  const parsed = ModelClass.safeParse(extractJson(answer.text));
  if (!parsed.success) {
    return { status: 'skipped', reason: `ответ модели не разобран: ${z.prettifyError(parsed.error)}` };
  }

  return {
    status: 'classified',
    artifactClass: parsed.data.artifactClass,
    judgedBy: answer.provider,
  };
}
