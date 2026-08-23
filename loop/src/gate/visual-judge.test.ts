import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { createChain } from '../llm/chain.ts';
import { NoVisionProviderError } from '../llm/types.ts';
import type { Chain } from '../llm/chain.ts';
import type { LlmImage } from '../llm/types.ts';

import type { EntryVerdict } from './entry-point.ts';
import {
  LIVENESS_KINDS,
  assembleBoard,
  coherencePrompt,
  judgeLiveness,
  loadShots,
  renderQualityBoard,
  reviewCoherence,
  scanMotionSignals,
  type CoherenceOutcome,
  type LivenessProbe,
  type Shot,
} from './visual-judge.ts';

/**
 * Суд качества с глазами (А-35 п.2б; А-35.1 п.2). Модель — стаб, как всюду в CI; живой вердикт
 * этого же тракта снят google-звеном на кадрах ОТКЛОНЁННОГО продукта и лежит фикстурой — регрессия
 * внизу гоняет его дословно на случае, который правку и породил.
 */

const stubChain = (answer: string): Chain => ({
  providers: [],
  generate: () => Promise.resolve({ text: answer, provider: 'google' }),
});

const SHOTS: Shot[] = [
  { label: 'кадр 1 — главная, 1440, первый экран', path: 'index-0.png' },
  { label: 'кадр 2 — главная, 1440, прокрутка 2700', path: 'index-2700.png' },
];

const IMAGES: LlmImage[] = SHOTS.map((shot) => ({
  mediaType: 'image/png',
  data: 'AAAA',
  label: shot.label,
}));

const probe = (
  kind: (typeof LIVENESS_KINDS)[number],
  moved: boolean,
  name = kind,
): LivenessProbe => ({
  kind,
  name,
  moved,
  detail: moved ? 'значение изменилось' : 'без изменений',
});

const ALIVE: LivenessProbe[] = LIVENESS_KINDS.map((kind) => probe(kind, true));

const entryOk: EntryVerdict = {
  verdict: 'single-entry',
  entry: 'npm start',
  findings: [],
  unreachable: [],
};

describe('ось связности — глаза', () => {
  it('промпт несёт задумку, подписи всех кадров и обе формы ответа', () => {
    const prompt = coherencePrompt('Сайт — копия nvidia.com.', SHOTS);

    expect(prompt).toContain('Сайт — копия nvidia.com.');
    for (const shot of SHOTS) expect(prompt).toContain(shot.label);
    expect(prompt).toContain('"verdict":"coherent"');
    expect(prompt).toContain('"verdict":"broken"');
  });

  it('разбирает связный вердикт и называет судью', async () => {
    const outcome = await reviewCoherence({
      seed: '…',
      shots: SHOTS,
      images: IMAGES,
      chain: stubChain('{"verdict":"coherent","findings":[]}'),
    });

    expect(outcome).toEqual({
      status: 'judged',
      verdict: 'coherent',
      findings: [],
      judgedBy: 'google',
    });
  });

  it('пустые findings при «съехало» вердиктом не считаются', async () => {
    const outcome = await reviewCoherence({
      seed: '…',
      shots: SHOTS,
      images: IMAGES,
      chain: stubChain('{"verdict":"broken","findings":[]}'),
    });

    expect(outcome.status).toBe('skipped');
  });

  it('обрезанный ответ модели — named-отказ, а не зелёный вердикт', async () => {
    const truncated = '{"verdict":"broken","findings":["кадр 1: кнопки разной высоты и не выр';
    const outcome = await reviewCoherence({
      seed: '…',
      shots: SHOTS,
      images: IMAGES,
      chain: stubChain(truncated),
    });

    expect(outcome.status).toBe('skipped');
    if (outcome.status !== 'skipped') return;
    expect(outcome.reason).toContain('не разобран');
  });

  it('без кадров суд не состоялся и это сказано', async () => {
    const outcome = await reviewCoherence({
      seed: '…',
      shots: [],
      images: [],
      chain: stubChain('{"verdict":"coherent"}'),
    });

    expect(outcome).toEqual({ status: 'skipped', reason: 'кадров для суда не снято' });
  });

  it('не картинка — отказ на входе, а не байты неизвестной формы модели', () => {
    expect(() => loadShots([{ label: 'кадр', path: 'report.txt' }])).toThrow('не картинка');
  });
});

describe('цепочка отбирает звенья по способности видеть', () => {
  it('запрос с картинками к текстовому звену — named-отказ, а не молчаливая потеря кадров', async () => {
    /* Мост подписки: зонд 2026-08-23 намерил `{"seen":false}` — картинку он не донесёт. */
    const chain = createChain({ order: ['claude-cli'], claudeCliApiBase: 'http://127.0.0.1:9/v1' });

    expect(chain.providers).toHaveLength(1);
    expect(chain.providers[0]?.supportsImages).toBe(false);

    await expect(chain.generate({ prompt: 'посмотри', images: IMAGES })).rejects.toBeInstanceOf(
      NoVisionProviderError,
    );
  });

  it('тот же чейн без картинок работает как прежде', () => {
    const chain = createChain({ order: ['claude-cli'], claudeCliApiBase: 'http://127.0.0.1:9/v1' });
    /* Звено доступно — отбор по глазам включается только для запроса с кадрами. */
    expect(chain.providers.map((provider) => provider.id)).toEqual(['claude-cli']);
  });

  it('google объявляет глаза — зонд 2026-08-23 ответил на картинку по существу', () => {
    const chain = createChain({ order: ['google'], googleApiKey: 'x' });
    expect(chain.providers[0]?.supportsImages).toBe(true);
  });
});

describe('ось живости — судится, а не предполагается', () => {
  it('все три вида доказаны — живой', () => {
    expect(judgeLiveness({ probes: ALIVE, signals: ['CSS-переходы (transition)'] })).toEqual({
      verdict: 'alive',
      findings: [],
    });
  });

  it('непроверенный вид — статичный, и сказано, что его не проверяли', () => {
    const verdict = judgeLiveness({
      probes: [probe('hover', true), probe('reveal', true)],
      signals: [],
    });

    expect(verdict.verdict).toBe('static');
    expect(verdict.findings).toHaveLength(1);
    expect(verdict.findings[0]).toContain('собственное движение');
    expect(verdict.findings[0]).toContain('не проверялось');
  });

  it('признаки в коде без единого сдвига читаются как «написана и не работает»', () => {
    const verdict = judgeLiveness({
      probes: LIVENESS_KINDS.map((kind) => probe(kind, false)),
      signals: ['CSS-анимации (@keyframes)', 'состояния наведения (:hover)'],
    });

    expect(verdict.verdict).toBe('static');
    expect(verdict.findings.at(-1)).toContain('написана и не работает');
  });

  it('признаки движения ищутся в исходниках и не выдумываются', () => {
    const found = scanMotionSignals([
      { file: 'styles.css', text: '.card { transition: transform .3s ease; }' },
      { file: 'app.js', text: 'new IntersectionObserver(() => {});' },
    ]);

    expect(found).toContain('CSS-переходы (transition)');
    expect(found).toContain('появление по видимости (IntersectionObserver)');
    expect(found).not.toContain('CSS-анимации (@keyframes)');
    expect(scanMotionSignals([{ file: 'a.css', text: 'body { color: red; }' }])).toEqual([]);
  });
});

describe('доска — то, что читает заказчик', () => {
  const coherent: CoherenceOutcome = {
    status: 'judged',
    verdict: 'coherent',
    findings: [],
    judgedBy: 'google',
  };

  it('зелено только когда зелены все три оси', () => {
    const green = assembleBoard({
      coherence: coherent,
      liveness: { verdict: 'alive', findings: [] },
      evidence: { probes: ALIVE, signals: [] },
      entry: entryOk,
    });
    expect(green.green).toBe(true);

    const scattered = assembleBoard({
      coherence: coherent,
      liveness: { verdict: 'alive', findings: [] },
      evidence: { probes: ALIVE, signals: [] },
      entry: { verdict: 'scattered', entry: null, findings: ['страница-сирота'], unreachable: [] },
    });
    expect(scattered.green).toBe(false);
  });

  it('несостоявшийся суд зелёным не бывает', () => {
    const board = assembleBoard({
      coherence: { status: 'skipped', reason: 'звено с глазами не ответило: 429' },
      liveness: { verdict: 'alive', findings: [] },
      evidence: { probes: ALIVE, signals: [] },
      entry: entryOk,
    });

    expect(board.green).toBe(false);
    expect(renderQualityBoard(board)).toContain('НЕ СУДИЛАСЬ');
  });

  it('текст доски называет каждую ось и итог', () => {
    const board = assembleBoard({
      coherence: {
        status: 'judged',
        verdict: 'broken',
        findings: ['кадр 2: заголовок прижат влево'],
        judgedBy: 'google',
      },
      liveness: judgeLiveness({ probes: [probe('hover', false)], signals: [] }),
      evidence: { probes: [probe('hover', false)], signals: [] },
      entry: entryOk,
    });

    const text = renderQualityBoard(board);
    expect(text).toContain('1. Связность — СЪЕХАЛО (смотрел google)');
    expect(text).toContain('кадр 2: заголовок прижат влево');
    expect(text).toContain('2. Живость — СТАТИЧНЫЙ (0 из 1 проверок сдвинулись)');
    expect(text).toContain('3. Вход — один: npm start');
    expect(text).toContain('Итог: НЕ ПРИНЯТО');
  });
});

describe('регрессия на кадрах отклонённого продукта (А-35)', () => {
  /**
   * Вердикт — ЖИВОЙ ответ google-звена на два кадра продукта, который заказчик отклонил словами
   * «кнопки расходятся, дизайн съезжает»; снят 2026-08-23 тем же промптом и разобран тем же кодом.
   * Суд обязан увидеть то, что увидели его глаза, и назвать место.
   */
  const liveVerdict = readFileSync(
    join(
      import.meta.dirname,
      '..',
      '..',
      'fixtures',
      'visual-judge',
      'rejected-product-verdict.txt',
    ),
    'utf8',
  );

  it('живой вердикт — «съехало», с названным местом, и доска краснеет', async () => {
    const outcome = await reviewCoherence({
      seed: 'Сделай сайт — полную графическую копию nvidia.com.',
      shots: SHOTS,
      images: IMAGES,
      chain: stubChain(liveVerdict),
    });

    expect(outcome.status).toBe('judged');
    if (outcome.status !== 'judged') return;

    expect(outcome.verdict).toBe('broken');
    expect(outcome.findings.length).toBeGreaterThan(0);
    /* Жалоба заказчика дословно: секция прижата к краю с пустым полем напротив. */
    expect(outcome.findings.join('\n')).toMatch(/прижат|выравнив|сетк/i);

    const board = assembleBoard({
      coherence: outcome,
      liveness: { verdict: 'alive', findings: [] },
      evidence: { probes: ALIVE, signals: [] },
      entry: entryOk,
    });
    expect(board.green).toBe(false);
  });
});
