import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  countRegistryRows,
  findSelfCheckReport,
  readDeviationRecord,
  REGISTRY_SECTIONS,
  SELF_CHECK_RECORD,
  verificationLine,
} from './self-check.ts';

/**
 * Вершинный критерий (А-33 п.4а) и реестр расхождений, у которого род есть ПОЛЕ (А-44 п.3, А-51 п.2).
 *
 * Раздельность — не оформление. Замена по материалу («видео-фонов hero не воспроизвести — материала
 * нет, вместо них статичный кадр») прошла суждение о выполнимости и объявлена ДО сборки; сокращение
 * объёма («74 ссылки оставлены декоративными») — решение исполнителя при наличном материале. Одна
 * колонка на оба рода превращает реестр в место, где недоделанное легализуется задним числом: число
 * 74 читается как «мы не могли», хотя оно означает «мы не стали».
 *
 * А-51 п.2 добавил к этому вторую половину: различение не может быть чтением markdown. Плоский
 * реестр, чей ТИТУЛ содержит слова обоих разделов, прежде давал `{material: 2, scope: 0}` и печатал
 * владельцу «замен по материалу 2, сокращений объёма 0» — то есть выдавал сокращения за замены
 * молча, ровно тем отказом, ради которого разделы заведены.
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

/** Машинная запись к той же прозе: род каждой записи — полем, а не фразой в заголовке. */
const RECORD = {
  entries: [
    { kind: 'материал', what: 'Видео-фоны hero', why: 'материала нет', instead: 'статичный кадр' },
    {
      kind: 'материал',
      what: 'Начертание NVIDIA Sans',
      why: 'лицензия',
      instead: 'Inter той же метрики',
    },
    { kind: 'объём', what: 'Раздел «Драйверы»', why: 'оставлен декоративной ссылкой' },
    { kind: 'объём', what: 'Карточки блога', why: 'три из двенадцати' },
    { kind: 'объём', what: 'Форма подписки', why: 'без отправки' },
  ],
};

/**
 * Реестр старой формы, и он ЗЛОНАМЕРЕННО НЕВИНЕН: титул содержит слова обоих разделов.
 *
 * Ровно этот вход исполнением и уронил прежний счёт: `# Реестр расхождений: замены по материалу и
 * сокращения объёма` — первый же заголовок, и по нему все строки попадали в «материал».
 */
const FLAT = [
  '# Реестр расхождений: замены по материалу и сокращения объёма',
  '',
  '| Раздел | Ширина | Описание | Решение |',
  '|---|---|---|---|',
  '| Главная | 375px | SC-001=34% | named-строка |',
  '| Products | 1440px | SC-002 diff=108px | named-строка |',
].join('\n');

const writeRegistry = (markdown: string, record?: unknown): void => {
  writeFileSync(join(directory, 'DEVIATIONS.md'), markdown, 'utf8');
  if (record !== undefined) {
    writeFileSync(join(directory, SELF_CHECK_RECORD), JSON.stringify(record, null, 2), 'utf8');
  }
};

describe('род расхождения — поле машинной записи, а не фраза заголовка', () => {
  it('считает роды по полю kind, а не по тому, что написано над таблицей', () => {
    expect(readDeviationRecord(join(directory, 'нет.json'))).toEqual({ status: 'absent' });

    writeRegistry(REGISTRY, RECORD);

    expect(readDeviationRecord(join(directory, SELF_CHECK_RECORD))).toEqual({
      status: 'read',
      counts: { material: 2, scope: 3 },
    });
  });

  it('запись не той формы — «не распознана», а не «нулей по родам»', () => {
    writeRegistry(REGISTRY, { entries: [{ kind: 'какой-то свой род', what: 'x', why: 'y' }] });

    expect(readDeviationRecord(join(directory, SELF_CHECK_RECORD))).toMatchObject({
      status: 'unreadable',
    });
  });

  it('битый JSON — тоже «не распознана», и это не то же самое, что её отсутствие', () => {
    writeRegistry(REGISTRY);
    writeFileSync(join(directory, SELF_CHECK_RECORD), '{ битый', 'utf8');

    expect(readDeviationRecord(join(directory, SELF_CHECK_RECORD))).toMatchObject({
      status: 'unreadable',
    });
  });
});

describe('счёт строк прозы — только для нераспознанной формы и только приблизительный', () => {
  it('считает строки данных, не считая шапок и разделителей', () => {
    expect(countRegistryRows(REGISTRY)).toBe(5);
  });

  it('файл без таблиц — ноль, а не мусорное число', () => {
    expect(countRegistryRows('# Отчёт\n\nПросто текст без таблиц.')).toBe(0);
  });
});

describe('поиск отчёта самопроверки', () => {
  it('находит DEVIATIONS.md в корне рабочей директории и меряет его', () => {
    writeRegistry(REGISTRY, RECORD);

    const report = findSelfCheckReport(directory);
    expect(report).not.toBeNull();
    expect(report?.relativePath).toBe('DEVIATIONS.md');
    expect(report?.form).toMatchObject({ kind: 'filed', counts: { material: 2, scope: 3 } });
  });

  it('находит отчёт на уровень глубже, но не заглядывает в служебные деревья', () => {
    mkdirSync(join(directory, 'docs'), { recursive: true });
    writeFileSync(join(directory, 'docs', 'DEVIATIONS.md'), REGISTRY, 'utf8');
    /* Отчёт в node_modules — чужой; найтись обязан наш. */
    mkdirSync(join(directory, 'node_modules', 'x'), { recursive: true });
    writeFileSync(join(directory, 'node_modules', 'x', 'DEVIATIONS.md'), '| a |\n', 'utf8');

    expect(findSelfCheckReport(directory)?.relativePath).toBe('docs/DEVIATIONS.md');
  });

  it('машинная запись ищется РЯДОМ с прозой, а не только в корне', () => {
    mkdirSync(join(directory, 'docs'), { recursive: true });
    writeFileSync(join(directory, 'docs', 'DEVIATIONS.md'), REGISTRY, 'utf8');
    writeFileSync(join(directory, 'docs', SELF_CHECK_RECORD), JSON.stringify(RECORD), 'utf8');

    expect(findSelfCheckReport(directory)?.form).toMatchObject({ kind: 'filed' });
  });

  it('отчёта нет — null, и это форма «план самопроверку не снимал»', () => {
    expect(findSelfCheckReport(directory)).toBeNull();
  });
});

describe('строка сверки — три формы, все явные (А-33 п.4а, А-51 п.2)', () => {
  it('РЕГРЕССИЯ: числа двух родов называются раздельно, а не одной суммой', () => {
    writeRegistry(REGISTRY, RECORD);

    const line = verificationLine(findSelfCheckReport(directory));
    expect(line).toContain('план снимал самопроверку');
    expect(line).toContain('замен по материалу 2');
    expect(line).toContain('сокращений объёма 3');
    /* Суммы нет нигде: «расхождений 5» — ровно та строка, которая легализует недоделанное. */
    expect(line).not.toContain('расхождений: 5');
    expect(line).toContain('DEVIATIONS.md');
  });

  it('РЕГРЕССИЯ (А-51 п.2): плоский реестр с титулом обоих разделов НЕ выдаётся за раздельный', () => {
    writeRegistry(FLAT);

    const line = verificationLine(findSelfCheckReport(directory));

    /*
     * Прежний счёт на этом самом входе печатал «замен по материалу 2, сокращений объёма 0» и ни
     * слова о форме. Теперь чисел по родам нет вовсе, а форма названа вслух: приблизительный род
     * читается как точный, и это хуже отсутствующего.
     */
    expect(line).toContain('ФОРМА РЕЕСТРА НЕ РАСПОЗНАНА');
    expect(line).toContain('машинной записи реестра');
    expect(line).not.toContain('замен по материалу');
    expect(line).not.toContain('сокращений объёма 0');
    expect(line).toContain('примерно 2');
  });

  it('РЕГРЕССИЯ (А-51 п.2): перифраз заголовка больше ничего не решает', () => {
    /* «Замена по материалу» вместо «Замены по материалу» прежде уводило записи «вне разделов». */
    const paraphrased = REGISTRY.replace('Замены по материалу', 'Замена по материалу').replace(
      'Сокращения объёма',
      'Сокращение объёма',
    );
    writeRegistry(paraphrased, RECORD);

    expect(verificationLine(findSelfCheckReport(directory))).toContain('замен по материалу 2');
  });

  it('РЕГРЕССИЯ (А-51 п.2): подзаголовок внутри раздела больше ничего не сбрасывает', () => {
    const withSubheading = REGISTRY.replace(
      '| Видео-фоны hero | материал | статичный кадр той же композиции |',
      '### Подробности\n\n| Видео-фоны hero | материал | статичный кадр той же композиции |',
    );
    writeRegistry(withSubheading, RECORD);

    expect(verificationLine(findSelfCheckReport(directory))).toContain('сокращений объёма 3');
  });

  it('без отчёта: сверка не снималась — сказано словом, не отсутствием слова', () => {
    const line = verificationLine(null);
    expect(line).toContain('отчёта расхождений');
    expect(line).toContain('план самопроверку не снимал');
  });
});
