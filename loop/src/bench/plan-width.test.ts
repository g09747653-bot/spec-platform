import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import type { BundleTask } from '../intake/validate.ts';

import { measureWidth, planOf, planShape, walkPlan } from './plan-width.ts';

/**
 * Ширина плана — замер того, что ставит потолок ПОСЛЕ исполнителей (А-51 п.4).
 *
 * Бухгалтерия замера — непроверенный код, и это уже стоило нам раунда (M14а: репетиция поймала три
 * дефекта бесплатно). Здесь она проверяется на планах, чей ответ известен из построения.
 */

const task = (taskId: string, dependsOn: string[] = []): BundleTask => ({
  taskId,
  title: `Задача ${taskId}`,
  description: 'Описание.',
  dependsOn,
  metadata: { expectedArtifacts: [] },
});

const noFiles = (): readonly string[] => [];

describe('форма плана', () => {
  it('одна фаза без зависимостей — одна веха во всю ширину', () => {
    const shape = planShape(
      Array.from({ length: 10 }, (_, index) => task(`1.${String(index + 1)}`)),
    );

    expect(shape.strategy).toBe('phases');
    expect(shape.milestones).toHaveLength(1);
    expect(shape.widest).toBe(10);
  });

  it('РЕГРЕССИЯ: плоские идентификаторы без зависимостей вырождают ширину в единицу', () => {
    /*
     * Ловушка нотации, а не планировщика: `phaseOf('7') === '7'`, и шестнадцать задач с плоскими
     * номерами и пустыми `dependsOn` дают шестнадцать вех по одной задаче. Ширина умирает в том,
     * КАК записан план, и починить её в контуре нечем.
     */
    const shape = planShape(Array.from({ length: 6 }, (_, index) => task(String(index + 1))));

    expect(shape.strategy).toBe('phases');
    expect(shape.milestones).toHaveLength(6);
    expect(shape.widest).toBe(1);
  });

  it('зависимости кладут независимое в один слой — ширина берётся оттуда', () => {
    const shape = planShape([task('1'), task('2'), task('3'), task('4', ['1']), task('5', ['2'])]);

    expect(shape.strategy).toBe('dependencies');
    expect(shape.milestones.map((milestone) => milestone.tasks)).toEqual([3, 2]);
    expect(shape.widest).toBe(3);
  });
});

describe('прогон плана настоящим планировщиком', () => {
  it('десять независимых задач при потолке 10 — один такт, одновременность 10', () => {
    const tasks = Array.from({ length: 10 }, (_, index) => task(`1.${String(index + 1)}`));
    const outcome = walkPlan(planOf(tasks, noFiles), 10);

    expect(outcome.ticks).toBe(1);
    expect(outcome.peak).toBe(10);
    expect(outcome.averageConcurrency).toBe(10);
  });

  it('тот же план при потолке 1 — десять тактов: ускорение и есть отношение', () => {
    const tasks = Array.from({ length: 10 }, (_, index) => task(`1.${String(index + 1)}`));

    expect(walkPlan(planOf(tasks, noFiles), 1).ticks).toBe(10);
    expect(measureWidth({ label: 'эталон', tasks, filesOf: noFiles, limit: 10 }).speedup).toBe(10);
  });

  it('правило файлов сужает ширину — и это свойство плана, а не потолка', () => {
    const tasks = Array.from({ length: 4 }, (_, index) => task(`1.${String(index + 1)}`));
    /* Все четыре правят один файл: планировщик обязан пустить их по очереди. */
    const outcome = walkPlan(
      planOf(tasks, () => ['src/shared.ts']),
      10,
    );

    expect(outcome.ticks).toBe(4);
    expect(outcome.peak).toBe(1);
    expect(outcome.held.files).toBeGreaterThan(0);
  });

  it('потолок ниже ширины вехи режет одновременность до потолка', () => {
    const tasks = Array.from({ length: 10 }, (_, index) => task(`1.${String(index + 1)}`));
    const outcome = walkPlan(planOf(tasks, noFiles), 3);

    expect(outcome.peak).toBe(3);
    expect(outcome.ticks).toBe(4);
    expect(outcome.held.ceiling).toBeGreaterThan(0);
  });

  it('цепь из вех проходится по одной вехе за такт, а внутри вехи — вширь', () => {
    const tasks = [task('1'), task('2'), task('3', ['1', '2']), task('4', ['1', '2'])];
    const outcome = walkPlan(planOf(tasks, noFiles), 10);

    expect(outcome.ticks).toBe(2);
    expect(outcome.averageConcurrency).toBe(2);
  });

  it('план, по которому нельзя дойти до конца, — названная ошибка, а не вечный цикл', () => {
    /* Зависимость на задачу вне плана: `sliceMilestones` такой бандл и не примет. */
    expect(() => planShape([task('1', ['нет-такой'])])).toThrow('нарезка отказала');
  });
});

describe('нотация решает ширину: слепок M14а против его канонического близнеца (А-52)', () => {
  /*
   * Регрессия мандата А-52 на настоящих выжимках. Живой слепок M14а — шестнадцать честных задач,
   * ни одна не заявила зависимости — и его близнец: тот же план (те же шестнадцать задач той же
   * задумки), записанный так, как теперь велит инструкция генерации платформы, — сквозные номера
   * и явная строка зависимостей у каждой задачи. Обе выжимки — голдены платформы, произведённые её
   * настоящим маппингом; нарезка и планировщик здесь — настоящие. Разница между 2,67× и большим
   * числом близнеца — цена НОТАЦИИ, а не способности планировать.
   */
  const golden = (name: string): BundleTask[] => {
    const raw: unknown = JSON.parse(
      readFileSync(join(import.meta.dirname, '../../../fixtures/spec-bundle/golden', name), 'utf8'),
    );

    return z
      .object({
        tasks: z.array(
          z.object({
            taskId: z.string(),
            title: z.string(),
            description: z.string(),
            dependsOn: z.array(z.string()),
            metadata: z.object({ expectedArtifacts: z.array(z.unknown()) }),
          }),
        ),
      })
      .parse(raw).tasks;
  };

  it('живой слепок без зависимостей режется по фазам: шесть последовательных вех, потолок 2,67×', () => {
    const measured = measureWidth({
      label: 'M14а: живой слепок',
      tasks: golden('m14a-live.tasks.json'),
      filesOf: noFiles,
      limit: 10,
    });

    expect(measured.shape.strategy).toBe('phases');
    expect(measured.shape.withDependencies).toBe(0);
    expect(measured.shape.milestones.map((milestone) => milestone.tasks)).toEqual([
      2, 2, 2, 3, 4, 3,
    ]);
    expect(measured.speedup).toBeCloseTo(16 / 6, 5);
  });

  it('тот же план в новой записи режется по зависимостям — и ширина измеримо больше', () => {
    const live = measureWidth({
      label: 'M14а: живой слепок',
      tasks: golden('m14a-live.tasks.json'),
      filesOf: noFiles,
      limit: 10,
    });
    const twin = measureWidth({
      label: 'M14а: канонический близнец',
      tasks: golden('m14a-canonical.tasks.json'),
      filesOf: noFiles,
      limit: 10,
    });

    expect(twin.shape.strategy).toBe('dependencies');
    expect(twin.shape.tasks).toBe(live.shape.tasks);

    /* Измеримо: меньше тактов, шире пик, выше ускорение — не «примерно так же». */
    expect(twin.wide.ticks).toBeLessThan(live.wide.ticks);
    expect(twin.shape.widest).toBeGreaterThan(live.shape.widest);
    expect(twin.speedup).toBeGreaterThan(live.speedup);
  });

  it('та же запись с плоскими номерами, но БЕЗ заявленных зависимостей — вырождение до единицы', () => {
    /*
     * Ловушка, ради которой машинный экспорт получил named-предупреждение о плоском плане (А-52):
     * канонические сквозные номера при пустых `dependsOn` — это `phaseOf('7') === '7'`, шестнадцать
     * вех по одной задаче, ускорение 1,00×. Хуже живого слепка, у которого хотя бы фазы были.
     */
    const flattened = measureWidth({
      label: 'близнец с вычеркнутыми зависимостями',
      tasks: golden('m14a-canonical.tasks.json').map((entry) => ({ ...entry, dependsOn: [] })),
      filesOf: noFiles,
      limit: 10,
    });

    expect(flattened.shape.strategy).toBe('phases');
    expect(flattened.shape.milestones).toHaveLength(16);
    expect(flattened.shape.widest).toBe(1);
    expect(flattened.speedup).toBeCloseTo(1, 5);
  });
});
