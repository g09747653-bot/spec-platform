import { describe, expect, it } from 'vitest';

import type { Chain } from '../llm/chain.ts';

import nvidiaPlan from '../../fixtures/plan-review/nvidia-plan.json' with { type: 'json' };

import { WHOLE_ARTIFACT_TASK_LIMIT, judgeWholeArtifactPlan } from './artifact-class.ts';
import {
  asReviewable,
  buildWholeArtifactPlan,
  composeMeasuredAcceptance,
  CONVERGENCE_LEDGER,
  judgeMeasuredAcceptance,
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
        measurement: {
          cmd: 'node tools/measure.js',
          recordPath: 'RESULT.json',
          divergenceKey: 'diffPercent',
        },
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

/**
 * Приёмка полировки и замера — факт, а не число (А-37 п.1).
 *
 * Регрессия внизу гоняет слепок WA04 — ту самую задачу, чью приёмку план написал себе сам
 * как «прогон сверки вернул 0», где сверка внутри держала порог «не больше 1% различающихся
 * пикселей». Сборка с нуля такого не берёт по построению, и задача не могла быть принята
 * никогда: конвейер встал не на плохой работе, а на невыполнимом определении готовности.
 */
describe('приёмка полировки и замера составляется кодом', () => {
  const measurement = {
    cmd: 'node tools/visual-diff/compare.js',
    recordPath: 'tools/visual-diff/report.json',
    divergenceKey: 'summary.diffPercent',
  };

  it('вердикт самого измерения проглатывается: мнение о качестве воротами не бывает', () => {
    const accepted = composeMeasuredAcceptance(measurement);

    expect(accepted).toContain('node tools/visual-diff/compare.js || true');
  });

  it('требуется ФАКТ записи: отчёт существует и непуст', () => {
    expect(composeMeasuredAcceptance(measurement)).toContain(
      'test -s tools/visual-diff/report.json',
    );
  });

  it('требуется сходимость, а не порог: расхождение не выросло против прошлой итерации', () => {
    const accepted = composeMeasuredAcceptance(measurement);

    expect(accepted).toContain(CONVERGENCE_LEDGER);
    expect(accepted).toContain('расхождение выросло');
    /* Ни одного абсолютного порога в приёмке нет — он публикуемая метрика, а не ворота. */
    expect(accepted).not.toMatch(/<=\s*\d/);
    expect(accepted).toContain('замер зафиксирован');
  });

  it('число берётся по ключу, и нечисло — названный отказ, а не тихий пропуск', () => {
    const accepted = composeMeasuredAcceptance(measurement);

    expect(accepted).toContain('"summary.diffPercent".split(".")');
    expect(accepted).toContain('замер не записал число по ключу');
  });

  it('вставка не ломает `sh -c`: внутри одинарных кавычек их больше нет', () => {
    const accepted = composeMeasuredAcceptance(measurement);
    const inner = accepted.slice(accepted.indexOf("node -e '") + 9, accepted.length - 1);

    expect(inner).not.toContain("'");
  });

  it('полировка и замер без измерения — названный пробел формы', () => {
    const shaped = shapePlan([
      { role: 'whole', title: 'Целиком', description: '…', filesToEdit: ['index.html'] },
      { role: 'polish', title: 'Полировка', description: '…', filesToEdit: ['index.html'] },
    ]);

    const gaps = judgeMeasuredAcceptance(shaped);
    expect(gaps).toHaveLength(1);
    expect(gaps[0]).toContain('WA02');
    expect(gaps[0]).toContain('публикуется метрикой');
  });

  it('измерение названо — пробелов нет, приёмку несёт задача', () => {
    const shaped = shapePlan([
      { role: 'whole', title: 'Целиком', description: '…', filesToEdit: ['index.html'] },
      {
        role: 'polish',
        title: 'Полировка',
        description: '…',
        filesToEdit: ['index.html'],
        measurement,
      },
    ]);

    expect(judgeMeasuredAcceptance(shaped)).toEqual([]);
    expect(shaped[1]?.unitTestCmd).toBe(composeMeasuredAcceptance(measurement));
  });

  it('промпт запрещает порог воротами и просит измерение', () => {
    const prompt = wholeArtifactPrompt(SEED, context);

    expect(prompt).toContain('ПРИЁМКА ПОЛИРОВКИ И ЗАМЕРА — не число');
    expect(prompt).toContain('воротами НЕ БЫВАЕТ');
    expect(prompt).toContain('"measurement"');
    expect(prompt).toContain('divergenceKey');
  });
});

describe('регрессия А-37: слепок WA04 — ворота «≤1%» больше не генерятся', () => {
  /** Приёмка, которую план написал себе сам в раунде А-36 и на которой встал конвейер. */
  const WA04_GATE =
    'node tools/build.js && node tools/visual-diff/capture.js && node tools/visual-diff/compare.js';

  it('команда модели для полировки НЕ становится приёмкой', () => {
    const shaped = shapePlan([
      { role: 'whole', title: 'Целиком', description: '…', filesToEdit: ['index.html'] },
      {
        role: 'polish',
        title: 'Полировка 1: свести вёрстку к эталонным координатам',
        description: '…',
        filesToEdit: ['index.html'],
        unitTestCmd: WA04_GATE,
      },
    ]);

    expect(shaped[1]?.unitTestCmd).not.toBe(WA04_GATE);
    expect(shaped[1]?.unitTestCmd).toBeUndefined();
  });

  it('и такой план не выходит наружу: пробел назван, переспрос, затем скелет', async () => {
    const gated = JSON.stringify({
      tasks: [
        {
          role: 'whole',
          title: 'Собери сайт целиком',
          description: '…',
          filesToEdit: ['index.html', 'products.html'],
          unitTestCmd: 'test -f index.html',
        },
        {
          role: 'polish',
          title: 'Полировка 1: свести вёрстку к эталонным координатам',
          description: '…',
          filesToEdit: ['index.html', 'products.html'],
          unitTestCmd: WA04_GATE,
        },
      ],
    });

    const result = await buildWholeArtifactPlan({
      seed: SEED,
      context,
      chain: stubChain(gated),
      knownArtifactFiles: ['index.html', 'products.html'],
    });

    expect(result.retriedBecause.join(' ')).toContain('без записываемого измерения');
    expect(result.writtenBy).toBeNull();
    /* Наружу вышел скелет — и в нём ни одной приёмки, зависящей от порога. */
    for (const task of result.tasks) {
      expect(task.unitTestCmd ?? '').not.toContain('compare.js');
    }
  });

  it('та же полировка с измерением вместо ворот принимается', async () => {
    const measured = JSON.stringify({
      tasks: [
        {
          role: 'whole',
          title: 'Собери сайт целиком',
          description: '…',
          filesToEdit: ['index.html', 'products.html'],
          unitTestCmd: 'test -f index.html',
        },
        {
          role: 'polish',
          title: 'Полировка 1: свести вёрстку к эталонным координатам',
          description: '…',
          filesToEdit: ['index.html', 'products.html'],
          measurement: {
            cmd: WA04_GATE,
            recordPath: 'tools/visual-diff/report.json',
            divergenceKey: 'summary.diffPercent',
          },
        },
      ],
    });

    const result = await buildWholeArtifactPlan({
      seed: SEED,
      context,
      chain: stubChain(measured),
    });

    expect(result.writtenBy).toBe('claude-cli');
    expect(result.retriedBecause).toEqual([]);

    const polish = result.tasks.find((task) => task.role === 'polish');
    /* Прогон остался — воротами перестал быть. */
    expect(polish?.unitTestCmd).toContain(`${WA04_GATE} || true`);
    expect(polish?.unitTestCmd).toContain('расхождение выросло');
  });
});

/**
 * Область идентификаторов задач (D-325, продолжение D-324).
 *
 * Дефект стоил прогона молча: второй проект с теми же `WA01…` перехватывал строки первого, а
 * `ON CONFLICT` намеренно не трогает `status` — и свежий план вступал в прогон с ЧУЖИМИ статусами
 * («три приняты, одна заблокирована»), при пяти PENDING на диске и без единого контейнера.
 */
describe('область идентификаторов задач — второй проект не перехватывает первый (D-325)', () => {
  const proposal: Parameters<typeof shapePlan>[0] = [
    { role: 'whole', title: 'Целиком', description: '…', filesToEdit: ['index.html'] },
    {
      role: 'polish',
      title: 'Полировка',
      description: '…',
      filesToEdit: ['index.html'],
      measurement: { cmd: 'node m.js', recordPath: 'r.json', divergenceKey: 'diff' },
    },
  ];

  it('без области нумерация прежняя', () => {
    expect(shapePlan(proposal).map((t) => t.taskId)).toEqual(['WA01', 'WA02']);
  });

  it('с областью идентификаторы несут её, и ожидания ссылаются внутрь области', () => {
    const shaped = shapePlan(proposal, '9c57b180');

    expect(shaped.map((t) => t.taskId)).toEqual(['WA_9c57b180_01', 'WA_9c57b180_02']);
    expect(shaped[1]?.dependsOn).toEqual(['WA_9c57b180_01']);
  });

  it('два проекта в одном индексе не делят ни одного идентификатора задачи', () => {
    const mine = new Set(shapePlan(proposal, 'aaaaaaaa').map((t) => t.taskId));
    const theirs = shapePlan(proposal, 'bbbbbbbb').map((t) => t.taskId);

    expect(theirs.some((id) => mine.has(id))).toBe(false);
  });

  it('скелет несёт область тем же порядком', () => {
    const skeleton = skeletonPlan(SEED, ['index.html'], 'cccccccc');

    expect(skeleton.every((t) => t.taskId.startsWith('WA_cccccccc_'))).toBe(true);
    expect(judgeWholeArtifactPlan(asReviewable(skeleton))).toEqual([]);
  });
});
