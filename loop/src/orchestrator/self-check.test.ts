import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { countRegistryEntries, findSelfCheckReport, verificationLine } from './self-check.ts';

/**
 * Вершинный критерий (А-33 п.4а): сверка финального сообщения с задумкой. Тестируются обе формы —
 * с отчётом самопроверки и без — и арифметика счёта записей, на которой сверка стоит.
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
  '| Раздел | Ширина | Описание | Решение |',
  '|---|---|---|---|',
  '| Главная | 375px | SC-001=34% | named-строка |',
  '| Главная | 768px | SC-001=41% | named-строка |',
  '| Products | 1440px | SC-002 diff=108px | named-строка |',
  '',
  '## Вторая таблица',
  '',
  '| Задача | Статус |',
  '|---|---|',
  '| T037 | зафиксировано |',
].join('\n');

describe('счёт записей реестра', () => {
  it('считает строки данных всех таблиц, не считая шапок и разделителей', () => {
    expect(countRegistryEntries(REGISTRY)).toBe(4);
  });

  it('файл без таблиц — ноль записей, не мусорное число', () => {
    expect(countRegistryEntries('# Отчёт\n\nПросто текст без таблиц.')).toBe(0);
  });
});

describe('поиск отчёта самопроверки', () => {
  it('находит DEVIATIONS.md в корне рабочей директории и меряет его', () => {
    writeFileSync(join(directory, 'DEVIATIONS.md'), REGISTRY, 'utf8');

    const report = findSelfCheckReport(directory);
    expect(report).not.toBeNull();
    expect(report?.relativePath).toBe('DEVIATIONS.md');
    expect(report?.entries).toBe(4);
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
  it('с отчётом: замер, путь и размер — не голая галочка', () => {
    writeFileSync(join(directory, 'DEVIATIONS.md'), REGISTRY, 'utf8');

    const line = verificationLine(findSelfCheckReport(directory));
    expect(line).toContain('план снимал самопроверку');
    expect(line).toContain('расхождений: 4');
    expect(line).toContain('DEVIATIONS.md');
  });

  it('без отчёта: сверка не снималась — сказано словом, не отсутствием слова', () => {
    const line = verificationLine(null);
    expect(line).toContain('отчёта расхождений');
    expect(line).toContain('план самопроверку не снимал');
  });
});
