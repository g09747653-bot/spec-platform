import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import type { Chain } from '../llm/chain.ts';

import nvidiaPlan from '../../fixtures/plan-review/nvidia-plan.json' with { type: 'json' };

import {
  WHOLE_ARTIFACT_TASK_LIMIT,
  classificationPrompt,
  classifyArtifact,
  judgeWholeArtifactPlan,
} from './artifact-class.ts';
import type { ReviewableTask } from './plan-review.ts';

/**
 * Класс артефакта и форма плана под него (А-35 п.2а).
 *
 * Модель — стаб, как всюду в CI. Живой замер этого же тракта снят и лежит фикстурой рядом с
 * вердиктом суда полноты; регрессия внизу гоняет слепок приёмки дословно — тот самый план, чья
 * нарезка стоила заказчику продукта.
 */

const stubChain = (answer: string): Chain => ({
  providers: [],
  generate: () => Promise.resolve({ text: answer, provider: 'claude-cli' }),
});

const failingChain = (): Chain => ({
  providers: [],
  generate: () => Promise.reject(new Error('звено красное')),
});

const task = (
  taskId: string,
  title: string,
  filesToEdit: readonly string[] = [],
): ReviewableTask => ({ taskId, title, description: title, filesToEdit });

describe('классификация задумки', () => {
  it('промпт несёт задумку дословно и обе формы ответа', () => {
    const prompt = classificationPrompt('Сделай сайт — копию nvidia.com.');

    expect(prompt).toContain('Сделай сайт — копию nvidia.com.');
    expect(prompt).toContain('"artifactClass":"coherent-artifact"');
    expect(prompt).toContain('"artifactClass":"system"');
  });

  it('разбирает обе формы ответа и называет судью', async () => {
    await expect(classifyArtifact('…', stubChain('{"artifactClass":"system"}'))).resolves.toEqual({
      status: 'classified',
      artifactClass: 'system',
      judgedBy: 'claude-cli',
    });

    const fenced = '```json\n{"artifactClass":"coherent-artifact","reason":"лендинг"}\n```';
    await expect(classifyArtifact('…', stubChain(fenced))).resolves.toEqual({
      status: 'classified',
      artifactClass: 'coherent-artifact',
      judgedBy: 'claude-cli',
    });
  });

  it('чужой класс и красные звенья — named-отказ, а не догадка', async () => {
    const nonsense = await classifyArtifact('…', stubChain('{"artifactClass":"poster"}'));
    expect(nonsense.status).toBe('skipped');

    const dead = await classifyArtifact('…', failingChain());
    expect(dead.status).toBe('skipped');
    if (dead.status !== 'skipped') return;
    expect(dead.reason).toContain('звено красное');
  });
});

describe('годность формы плана классу «цельный артефакт» — чистая функция', () => {
  it('«собери целиком» + полировка проходит: одна задача владеет артефактом целиком', () => {
    const plan = [
      task('T001', 'Собери сайт целиком', ['index.html', 'styles.css', 'app.js']),
      task('T002', 'Отполируй по скриншотам', ['index.html', 'styles.css', 'app.js']),
      task('T003', 'Прогони проверки', ['tools/check.js']),
    ];

    expect(judgeWholeArtifactPlan(plan)).toEqual([]);
  });

  it('план из одной задачи с любым охватом проходит: делить нечего', () => {
    expect(judgeWholeArtifactPlan([task('T001', 'Собери', ['index.html'])])).toEqual([]);
  });

  it('нарезка по кускам артефакта бракуется: ни одна задача не владеет им целиком', () => {
    const plan = [
      task('T001', 'Шапка', ['partials/header.html', 'src/styles/header.css']),
      task('T002', 'Футер', ['partials/footer.html', 'src/styles/footer.css']),
      task('T003', 'Главная', ['index.html', 'src/styles/home.css']),
    ];

    const gaps = judgeWholeArtifactPlan(plan);
    expect(gaps).toHaveLength(1);
    expect(gaps[0]).toContain('Заборы режут артефакт');
    expect(gaps[0]).toContain('6 файлов');
    expect(gaps[0]).toContain('3 задачами');
  });

  it('число долей выше потолка бракуется отдельным пробелом', () => {
    const plan = Array.from({ length: WHOLE_ARTIFACT_TASK_LIMIT + 1 }, (_, index) =>
      task(`T${String(index).padStart(3, '0')}`, 'шаг', ['index.html', 'styles.css']),
    );

    const gaps = judgeWholeArtifactPlan(plan);
    expect(gaps.some((gap) => gap.includes('нарезан на 9 задач'))).toBe(true);
    /* Владелец целого есть у каждой задачи — второй пробел не выдумывается. */
    expect(gaps).toHaveLength(1);
  });

  it('инструменты и конфиги артефакт не делят', () => {
    const plan = [
      task('T001', 'Собери сайт', ['index.html']),
      task('T002', 'Поставь playwright', ['package.json']),
      task('T003', 'Скрипт диффа', ['tools/visual-diff/capture.js']),
      task('T004', 'Тесты', ['tests/smoke.spec.js']),
    ];

    expect(judgeWholeArtifactPlan(plan)).toEqual([]);
  });
});

describe('регрессия на слепке nvidia-плана (А-35 п.2а)', () => {
  /**
   * Слепок — реальные 41 задание финальной приёмки Программы А; до-заход довёл его до 45 теми же
   * четырьмя задачами в хвосте, то есть тем же классом нарезки, только шире. Живой вердикт класса
   * снят мостом подписки тем же промптом и разобран тем же кодом.
   */
  const liveClass = readFileSync(
    join(import.meta.dirname, '..', '..', 'fixtures', 'plan-review', 'nvidia-class.txt'),
    'utf8',
  );

  it('вход классификатора несёт задумку слепка дословно', () => {
    expect(classificationPrompt(nvidiaPlan.seed)).toContain('графическую копию nvidia.com');
  });

  it('живой вердикт называет класс «связный визуальный артефакт»', async () => {
    const outcome = await classifyArtifact(nvidiaPlan.seed, stubChain(liveClass));

    expect(outcome).toEqual({
      status: 'classified',
      artifactClass: 'coherent-artifact',
      judgedBy: 'claude-cli',
    });
  });

  it('и код бракует 41-дольную нарезку обоими пробелами формы', () => {
    const gaps = judgeWholeArtifactPlan(nvidiaPlan.tasks);

    expect(nvidiaPlan.tasks).toHaveLength(41);
    expect(gaps).toHaveLength(2);
    expect(gaps[0]).toContain('нарезан на 41 задач');
    expect(gaps[1]).toContain('НИ ОДНА не владеет им целиком');
  });
});
