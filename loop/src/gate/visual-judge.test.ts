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
  anchorFragment,
  assembleBoard,
  classifyProbe,
  coherencePrompt,
  judgeLiveness,
  judgeOperability,
  loadShots,
  renderQualityBoard,
  reviewCoherence,
  scanMotionSignals,
  stubPhraseIn,
  type CoherenceOutcome,
  type InteractiveProbe,
  type LivenessProbe,
  type OperabilityVerdict,
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

/* ─────────────────────────── ось IV: работоспособность ─────────────────────────── */

/** Улика по умолчанию — «навели, нажали, ничего страшного не случилось». */
const element = (over: Partial<InteractiveProbe> = {}): InteractiveProbe => ({
  label: 'Products',
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
  ...over,
});

const OPERABLE: OperabilityVerdict = judgeOperability({
  total: 1,
  probes: [element()],
  pageText: 'Главная страница',
  sources: [],
  notes: [],
});

/**
 * Работоспособность — четвёртая ось (А-44 п.2).
 *
 * Три улики ниже взяты с продукта дословно: 74 из 86 ссылок главной ведут `href="#"`,
 * `decorative-stubs.js` показывает тост «Демо-версия, функция недоступна», раскрытое мега-меню
 * «Products» налезает текстом само на себя. Ни одну из трёх кадр не показывает — кадр это первый
 * экран в покое, — и ровно поэтому ось судит ДЕЙСТВИЕМ, а не видом.
 */
describe('четвёртая ось: продуктом пользуются, а не смотрят на него', () => {
  it('РЕГРЕССИЯ: ссылка в никуда — инертна, законна и ПОСЧИТАНА', () => {
    const dead = element({ href: '#', navigated: false, changed: false, hoverChanged: false });

    expect(classifyProbe(dead).outcome).toBe('inert');

    const verdict = judgeOperability({
      total: 86,
      probes: [
        ...Array.from({ length: 74 }, () => dead),
        ...Array.from({ length: 12 }, () => element()),
      ],
      pageText: '',
      sources: [],
      notes: [],
    });

    /* Инертное красноты не даёт: оно даёт число — то самое, которого не увидел ни один суд. */
    expect(verdict.verdict).toBe('operable');
    expect(verdict.counts.inert).toBe(74);
    expect(verdict.counts.working).toBe(12);
    expect(verdict.total).toBe(86);
  });

  it('РЕГРЕССИЯ: самообъявленная заглушка — красное безусловно, без порогов', () => {
    const toast = element({
      label: 'Купить',
      href: '#',
      navigated: false,
      alert: 'Демо-версия, функция недоступна',
    });

    expect(classifyProbe(toast).outcome).toBe('stub');

    const verdict = judgeOperability({
      total: 1,
      probes: [toast],
      pageText: '',
      sources: [],
      notes: [],
    });

    expect(verdict.verdict).toBe('broken');
    expect(verdict.findings.join('\n')).toContain('Заглушка объявлена интерфейсом');
  });

  it('РЕГРЕССИЯ: заглушка в исходнике краснеет, даже если клик до неё не дошёл', () => {
    const verdict = judgeOperability({
      total: 1,
      probes: [element()],
      pageText: '',
      sources: [
        {
          file: 'src/scripts/decorative-stubs.js',
          text: 'toast("Демо-версия, функция недоступна");',
        },
      ],
      notes: [],
    });

    expect(verdict.verdict).toBe('broken');
    expect(verdict.findings.join('\n')).toContain('decorative-stubs.js');
    /* Продукт не разговаривает с пользователем о своей незавершённости — файл удаляют. */
    expect(verdict.findings.join('\n')).toContain('удаляется, а не переписывается');
  });

  it('РЕГРЕССИЯ: раскрытое мега-меню, налезающее само на себя, — сломанное', () => {
    const menu = element({
      label: 'Products',
      href: '#',
      navigated: false,
      changed: true,
      overlapPairs: 3,
      revealedText: 'GeForce Studio Data Center',
    });

    expect(classifyProbe(menu)).toMatchObject({ outcome: 'broken' });
    expect(classifyProbe(menu).why).toContain('налезает');
  });

  it('пустая панель и незакрывающийся слой — тоже испорченный результат', () => {
    expect(classifyProbe(element({ navigated: false, emptyPanel: true })).outcome).toBe('broken');
    expect(classifyProbe(element({ navigated: false, stuckOpen: true })).outcome).toBe('broken');
    expect(classifyProbe(element({ navigated: false, error: 'element is covered' })).outcome).toBe(
      'broken',
    );
  });

  it('самообъявление ищется закрытым перечнем, а не «похоже на заглушку»', () => {
    expect(stubPhraseIn('Скоро будет доступно')).toBe('скоро будет');
    expect(stubPhraseIn('Coming Soon')).toBe('coming soon');
    expect(stubPhraseIn('Купить сейчас')).toBeNull();
  });

  it('РЕГРЕССИЯ (А-51 п.5-VII): перечень ловит РЕПЛИКИ ПОЛЬЗОВАТЕЛЮ, а не пометки разработчика', () => {
    /*
     * Три изъятые фразы, каждая — промышленный ложный срабат: `placeholder` есть у любой честной
     * формы на свете, `lorem ipsum` законна на макете, `todo:` живёт в комментарии, которого
     * пользователь не видит. Ни одна не обращена к пользователю, а каждая краснила ось безусловно.
     */
    expect(stubPhraseIn('<input placeholder="Ваше имя">')).toBeNull();
    expect(stubPhraseIn('Lorem ipsum dolor sit amet')).toBeNull();
    expect(stubPhraseIn('// TODO: причесать отступы')).toBeNull();

    /* И это НЕ ослабление запрета: реплики пользователю ловятся по-прежнему. */
    expect(stubPhraseIn('Демо-версия')).toBe('демо-версия');
    expect(stubPhraseIn('Функция недоступна')).toBe('функция недоступна');

    /* Ложный срабат стоил бы красной оси на любом макете — проверяем это целиком. */
    const honestForm = judgeOperability({
      total: 1,
      probes: [element({ label: 'Отправить' })],
      pageText: 'Имя',
      sources: [{ file: 'index.html', text: '<input placeholder="Ваше имя">' }],
      notes: [],
    });

    expect(honestForm.verdict).toBe('operable');
    expect(honestForm.findings).toEqual([]);
  });

  it('РЕГРЕССИЯ (А-51 п.5-VIII): живой якорь — РАБОТАЮЩАЯ ссылка, мёртвый — инертная', () => {
    /*
     * Фикс А-44 объявил инертным всё, что не сдвинуло страницу, и сравнял `href="#"` с
     * `href="#news"`. На NEURA — сорок четыре живые ссылки и ни одной в никуда — это дало бы
     * восемь ложно-инертных.
     */
    const still = { navigated: false, changed: false, hoverChanged: false };

    const alive = classifyProbe(element({ href: '#news', anchorResolves: true, ...still }));
    expect(alive.outcome).toBe('working');
    expect(alive.why).toContain('существующему месту');

    const dead = classifyProbe(element({ href: '#', anchorResolves: null, ...still }));
    expect(dead.outcome).toBe('inert');
    expect(dead.why).toContain('в никуда');

    /* Якорь к несуществующему месту — тоже инертный, но причина названа своя. */
    const broken = classifyProbe(element({ href: '#нет-такого', anchorResolves: false, ...still }));
    expect(broken.outcome).toBe('inert');
    expect(broken.why).toContain('которого на странице нет');
  });

  it('РЕГРЕССИЯ (А-51 п.5): javascript:void(0); с точкой с запятой — тоже «ведёт в никуда»', () => {
    const still = { navigated: false, changed: false, hoverChanged: false };

    expect(classifyProbe(element({ href: 'javascript:void(0);', ...still })).why).toContain(
      'в никуда',
    );
  });

  it('кусок ссылки после решётки читается кодом, а не угадывается', () => {
    expect(anchorFragment('#news')).toBe('news');
    expect(anchorFragment('/products.html#specs')).toBe('specs');
    expect(anchorFragment('#')).toBeNull();
    expect(anchorFragment('/products.html')).toBeNull();
    expect(anchorFragment(null)).toBeNull();
    /* Процентная запись разворачивается: `#%D0%B0` и `#а` — одно и то же место. */
    expect(anchorFragment('#%D0%B0')).toBe('а');
  });

  it('ни одного интерактивного элемента — ось не бывает зелёной по умолчанию', () => {
    const verdict = judgeOperability({
      total: 0,
      probes: [],
      pageText: '',
      sources: [],
      notes: [],
    });

    expect(verdict.verdict).toBe('broken');
    expect(verdict.findings.join('\n')).toContain('не проверялась');
  });

  it('красная четвёртая ось роняет доску целиком', () => {
    const board = assembleBoard({
      coherence: { status: 'judged', verdict: 'coherent', findings: [], judgedBy: 'google' },
      liveness: { verdict: 'alive', findings: [] },
      evidence: { probes: ALIVE, signals: [] },
      entry: entryOk,
      operability: judgeOperability({
        total: 1,
        probes: [element({ navigated: false, alert: 'Демо-версия, функция недоступна' })],
        pageText: '',
        sources: [],
        notes: [],
      }),
    });

    expect(board.green).toBe(false);
    expect(renderQualityBoard(board)).toContain('4. Работоспособность — СЛОМАНО');
  });

  it('число инертных уходит в доску — и это число ЭЛЕМЕНТОВ, а не улик', () => {
    const board = assembleBoard({
      coherence: { status: 'judged', verdict: 'coherent', findings: [], judgedBy: 'google' },
      liveness: { verdict: 'alive', findings: [] },
      evidence: { probes: ALIVE, signals: [] },
      entry: entryOk,
      operability: judgeOperability({
        total: 86,
        probes: [
          element({ duplicates: 12 }),
          element({ href: '#', navigated: false, changed: false, duplicates: 74 }),
        ],
        pageText: '',
        sources: [],
        notes: [],
      }),
    });

    const text = renderQualityBoard(board);
    expect(board.green).toBe(true);
    expect(text).toContain('нажато 2 из 86 видимых');
    /*
     * РЕГРЕССИЯ А-51 п.5-IX: прежде здесь стояла единица — счёт УЛИК после дедупликации по
     * `tag|label|href`. Семьдесят четыре мёртвые ссылки одной подписи представали одной, и
     * заказчик находил разницу руками за минуту, а суд её не находил вовсе.
     */
    expect(text).toContain('инертных 1 (элементов 74)');
    expect(text).toContain('Инертное законно и потому посчитано: 74');
  });

  it('РЕГРЕССИЯ (А-51 п.5-IX): потолок пробы называется вслух, даже когда числа сошлись', () => {
    const board = assembleBoard({
      coherence: { status: 'judged', verdict: 'coherent', findings: [], judgedBy: 'google' },
      liveness: { verdict: 'alive', findings: [] },
      evidence: { probes: ALIVE, signals: [] },
      entry: entryOk,
      operability: judgeOperability({
        total: 120,
        capped: true,
        probes: [element()],
        pageText: '',
        sources: [],
        notes: [],
      }),
    });

    /* Именно этот случай прежде молчал: при чистом обрезании `total` совпадал с числом улик. */
    expect(renderQualityBoard(board)).toContain('остановилась на своём потолке');
  });

  it('«не проверяемо приёмкой» доезжает до доски строкой, а не растворяется', () => {
    const board = assembleBoard({
      coherence: { status: 'judged', verdict: 'coherent', findings: [], judgedBy: 'google' },
      liveness: { verdict: 'alive', findings: [] },
      evidence: { probes: ALIVE, signals: [] },
      entry: entryOk,
      operability: OPERABLE,
      unverified: [{ taskId: 'WA05', reason: 'не проверяемо приёмкой: нет браузера' }],
    });

    expect(renderQualityBoard(board)).toContain('Не проверено приёмкой: задач 1');
    expect(renderQualityBoard(board)).toContain('WA05');
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
      operability: OPERABLE,
    });
    expect(green.green).toBe(true);

    const scattered = assembleBoard({
      coherence: coherent,
      liveness: { verdict: 'alive', findings: [] },
      evidence: { probes: ALIVE, signals: [] },
      entry: { verdict: 'scattered', entry: null, findings: ['страница-сирота'], unreachable: [] },
      operability: OPERABLE,
    });
    expect(scattered.green).toBe(false);
  });

  it('РЕГРЕССИЯ (А-51 п.4, §10.1): несудившаяся ось — ДОЛГ, а не красное', () => {
    /*
     * **Живой производственный дефект, который эта правка чинит.** Ось связности требовала
     * настроенного провайдера судьи, а прод отдаёт `null` при пустом перечне провайдеров роли
     * `judge` (`start-loop/route.ts`). Значит без настроенного судьи НИ ОДИН проект не мог
     * получить зелёной доски — не потому, что продукт плох, а потому, что смотреть было некому.
     *
     * «Не судимо» и «судимо и плохо» — разные утверждения. Первое считается долгом по образцу
     * «не проверяемо приёмкой» (A-50): называется вслух, публикуется числом, зелёности не даёт и
     * зелёность не отменяет.
     */
    const board = assembleBoard({
      coherence: { status: 'skipped', reason: 'провайдер роли судьи не настроен' },
      liveness: { verdict: 'alive', findings: [] },
      evidence: { probes: ALIVE, signals: [] },
      entry: entryOk,
      operability: OPERABLE,
    });

    expect(board.green).toBe(true);
    expect(board.debts).toEqual([
      { what: 'ось связности (I)', why: 'провайдер роли судьи не настроен' },
    ]);

    const text = renderQualityBoard(board);
    expect(text).toContain('НЕ СУДИМА');
    expect(text).toContain('Это долг, а не красная ось');
    expect(text).toContain('Долги суда (судить было нечем): 1');
    /* И «зелено по всем четырём осям» при долге не говорится: это была бы вторая неправда. */
    expect(text).not.toContain('зелено по всем четырём осям');
    expect(text).toContain('при долгах 1');
  });

  it('судившаяся и разошедшаяся связность — по-прежнему красное, а не долг', () => {
    const board = assembleBoard({
      coherence: {
        status: 'judged',
        verdict: 'broken',
        findings: ['кадр 2: кнопки разной высоты'],
        judgedBy: 'google',
      },
      liveness: { verdict: 'alive', findings: [] },
      evidence: { probes: ALIVE, signals: [] },
      entry: entryOk,
      operability: OPERABLE,
    });

    expect(board.green).toBe(false);
    expect(board.debts).toEqual([]);
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
      operability: OPERABLE,
    });

    const text = renderQualityBoard(board);
    expect(text).toContain('1. Связность — СЪЕХАЛО (смотрел google)');
    expect(text).toContain('кадр 2: заголовок прижат влево');
    expect(text).toContain('2. Живость — СТАТИЧНЫЙ (0 из 1 проверок сдвинулись)');
    expect(text).toContain('3. Вход — один: npm start');
    expect(text).toContain('4. Работоспособность — работает');
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
      operability: OPERABLE,
    });
    expect(board.green).toBe(false);
  });
});
