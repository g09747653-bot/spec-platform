import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  countRegistryEntries,
  findSelfCheckReport,
  REGISTRY_SECTIONS,
  verificationLine,
} from './self-check.ts';

/**
 * Вершинный критерий (А-33 п.4а) и реестр расхождений в ДВУХ разделах (А-44 п.3).
 *
 * Раздельность — не оформление. Замена по материалу («видео-фонов hero не воспроизвести — материала
 * нет, вместо них статичный кадр») прошла суждение о выполнимости и объявлена ДО сборки; сокращение
 * объёма («74 ссылки оставлены декоративными») — решение исполнителя при наличном материале. Одна
 * колонка на оба рода превращает реестр в место, где недоделанное легализуется задним числом: число
 * 74 читается как «мы не могли», хотя оно означает «мы не стали».
 */

let directory: string;

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'loop-selfcheck-'));
});

afterEach(() => {
  rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
});

const REGISTRY = [
  '# Реестр расхождений',
  '',
  'Преамбула о том, как читать файл.',
  '',
  `## I. ${REGISTRY_SECTIONS.material}`,
  '',
  '| Что | Причина | Взамен |',
  '|---|---|---|',
  '| Видео-фоны hero | материал | статичный кадр той же композиции |',
  '| Начертание NVIDIA Sans | лицензия | Inter той же метрики |',
  '',
  `## II. ${REGISTRY_SECTIONS.scope} (решение исполнителя)`,
  '',
  '| Что | Почему не доведено |',
  '|---|---|',
  '| Раздел «Драйверы» | оставлен декоративной ссылкой |',
  '| Карточки блога | три из двенадцати |',
  '| Форма подписки | без отправки |',
].join('\n');

/** Реестр старой формы — одной кучей, без разделов. Ровно то, что писали до этой правки. */
const FLAT = [
  '# Реестр расхождений',
  '',
  '| Раздел | Ширина | Описание | Решение |',
  '|---|---|---|---|',
  '| Главная | 375px | SC-001=34% | named-строка |',
  '| Products | 1440px | SC-002 diff=108px | named-строка |',
].join('\n');

describe('счёт записей реестра по разделам', () => {
  it('считает строки данных РАЗДЕЛЬНО, не считая шапок и разделителей', () => {
    expect(countRegistryEntries(REGISTRY)).toEqual({ material: 2, scope: 3, unfiled: 0 });
  });

  it('файл без таблиц — нули по всем разделам, не мусорное число', () => {
    expect(countRegistryEntries('# Отчёт\n\nПросто текст без таблиц.')).toEqual({
      material: 0,
      scope: 0,
      unfiled: 0,
    });
  });

  it('РЕГРЕССИЯ: реестр без разделов не приписывается к первому — он «вне разделов»', () => {
    expect(countRegistryEntries(FLAT)).toEqual({ material: 0, scope: 0, unfiled: 2 });
  });

  it('заголовок раздела узнаётся по имени, а не по точному совпадению строки', () => {
    const decorated = [
      `### I. ${REGISTRY_SECTIONS.material} — прошли суждение о выполнимости`,
      '| Что | Причина | Взамен |',
      '|---|---|---|',
      '| Видео | материал | кадр |',
    ].join('\n');

    expect(countRegistryEntries(decorated).material).toBe(1);
  });
});

describe('поиск отчёта самопроверки', () => {
  it('находит DEVIATIONS.md в корне рабочей директории и меряет его', () => {
    writeFileSync(join(directory, 'DEVIATIONS.md'), REGISTRY, 'utf8');

    const report = findSelfCheckReport(directory);
    expect(report).not.toBeNull();
    expect(report?.relativePath).toBe('DEVIATIONS.md');
    expect(report?.entries).toEqual({ material: 2, scope: 3, unfiled: 0 });
  });

  it('находит отчёт на уровень глубже, но не заглядывает в служебные деревья', () => {
    mkdirSync(join(directory, 'docs'), { recursive: true });
    writeFileSync(join(directory, 'docs', 'DEVIATIONS.md'), REGISTRY, 'utf8');
    /* Отчёт в node_modules — чужой; найтись обязан наш. */
    mkdirSync(join(directory, 'node_modules', 'x'), { recursive: true });
    writeFileSync(join(directory, 'node_modules', 'x', 'DEVIATIONS.md'), '| a |\n', 'utf8');

    expect(findSelfCheckReport(directory)?.relativePath).toBe('docs/DEVIATIONS.md');
  });

  it('отчёта нет — null, и это форма «план самопроверку не снимал»', () => {
    expect(findSelfCheckReport(directory)).toBeNull();
  });
});

describe('строка сверки — две формы, обе явные (А-33 п.4а)', () => {
  it('РЕГРЕССИЯ: числа двух родов называются раздельно, а не одной суммой', () => {
    writeFileSync(join(directory, 'DEVIATIONS.md'), REGISTRY, 'utf8');

    const line = verificationLine(findSelfCheckReport(directory));
    expect(line).toContain('план снимал самопроверку');
    expect(line).toContain('замен по материалу 2');
    expect(line).toContain('сокращений объёма 3');
    /* Суммы нет нигде: «расхождений 5» — ровно та строка, которая легализует недоделанное. */
    expect(line).not.toContain('расхождений: 5');
    expect(line).toContain('DEVIATIONS.md');
  });

  it('реестр старой формы называется старым, а не выдаётся за раздельный', () => {
    writeFileSync(join(directory, 'DEVIATIONS.md'), FLAT, 'utf8');

    const line = verificationLine(findSelfCheckReport(directory));
    expect(line).toContain('записей вне разделов 2');
    expect(line).toContain('род расхождения по ним не назван');
  });

  it('без отчёта: сверка не снималась — сказано словом, не отсутствием слова', () => {
    const line = verificationLine(null);
    expect(line).toContain('отчёта расхождений');
    expect(line).toContain('план самопроверку не снимал');
  });
});
