import { describe, expect, it } from 'vitest';

import { PROBE_RESULT } from './product-probe.ts';
import { extractProbePayload, probeContainerName, qualityLine } from './quality-stage.ts';
import { assembleBoard, judgeOperability, type OperabilityVerdict } from './visual-judge.ts';

/**
 * Вершинная строка суда качества — четыре исхода, и она обязана назвать случившийся (А-51 п.4).
 *
 * **Что было сломано.** Исходов у суда было два имени на три случая: `orchestrator.ts` зашивал «но
 * суд качества красный» в ОБЕ незелёные ветки, а состояние проекта, поле `green` и заголовок алерта
 * были у них тождественны. Значит несостоявшийся суд объявлялся владельцу красным судом — неправда
 * о продукте в единственном месте, которое владелец читает.
 *
 * **Вердикт §10.1 добавил четвёртый исход.** «Не судимо судом» — законный результат по образцу «не
 * проверяемо приёмкой»: решает КОД по механическому признаку (есть ли запускаемая точка входа с
 * интерфейсом), исход считается долгом, счётчик публикуется. Модель не вправе объявить свой продукт
 * несудимым — её об этом не спрашивают.
 *
 * Ни один случай ниже не требует Docker: все четыре — чистые функции над готовым исходом.
 */

const OPERABLE: OperabilityVerdict = judgeOperability({
  total: 1,
  probes: [
    {
      label: 'Каталог',
      tag: 'a',
      href: '/catalog.html',
      inChrome: true,
      hoverChanged: true,
      clicked: true,
      navigated: true,
      changed: true,
      revealedText: '',
      overlapPairs: 0,
      emptyPanel: false,
      stuckOpen: false,
      alert: '',
      error: null,
    },
  ],
  pageText: 'Каталог',
  sources: [],
  notes: [],
});

const board = (green: boolean) =>
  assembleBoard({
    coherence: {
      status: 'judged',
      verdict: green ? 'coherent' : 'broken',
      findings: green ? [] : ['кадр 2'],
      judgedBy: 'google',
    },
    liveness: { verdict: 'alive', findings: [] },
    evidence: { probes: [{ kind: 'motion', name: 'сама', moved: true, detail: '' }], signals: [] },
    entry: { verdict: 'single-entry', entry: 'index.html', findings: [], unreachable: [] },
    operability: OPERABLE,
  });

describe('вершинная строка суда качества', () => {
  it('суд не проводился — не «завершён», и сказано почему', () => {
    const line = qualityLine(null);

    expect(line).toMatchObject({ complete: false, kind: 'not-held' });
    expect(line.text).toContain('не проводился');
  });

  it('РЕГРЕССИЯ (А-51 п.4): «суд НЕ СОСТОЯЛСЯ» и «суд КРАСНЫЙ» — разные исходы, разными словами', () => {
    const notHeld = qualityLine({ status: 'skipped', reason: 'суду нечем открыть продукт' });
    const red = qualityLine({
      status: 'judged',
      board: board(false),
      text: 'доска',
      entry: 'index.html',
    });

    expect(notHeld.kind).toBe('not-held');
    expect(red.kind).toBe('red');

    /* Оба не дают «завершён» — но по разным причинам, и причина обязана доехать до владельца. */
    expect(notHeld.complete).toBe(false);
    expect(red.complete).toBe(false);
    expect(notHeld.kind).not.toBe(red.kind);
    expect(notHeld.text).toContain('НЕ СОСТОЯЛСЯ');
    expect(notHeld.text).toContain('суду нечем открыть продукт');
  });

  it('РЕГРЕССИЯ (§10.1): «не судимо судом» — законный исход, ДОЛГ, а не красное и не зелёное', () => {
    const line = qualityLine({
      status: 'unjudgeable',
      reason: 'в рабочей директории нет ни одной страницы — открывать нечего',
    });

    expect(line.kind).toBe('unjudgeable');
    /* Долг завершению не мешает — по образцу «не проверяемо приёмкой», которое задачу не блокировало. */
    expect(line.complete).toBe(true);
    expect(line.text).toContain('НЕ СУДИЛ');
    expect(line.text).toContain('ДОЛГОМ');
    /* И «продукт хорош» отсюда не следует — это сказано вслух, а не оставлено читателю. */
    expect(line.text).toContain('«продукт хорош» отсюда не следует');
  });

  it('зелёная доска — «завершён», красная — нет', () => {
    expect(
      qualityLine({ status: 'judged', board: board(true), text: 'доска', entry: 'i.html' }),
    ).toMatchObject({
      complete: true,
      kind: 'green',
    });
    expect(
      qualityLine({ status: 'judged', board: board(false), text: 'доска', entry: 'i.html' }),
    ).toMatchObject({
      complete: false,
      kind: 'red',
    });
  });
});

describe('улики пробы: разбор вывода контейнера', () => {
  it('отказ пробы с механическим признаком читается как «не судимо», а не как «не состоялся»', () => {
    const refusal = JSON.stringify({
      ok: false,
      unjudgeable: true,
      reason: 'открывать нечего',
    });

    expect(extractProbePayload(`шум\n${PROBE_RESULT}\n${refusal}`)).toEqual({
      ok: false,
      unjudgeable: true,
      reason: 'открывать нечего',
    });
  });

  it('вывод без маркера — не улики, и притворяться ими не должен', () => {
    expect(extractProbePayload('просто лог контейнера')).toBeNull();
  });

  it('имя пробы несёт проект — суд одного проекта не убивает пробу другого', () => {
    expect(probeContainerName('proj_1')).toBe('quality-probe-proj_1');
    expect(probeContainerName()).toBe('quality-probe');
  });
});
