import { describe, expect, it } from 'vitest';

import type { Chain } from '../llm/chain.ts';

import nvidiaPlan from '../../fixtures/plan-review/nvidia-plan.json' with { type: 'json' };

import { WHOLE_ARTIFACT_TASK_LIMIT, judgeWholeArtifactPlan } from './artifact-class.ts';
import {
  asReviewable,
  buildWholeArtifactPlan,
  shapePlan,
  skeletonPlan,
  wholeArtifactPrompt,
  type PlannedTask,
} from './whole-artifact-plan.ts';

/**
 * Архитектор заданий класса «цельный артефакт» (А-36 п.1).
 *
 * Регрессия внизу — не выдумка: слепок приёмки, тот самый план из 41 доли, чья нарезка стоила
 * заказчику продукта, подаётся ветке КАК ОТВЕТ МОДЕЛИ. Что бы модель ни написала, наружу обязан
 * выйти план, проходящий собственный суд формы.
 */

const stubChain = (...answers: string[]): Chain => {
  let call = 0;
  return {
    providers: [],
    generate: () => {
      const answer = answers[Math.min(call, answers.length - 1)] ?? '';
      call += 1;
      return Promise.resolve({ text: answer, provider: 'claude-cli' });
    },
  };
};

const failingChain = (): Chain => ({
  providers: [],
  generate: () => Promise.reject(new Error('звенья красные')),
});

const context = {
  architecture: 'Статический сайт без бэкенда.',
  bundleTitles: ['Свёрстать шапку', 'Свёрстать подвал'],
  techStack: 'nodejs',
};

const SEED = 'Сделай сайт — графическую копию, две страницы, статикой.';

/** Задачи плана, трогающие сам артефакт, в порядке плана. */
const touching = (tasks: readonly PlannedTask[]): PlannedTask[] =>
  tasks.filter((task) => task.role === 'whole' || task.role === 'polish');

describe('промпт ветки', () => {
  it('несёт задумку дословно, потолок долей и запрет делить артефакт', () => {
    const prompt = wholeArtifactPrompt(SEED, context);

    expect(prompt).toContain(SEED);
    expect(prompt).toContain(`от 1 до ${String(WHOLE_ARTIFACT_TASK_LIMIT)}`);
    expect(prompt).toContain('РОВНО ОДНА задача с ролью "whole"');
    expect(prompt).toContain('НЕ дели артефакт между задачами');
  });

  it('перечень бандла подан как охват, а не как план', () => {
    const prompt = wholeArtifactPrompt(SEED, context);

    expect(prompt).toContain('Свёрстать шапку');
    expect(prompt).toContain('НЕ повторять как задачи');
  });

  it('пробелы прошлого суда полноты едут в промпт обязательным покрытием', () => {
    const prompt = wholeArtifactPrompt(SEED, {
      ...context,
      mustCover: ['Нет задачи, заменяющей бренд на нейтральный знак'],
    });

    expect(prompt).toContain('Суд полноты уже забраковал ПРЕДЫДУЩИЙ план');
    expect(prompt).toContain('1. Нет задачи, заменяющей бренд на нейтральный знак');
    expect(prompt).toContain('обязан быть покрыт задачей нового плана');
  });

  it('переспрос несёт названные пробелы формы дословно', () => {
    const prompt = wholeArtifactPrompt(SEED, context, ['Заборы режут артефакт: 12 файлов…']);

    expect(prompt).toContain('забракован судом формы');
    expect(prompt).toContain('1. Заборы режут артефакт: 12 файлов…');
  });
});

describe('форма поверх модельного предложения — чистая функция', () => {
  it('владелец целого получает ОБЪЕДИНЕНИЕ файлов артефакта', () => {
    const shaped = shapePlan([
      {
        role: 'whole',
        title: 'Собери целиком',
        description: '…',
        filesToEdit: ['index.html'],
      },
      {
        role: 'polish',
        title: 'Отполируй',
        description: '…',
        filesToEdit: ['products.html', 'src/styles/main.css'],
      },
    ]);

    const owner = shaped.find((task) => task.role === 'whole');

    expect(owner?.filesToEdit).toEqual(
      expect.arrayContaining(['index.html', 'products.html', 'src/styles/main.css']),
    );
    expect(judgeWholeArtifactPlan(asReviewable(shaped))).toEqual([]);
  });

  it('владелец один: второй «whole» становится полировкой', () => {
    const shaped = shapePlan([
      { role: 'whole', title: 'Первый', description: '…', filesToEdit: ['index.html'] },
      { role: 'whole', title: 'Второй', description: '…', filesToEdit: ['index.html'] },
    ]);

    expect(shaped.filter((task) => task.role === 'whole')).toHaveLength(1);
    expect(shaped.map((task) => task.role)).toEqual(['whole', 'polish']);
  });

  it('владельца не назвали — им становится самый широкий охват артефакта', () => {
    const shaped = shapePlan([
      { role: 'material', title: 'Материал', description: '…', filesToEdit: ['assets/logo.svg'] },
      {
        role: 'polish',
        title: 'Вёрстка',
        description: '…',
        filesToEdit: ['index.html', 'products.html'],
      },
    ]);

    expect(shaped.find((task) => task.role === 'whole')?.title).toBe('Вёрстка');
  });

  it('артефакт в один момент трогает один исполнитель: владелец и полировки — строгая цепь', () => {
    const shaped = shapePlan([
      { role: 'tooling', title: 'Инструмент', description: '…', filesToEdit: ['tools/diff.js'] },
      { role: 'whole', title: 'Целиком', description: '…', filesToEdit: ['index.html'] },
      { role: 'polish', title: 'Полировка 1', description: '…', filesToEdit: ['index.html'] },
      { role: 'polish', title: 'Полировка 2', description: '…', filesToEdit: ['index.html'] },
      { role: 'measure', title: 'Замер', description: '…', filesToEdit: ['RESULT.md'] },
    ]);

    const chain = touching(shaped);
    expect(chain.map((task) => task.title)).toEqual(['Целиком', 'Полировка 1', 'Полировка 2']);

    /* Каждая следующая ждёт ИМЕННО предыдущую — параллельными они не станут ни при какой нарезке. */
    expect(chain[0]?.dependsOn).toEqual(['WA01']);
    expect(chain[1]?.dependsOn).toEqual([chain[0]?.taskId]);
    expect(chain[2]?.dependsOn).toEqual([chain[1]?.taskId]);

    /* Обвязка впереди и ничего не ждёт; замер — за последней правкой артефакта. */
    expect(shaped[0]?.role).toBe('tooling');
    expect(shaped[0]?.dependsOn).toEqual([]);
    expect(shaped.at(-1)?.role).toBe('measure');
    expect(shaped.at(-1)?.dependsOn).toEqual([chain.at(-1)?.taskId]);
  });

  it('скелет кода проходит суд формы и несёт задумку исполнителю целого', () => {
    const skeleton = skeletonPlan(SEED, ['index.html', 'products.html', 'tools/diff.js']);

    expect(judgeWholeArtifactPlan(asReviewable(skeleton))).toEqual([]);
    expect(skeleton.length).toBeLessThanOrEqual(WHOLE_ARTIFACT_TASK_LIMIT);

    const owner = skeleton.find((task) => task.role === 'whole');
    expect(owner?.description).toContain(SEED);
    /* Инструмент артефактом не владеет — он про него. */
    expect(owner?.filesToEdit).toEqual(['index.html', 'products.html']);
  });
});

describe('сборка плана: модель пишет, код принимает', () => {
  const goodPlan = JSON.stringify({
    tasks: [
      {
        role: 'material',
        title: 'Добудь материал',
        description: 'Скачай изображения и шрифты.',
        filesToEdit: [],
        unitTestCmd: 'test -d assets',
      },
      {
        role: 'whole',
        title: 'Собери артефакт целиком',
        description: 'Собери обе страницы одним заходом.',
        filesToEdit: ['index.html', 'products.html', 'src/styles/main.css'],
        unitTestCmd: 'test -f index.html',
        iterationTimeoutSec: 5400,
      },
      {
        role: 'measure',
        title: 'Замерь',
        description: 'Сверь и запиши отчёт.',
        filesToEdit: ['RESULT.md'],
        unitTestCmd: 'test -f RESULT.md',
      },
    ],
  });

  it('годный план принят с первого раза и назван провайдером', async () => {
    const result = await buildWholeArtifactPlan({
      seed: SEED,
      context,
      chain: stubChain(goodPlan),
    });

    expect(result.writtenBy).toBe('claude-cli');
    expect(result.retriedBecause).toEqual([]);
    expect(result.degradedBecause).toBeUndefined();
    expect(judgeWholeArtifactPlan(asReviewable(result.tasks))).toEqual([]);
    expect(result.tasks.find((task) => task.role === 'whole')?.iterationTimeoutSec).toBe(5400);
  });

  it('нарезку переспрашивает один раз — и принимает исправленный ответ', async () => {
    const sliced = JSON.stringify({
      tasks: Array.from({ length: 12 }, (_, index) => ({
        role: 'polish',
        title: `Секция ${String(index + 1)}`,
        description: '…',
        filesToEdit: [`src/sections/section-${String(index + 1)}.html`],
        unitTestCmd: 'test -d src',
      })),
    });

    const result = await buildWholeArtifactPlan({
      seed: SEED,
      context,
      chain: stubChain(sliced, goodPlan),
    });

    expect(result.writtenBy).toBe('claude-cli');
    expect(result.retriedBecause.join(' ')).toContain('потолке');
    expect(judgeWholeArtifactPlan(asReviewable(result.tasks))).toEqual([]);
  });

  it('провайдера нет — скелет кодом, причина названа', async () => {
    const result = await buildWholeArtifactPlan({
      seed: SEED,
      context,
      chain: null,
      knownArtifactFiles: ['index.html'],
    });

    expect(result.writtenBy).toBeNull();
    expect(result.degradedBecause).toBe('провайдер роли архитектора не настроен');
    expect(judgeWholeArtifactPlan(asReviewable(result.tasks))).toEqual([]);
  });

  it('звенья красные — скелет, и причина несёт ответ провайдера', async () => {
    const result = await buildWholeArtifactPlan({
      seed: SEED,
      context,
      chain: failingChain(),
    });

    expect(result.writtenBy).toBeNull();
    expect(result.degradedBecause).toContain('звенья красные');
  });

  it('ответ не разобран дважды — скелет, а не пустой план', async () => {
    const result = await buildWholeArtifactPlan({
      seed: SEED,
      context,
      chain: stubChain('я подумал и решил ответить прозой'),
      knownArtifactFiles: ['index.html'],
    });

    expect(result.writtenBy).toBeNull();
    expect(result.degradedBecause).toContain('не разобран');
    expect(result.tasks.length).toBeGreaterThan(0);
    expect(judgeWholeArtifactPlan(asReviewable(result.tasks))).toEqual([]);
  });
});

/**
 * Регрессия А-36 п.1 на слепке приёмки.
 *
 * Тот самый план из 41 доли подаётся ветке как ответ модели — дважды, потому что модель, однажды
 * написавшая нарезку, вполне может написать её снова. Наружу обязан выйти цельный план: это и есть
 * вторая половина суда формы — не только «забраковать чужое», но и «написать своё».
 */
describe('регрессия: слепок nvidia-плана, поданный ветке как ответ модели', () => {
  const asModelAnswer = JSON.stringify({
    tasks: nvidiaPlan.tasks.map((task) => ({
      role: 'polish',
      title: task.title.slice(0, 120),
      description: task.description.slice(0, 200),
      filesToEdit: task.filesToEdit,
      unitTestCmd: 'test -d .',
    })),
  });

  it('вход ветки несёт задумку слепка дословно', () => {
    expect(wholeArtifactPrompt(nvidiaPlan.seed, context)).toContain(nvidiaPlan.seed);
  });

  it('нарезка из 41 доли забракована формой и переспрошена обоими пробелами', async () => {
    const result = await buildWholeArtifactPlan({
      seed: nvidiaPlan.seed,
      context,
      chain: stubChain(asModelAnswer),
      knownArtifactFiles: ['index.html', 'products.html'],
    });

    expect(result.retriedBecause.join(' ')).toContain('потолке');
    expect(result.writtenBy).toBeNull();
    expect(result.degradedBecause).toContain('не прошёл собственный суд формы');
  });

  it('и что бы модель ни ответила, наружу выходит план, проходящий суд формы', async () => {
    const result = await buildWholeArtifactPlan({
      seed: nvidiaPlan.seed,
      context,
      chain: stubChain(asModelAnswer),
      knownArtifactFiles: ['index.html', 'products.html'],
    });

    expect(judgeWholeArtifactPlan(asReviewable(result.tasks))).toEqual([]);
    expect(result.tasks.length).toBeLessThanOrEqual(WHOLE_ARTIFACT_TASK_LIMIT);
    expect(result.tasks.filter((task) => task.role === 'whole')).toHaveLength(1);
  });
});
