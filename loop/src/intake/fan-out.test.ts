import { describe, expect, it } from 'vitest';

import { DEFAULT_INTAKE_CONCURRENCY, mapWithLimit } from './fan-out.ts';

/**
 * Веер с потолком — примитив, на котором стоит распараллеленное планирование (А-51 п.3).
 *
 * Два свойства и оба обязательны. **Порядок результатов есть порядок входа** — иначе «задача 7»
 * перестала бы быть седьмой, а план читает человек. **Одновременно в полёте не больше потолка** —
 * иначе цепочка провайдеров, перебирающая все свои звенья на каждом вызове, дала бы на красном
 * первом звене столько одновременных запросов ко второму, сколько задач в вехе.
 */
describe('веер с потолком', () => {
  it('порядок результатов — порядок входа, как бы ни отвечали работы', async () => {
    /* Первая работа отвечает последней: если бы порядок задавала гонка, он бы перевернулся. */
    const delays = [40, 30, 20, 10, 0];

    const result = await mapWithLimit(delays, 5, async (delay, index) => {
      await new Promise((resolve) => setTimeout(resolve, delay));
      return `${String(index)}:${String(delay)}`;
    });

    expect(result).toEqual(['0:40', '1:30', '2:20', '3:10', '4:0']);
  });

  it('РЕГРЕССИЯ: одновременно в полёте не больше потолка', async () => {
    let live = 0;
    let peak = 0;

    await mapWithLimit(
      Array.from({ length: 20 }, (_, index) => index),
      3,
      async () => {
        live += 1;
        peak = Math.max(peak, live);
        await new Promise((resolve) => setTimeout(resolve, 5));
        live -= 1;
      },
    );

    expect(peak).toBe(3);
  });

  it('потолок шире входа сжимается до входа, а не заводит пустых работников', async () => {
    let started = 0;

    await mapWithLimit([1, 2], 100, async (value) => {
      started += 1;
      return Promise.resolve(value);
    });

    expect(started).toBe(2);
  });

  it('выключенная опечаткой параллельность — это последовательность, а не остановка', async () => {
    let peak = 0;
    let live = 0;

    const result = await mapWithLimit([1, 2, 3], 0, async (value) => {
      live += 1;
      peak = Math.max(peak, live);
      await new Promise((resolve) => setTimeout(resolve, 1));
      live -= 1;
      return value * 2;
    });

    expect(peak).toBe(1);
    expect(result).toEqual([2, 4, 6]);
  });

  it('пустой вход — пустой выход, и ни одного работника', async () => {
    let started = 0;

    expect(
      await mapWithLimit([], 5, () => {
        started += 1;
        return Promise.resolve(1);
      }),
    ).toEqual([]);
    expect(started).toBe(0);
  });

  it('отказ одной работы — отказ веера: план с дыркой не план', async () => {
    await expect(
      mapWithLimit([1, 2, 3], 2, (value) =>
        value === 2 ? Promise.reject(new Error('звено ответило 429')) : Promise.resolve(value),
      ),
    ).rejects.toThrow('429');
  });

  it('умолчание потолка названо константой, а не разбросано по вызовам', () => {
    expect(DEFAULT_INTAKE_CONCURRENCY).toBeGreaterThan(1);
    expect(DEFAULT_INTAKE_CONCURRENCY).toBeLessThanOrEqual(10);
  });
});
