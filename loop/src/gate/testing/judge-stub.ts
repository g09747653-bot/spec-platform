import type { StartOutcome } from '../../docker/testing/fake-engine.ts';
import type { Chain } from '../../llm/chain.ts';
import { PROBE_RESULT } from '../product-probe.ts';

/**
 * Зелёный суд качества для стабов, чьи кейсы — не о суде (А-44 п.2).
 *
 * Суд стал СТАДИЕЙ, и «проект завершён» теперь произносится только по зелёной доске. Поэтому любой
 * кейс, доводящий конвейер до конца, обязан чем-то ответить на пробу продукта — иначе он проверяет
 * не то, о чём написан, а отсутствие браузера в фейковом демоне.
 *
 * Помощник отвечает ровно тем, что делает доску зелёной и не более: один вход, один работающий
 * элемент, три сдвинувшиеся проверки живости, ни одного самообъявления. Кейсы самого суда этим
 * помощником не пользуются — они диктуют улики сами (`visual-judge.test.ts`,
 * `quality-stage.integration.test.ts`).
 */

const GREEN = {
  ok: true,
  entry: {
    files: ['index.html', 'package.json'],
    hrefs: { 'index.html': [] },
    packageJson: '{"scripts":{"start":"node server.js"}}',
  },
  entryUsed: 'index.html',
  shots: [{ label: 'рабочий стол 1440, экран 1 из 4', mediaType: 'image/jpeg', base64: 'AAAA' }],
  liveness: [
    { kind: 'hover', name: 'наведение', moved: true, detail: 'состояние изменили 3' },
    { kind: 'reveal', name: 'прокрутка', moved: true, detail: 'блоков стало больше' },
    { kind: 'motion', name: 'сама по себе', moved: true, detail: 'слайдер сдвинулся' },
  ],
  operability: {
    total: 1,
    elements: [
      {
        label: 'Продукты',
        tag: 'a',
        href: '/products.html',
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
    pageText: 'Главная страница витрины',
    notes: [],
  },
  sources: [{ file: 'styles.css', signals: ['CSS-переходы (transition)'], text: '.a{}' }],
};

/** Ответ пробы продукта, или `null` — контейнер не пробный, пусть кейс решает сам. */
export function probeStubOutcome(name: string): StartOutcome | null {
  if (name !== 'quality-probe') return null;

  return { exitCode: 0, stdout: [PROBE_RESULT, JSON.stringify(GREEN)] };
}

/** Звено с «глазами», отвечающее «связно». Отдельная роль — судья, а не архитектор. */
export function coherentJudgeChain(verdict = '{"verdict":"coherent","findings":[]}'): Chain {
  return {
    providers: [],
    generate: () => Promise.resolve({ text: verdict, provider: 'google' }),
  };
}
