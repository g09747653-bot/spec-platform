import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { Chain } from '../llm/chain.ts';

import {
  describeScope,
  judgeScope,
  narrowScope,
  readScope,
  SCOPE_BUDGET_UNITS,
  SCOPE_FILE,
  scopeExclusions,
  scopePrompt,
  type ScopeEstimate,
} from './scope.ts';

/**
 * Суждение об ОБЪЁМЕ — пара суждению о выполнимости (А-44 п.4).
 *
 * Числа кейсов — замер заказчика, а не выдумка: у NEURA 44 ссылки и ни одной в никуда, у копии — 86
 * и 74 в никуда. Разница не в мастерстве: одна сессия ВЫБИРАЛА СЕБЕ ОБЪЁМ. Стадия существует ради
 * одного различия — сокращение ДО сборки есть выбор, сокращение ПОСЛЕ есть заглушка.
 */

let directory: string;

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'loop-scope-'));
});

afterEach(() => {
  rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
});

const stubChain = (answer: string): Chain => ({
  providers: [],
  generate: () => Promise.resolve({ text: answer, provider: 'google' }),
});

const estimate = (
  title: string,
  units: number,
  necessity: ScopeEstimate['necessity'],
): ScopeEstimate => ({ title, units, necessity, why: 'оценка' });

describe('сужение объёма решает КОД (P1)', () => {
  it('набирает по роду: сперва основное, потом поддерживающее, потом необязательное', () => {
    const narrowed = narrowScope({
      titles: ['Блог', 'Главная', 'Каталог'],
      estimates: [
        estimate('Блог', 10, 'необязательное'),
        estimate('Главная', 10, 'основное'),
        estimate('Каталог', 10, 'поддерживающее'),
      ],
      budgetUnits: 20,
    });

    expect(narrowed.kept.map((item) => item.title)).toEqual(['Главная', 'Каталог']);
    expect(narrowed.cut.map((item) => item.title)).toEqual(['Блог']);
  });

  it('оба списка возвращаются в порядке БРИФА: владелец читает свой бриф, а не нашу сортировку', () => {
    const narrowed = narrowScope({
      titles: ['Блог', 'Главная', 'Каталог', 'Поддержка'],
      estimates: [
        estimate('Блог', 10, 'необязательное'),
        estimate('Главная', 10, 'основное'),
        estimate('Каталог', 10, 'поддерживающее'),
        estimate('Поддержка', 10, 'необязательное'),
      ],
      budgetUnits: 20,
    });

    expect(narrowed.kept.map((item) => item.title)).toEqual(['Главная', 'Каталог']);
    expect(narrowed.cut.map((item) => item.title)).toEqual(['Блог', 'Поддержка']);
  });

  it('пункт РЕЖЕТСЯ, а не ужимается: ужатый пункт и есть заглушка', () => {
    const narrowed = narrowScope({
      titles: ['Главная', 'Каталог'],
      estimates: [estimate('Главная', 30, 'основное'), estimate('Каталог', 30, 'основное')],
      budgetUnits: 44,
    });

    expect(narrowed.kept).toHaveLength(1);
    expect(narrowed.kept[0]?.units).toBe(30);
    expect(narrowed.cut[0]?.units).toBe(30);
  });

  it('бюджет, в который не влезает ничего, означает «делай самое главное», а не «не делай»', () => {
    const narrowed = narrowScope({
      titles: ['Главная'],
      estimates: [estimate('Главная', 500, 'основное')],
      budgetUnits: 10,
    });

    expect(narrowed.kept.map((item) => item.title)).toEqual(['Главная']);
    expect(narrowed.cut).toEqual([]);
  });

  it('неоценённый пункт получает цену по умолчанию — и это названо, а не проглочено', () => {
    const narrowed = narrowScope({
      titles: ['Главная', 'Секретный раздел'],
      estimates: [estimate('главная', 4, 'основное')],
      budgetUnits: 44,
    });

    expect(narrowed.unestimated).toEqual(['Секретный раздел']);
    expect(narrowed.kept).toHaveLength(2);
  });
});

describe('вердикт и алерт', () => {
  const brief = Array.from({ length: 12 }, (_, index) => `Раздел ${String(index + 1)}`);

  const answer = JSON.stringify({
    items: brief.map((title, index) => ({
      title,
      units: 8,
      necessity: index < 3 ? 'основное' : index < 6 ? 'поддерживающее' : 'необязательное',
      why: 'цена доведения до рабочего состояния',
    })),
  });

  it('РЕГРЕССИЯ: бриф на 96 единиц при бюджете 44 сужается ДО сборки, а не добирается декорацией', async () => {
    const outcome = await judgeScope({
      projectDirectory: directory,
      seed: 'Сделай витрину.',
      titles: brief,
      chain: stubChain(answer),
    });

    expect(outcome.status).toBe('judged');
    if (outcome.status !== 'judged') return;

    const { record } = outcome;
    expect(record.verdict).toBe('сужено');
    expect(record.budgetUnits).toBe(SCOPE_BUDGET_UNITS);
    expect(record.plannedUnits).toBe(96);
    expect(record.keptUnits).toBeLessThanOrEqual(SCOPE_BUDGET_UNITS);
    expect(record.kept).toHaveLength(5);
    expect(record.cut).toHaveLength(7);

    /* Сокращение объявлено владельцу словами, а не обнаружится в продукте мёртвой ссылкой. */
    const text = describeScope(record);
    expect(text).toContain('СУЖЕН ДО СБОРКИ');
    expect(text).toContain('Не берусь:');
    expect(text).toContain('Сокращение ДО сборки — это выбор');
  });

  it('вердикт выводит код: модель, сказавшая «всё влезает», ничего не решает', async () => {
    const fits = JSON.stringify({
      items: brief.map((title) => ({
        title,
        units: 1,
        necessity: 'основное',
        why: 'всё влезает, честное слово',
      })),
    });

    const outcome = await judgeScope({
      projectDirectory: directory,
      seed: 'Сделай витрину.',
      titles: brief,
      chain: stubChain(fits),
    });

    if (outcome.status !== 'judged') throw new Error('суждение не состоялось');

    expect(outcome.record.verdict).toBe('полностью');
    expect(describeScope(outcome.record)).toContain('Сокращать нечего');
  });

  it('запрет объёма идёт БЕЗ замены — замена сокращённому пункту и была бы заглушкой', async () => {
    const outcome = await judgeScope({
      projectDirectory: directory,
      seed: 'Сделай витрину.',
      titles: brief,
      chain: stubChain(answer),
    });

    if (outcome.status !== 'judged') throw new Error('суждение не состоялось');

    const lines = scopeExclusions(outcome.record);
    expect(lines).toHaveLength(7);
    expect(lines[0]).toContain('НЕ ДЕЛАТЬ');
    expect(lines[0]).toContain('Ни заглушки, ни декоративной ссылки');
    /* «Вместо этого» — слово суждения о ВЫПОЛНИМОСТИ; у объёма его быть не должно. */
    expect(lines.join('\n')).not.toContain('вместо этого');
  });
});

describe('стадия и её отказы', () => {
  it('идемпотентна по диску: объявленный владельцу объём под ним не меняют', async () => {
    const answer = JSON.stringify({
      items: [{ title: 'Главная', units: 4, necessity: 'основное', why: 'ядро' }],
    });

    let asked = 0;
    const counting: Chain = {
      providers: [],
      generate: () => {
        asked += 1;
        return Promise.resolve({ text: answer, provider: 'google' });
      },
    };

    await judgeScope({
      projectDirectory: directory,
      seed: 'Сделай.',
      titles: ['Главная'],
      chain: counting,
    });
    await judgeScope({
      projectDirectory: directory,
      seed: 'Сделай.',
      titles: ['Главная'],
      chain: counting,
    });

    expect(asked).toBe(1);
    expect(readScope(directory)?.kept).toHaveLength(1);
    expect(readFileSync(join(directory, SCOPE_FILE), 'utf8')).toContain('основное');
  });

  it('каждый отказ назван своим словом, и файл при этом не пишется', async () => {
    const noSeed = await judgeScope({
      projectDirectory: directory,
      seed: null,
      titles: ['Главная'],
      chain: stubChain('{}'),
    });
    expect(noSeed).toMatchObject({ status: 'skipped' });

    const noTitles = await judgeScope({
      projectDirectory: directory,
      seed: 'Сделай.',
      titles: [],
      chain: stubChain('{}'),
    });
    expect(noTitles).toMatchObject({ status: 'skipped' });

    const noChain = await judgeScope({
      projectDirectory: directory,
      seed: 'Сделай.',
      titles: ['Главная'],
      chain: null,
    });
    expect(noChain).toMatchObject({ status: 'skipped' });

    const garbage = await judgeScope({
      projectDirectory: directory,
      seed: 'Сделай.',
      titles: ['Главная'],
      chain: stubChain('я подумаю об этом позже'),
    });
    expect(garbage).toMatchObject({ status: 'skipped' });

    expect(readScope(directory)).toBeNull();
  });

  it('промпт называет единицу так, что декорация в неё не попадает', () => {
    const prompt = scopePrompt('Сделай витрину.', ['Главная', 'Каталог'], 44);

    expect(prompt).toContain('РАБОЧЕГО состояния');
    expect(prompt).toContain('Декоративная ссылка');
    expect(prompt).toContain('единицами НЕ являются');
    /* Решение — не её: модель, которой позволено решать, объявит «всё влезает». */
    expect(prompt).toContain('решаешь НЕ ты');
  });
});
