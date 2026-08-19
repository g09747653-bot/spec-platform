/* eslint-disable no-restricted-properties -- a hand-run evidence walk, not application code: it is
   switched on from the environment because it writes artifacts and is not part of any CI run. */
import { mkdirSync, writeFileSync } from 'node:fs';

import { expect, test, type Page } from '@playwright/test';

import {
  completeStage,
  createSignedInUser,
  PARITY_STAGES,
  projectIdOf,
  signIn,
  startSession,
} from './fixtures';

/**
 * **The parity checklist, walked** (task 128; А-2 — финальный парити-вердикт).
 *
 * Эталон Часть 1 (§1.1–1.5) is a description of observable behaviour, and this is that description
 * turned into observations of ours. Every item the checklist carries is answered here by a fact read
 * off the running product — a control that exists, an attribute that is present, a badge that says
 * what it should — and the screenshot beside it is what a person checks the fact against.
 *
 * **It runs on the double, deliberately.** Parity here is about surfaces and mechanics, not about how
 * good a model's prose is; the stub answers the same way every time, so a checklist item that turns
 * red is a change in the product rather than a change in the weather (NFR-012 AC-5). The live
 * evidence is the M10п gate's own walk, next door.
 *
 * **What it cannot do**: put our screenshot next to theirs. The seven HTML dumps behind the эталон
 * are the Architect's research material and are not in this repository, so the «theirs» column is
 * the эталон's own text, quoted. That is stated on every row rather than glossed.
 *
 * Not part of any CI run — `PARITY_WALK=1` switches it on:
 *   PARITY_WALK=1 pnpm exec playwright test parity-M10 --project=chromium
 */

const OUT = process.env.PARITY_OUT ?? 'artifacts/parity-M10';

const IDEA =
  'A tool that tracks which of a small charity’s grant applications are due, and drafts the reminder emails';

interface Observation {
  /** The checklist row this answers, e.g. `1.1-4`. */
  id: string;
  /** What Эталон Часть 1 says, in its own words. */
  claim: string;
  /** What the running product does, read off the page. */
  observed: string;
  /** The screenshot the fact can be checked against. */
  screen?: string;
}

const observations: Observation[] = [];

function record(observation: Observation): void {
  observations.push(observation);
  console.log(`[${observation.id}] ${observation.observed}`);
}

let shot = 0;

async function screen(page: Page, label: string): Promise<string> {
  shot += 1;
  const name = `${String(shot).padStart(2, '0')}-${label.replace(/[^\w]+/g, '-')}.png`;

  mkdirSync(`${OUT}/screens`, { recursive: true });
  await page.screenshot({ path: `${OUT}/screens/${name}`, fullPage: true, caret: 'initial' });

  return name;
}

/** Every attribute of one element, as a plain record — the fact a data-attribute claim needs. */
async function attributesOf(
  page: Page,
  selector: string,
): Promise<Partial<Record<string, string>>> {
  return page.evaluate((css: string) => {
    const element = document.querySelector(css);
    if (element === null) return {};

    return Object.fromEntries([...element.attributes].map((a) => [a.name, a.value]));
  }, selector);
}

/**
 * Computed style, read off the running page (M11п).
 *
 * The red-team's verdict on the first edition of this walk was that its evidence was `count()` of a
 * test id — «наличие кнопки — не её оформление». Where a row of the checklist is about appearance,
 * the observation below is now the browser's own answer about that appearance: the colour actually
 * painted, the gradient actually declared, the animation actually running.
 */
async function styleOf(
  page: Page,
  selector: string,
  properties: readonly string[],
): Promise<Partial<Record<string, string>>> {
  return page.evaluate(
    ({ css, wanted }: { css: string; wanted: readonly string[] }) => {
      const element = document.querySelector(css);
      if (element === null) return {};

      const computed = window.getComputedStyle(element);

      return Object.fromEntries(wanted.map((name) => [name, computed.getPropertyValue(name)]));
    },
    { css: selector, wanted: properties },
  );
}

/** The five `data-msg-*` attributes of one block, in the reference's own order. */
async function msgAttributes(page: Page, kind: string): Promise<string> {
  const attributes = await attributesOf(page, `[data-msg-kind="${kind}"]`);
  if (Object.keys(attributes).length === 0) return `${kind}: блока нет на экране`;

  const value = (name: string): string => {
    const raw = attributes[`data-msg-${name}`];
    if (raw === undefined) return 'ОТСУТСТВУЕТ';
    return raw === '' ? '(пусто)' : `«${raw.length > 40 ? `${raw.slice(0, 39)}…` : raw}»`;
  };

  return `${kind}: id=${value('id')}, role=${value('role')}, stage=${value('stage')}, substage=${value('substage')}, snippet=${value('snippet')}`;
}

test.describe('parity checklist evidence (task 128)', () => {
  // M11п: the walk grew a reload, a second methodology and a dozen measured observations.
  test.describe.configure({ mode: 'serial', timeout: 600_000 });
  test.skip(
    process.env.PARITY_WALK !== '1',
    'the parity walk writes artifacts and is run on demand',
  );

  test.afterAll(() => {
    mkdirSync(OUT, { recursive: true });
    writeFileSync(`${OUT}/EVIDENCE.json`, JSON.stringify(observations, null, 2), 'utf8');
    writeFileSync(
      `${OUT}/EVIDENCE.md`,
      [
        '# Наблюдения парити-прогулки (задача 128)',
        '',
        'Собрано `e2e/parity-M10.spec.ts` на детерминированном стабе. Колонка «эталон» — текст',
        '`.specs/research/myspec-parity-reference.md`; дампов их страниц в репозитории нет, поэтому',
        'сравнение идёт с описанием, а не со скриншотом (см. шапку спеки).',
        '',
        '| пункт | эталон говорит | у нас наблюдается | скрин |',
        '|---|---|---|---|',
        ...observations.map(
          (row) =>
            `| \`${row.id}\` | ${row.claim} | ${row.observed} | ${row.screen === undefined ? '—' : `\`${row.screen}\``} |`,
        ),
      ].join('\n'),
      'utf8',
    );
  });

  test('§1.1–1.3 — one feed, its five block types, and the review card', async ({
    page,
    context,
  }) => {
    const user = await createSignedInUser('parity-m10');
    await signIn(context, user);

    await startSession(page, IDEA, 'myspec-greenfield-v1');
    const seeded = await screen(page, 'seeded-session');

    /* --------------------------------------------------------------- §1.1 the feed */

    record({
      id: '1.1-1',
      claim: 'вся сессия живёт в одной непрерывной ленте чата, никаких «страниц стадий»',
      observed: `лента \`feed\` присутствует на странице сессии: ${String(
        await page.getByTestId('feed').count(),
      )}; страниц стадий в маршрутах нет`,
      screen: seeded,
    });

    /*
     * **Values, on every kind of block, not names on one** (M11п). The first edition read the
     * attribute *names* of the seed and called the row answered; the red-team's point was that
     * eight other kinds went unchecked and that `substage` was being counted while empty. Each kind
     * is asked as it appears, and the answers accumulate into one row at the end of the walk.
     */
    const attributeReadings: string[] = [await msgAttributes(page, 'seed')];

    record({
      id: '1.2-1',
      claim: 'seed-сообщение шаблонное: «I want to build {название}. My project description is: …»',
      observed: `первое сообщение ленты целиком: «${(
        await page.getByTestId('session-prompt-line').first().innerText()
      ).replace(/\s+/g, ' ')}» — описание встречается в нём один раз`,
      screen: seeded,
    });

    /*
     * The bubble's fill, measured rather than asserted (row `1.1-2`). Two colours: the bubble's own
     * background and the page's. The red-team compared these two pixels and found them identical.
     */
    const bubbleFill = await styleOf(page, '[data-testid="session-prompt-line"]', [
      'background-color',
    ]).then(async (own) => ({
      bubble:
        (await styleOf(page, '[data-msg-kind="seed"] > div', ['background-color']))[
          'background-color'
        ] ?? '—',
      canvas: (await styleOf(page, 'body', ['background-color']))['background-color'] ?? '—',
      own,
    }));

    record({
      id: '1.1-2',
      claim:
        'пузырь пользователя справа (rounded-2xl rounded-tl-sm, **приглушённый фон**), проза ИИ слева',
      observed: `фон пузыря ${bubbleFill.bubble}, фон полотна ${bubbleFill.canvas} — ${
        bubbleFill.bubble === bubbleFill.canvas ? 'ОДИНАКОВЫ' : 'различаются'
      }`,
      screen: seeded,
    });

    /* ------------------------------------------------------- §1.1 the question round */

    await expect(page.getByTestId('interview-panel')).toBeVisible();
    await page.getByTestId('ask-round').click();
    await expect(page.getByTestId('mcq-card')).toBeVisible({ timeout: 60_000 });
    const roundShot = await screen(page, 'question-round');

    const heading = await page.getByTestId('round-heading').first().innerText();
    record({
      id: '1.1-4',
      claim: 'заголовок анкеты «Round N — K questions», капс, разрежённый трекинг',
      observed: `заголовок: «${heading.replace(/\s+/g, ' ')}»`,
      screen: roundShot,
    });

    attributeReadings.push(await msgAttributes(page, 'round'));

    /*
     * The round card is also where the budget is said out loud (row `1.4-7`): the number the gate
     * enforces, printed beside the ask button rather than the environment default it used to be.
     */
    record({
      id: '1.4-7',
      claim: 'бюджет раундов — свойство методологии; поверхность обязана называть число гейта',
      /*
       * The two numbers off the panel rather than the sentence that frames them (task 143): what
       * the row is about is the budget the gate enforces, and «1 of 3 question rounds» is one
       * wording of it.
       */
      observed: `панель называет: ${
        (await page.getByTestId('interview-panel').getAttribute('data-answered-rounds')) ?? '—'
      } из ${(await page.getByTestId('interview-panel').getAttribute('data-round-budget')) ?? '—'}`,
      screen: roundShot,
    });

    const card = await page.getByTestId('mcq-card').innerText();
    record({
      id: '1.1-5',
      claim:
        'у вопроса — текст, красная звёздочка обязательности, подпись «Select one» / «Select all that apply»',
      /*
       * The asterisk is a glyph and stays one; the caption is read as the choice it announces
       * rather than as its English (task 143) — `data-select` is the question's own `single` or
       * `multiple`, which is the fact «Select one» and «Select all that apply» are two wordings of.
       */
      observed: `звёздочка обязательности: ${card.includes('*') ? 'есть' : 'нет'}; подпись выбора объявляет ${
        (await page
          .locator('[data-testid^="mcq-hint-"]')
          .first()
          .getAttribute('data-select')
          .catch(() => null)) ?? '(нет подписи)'
      }`,
      screen: roundShot,
    });

    record({
      id: '1.1-6',
      claim:
        'опция = радио/чекбокс + название + пометка (Recommended) + описание + (иногда) тег-чипы',
      // The marker counted as nodes rather than found as a word in the card (task 143).
      observed: `опций с пометкой «рекомендуется»: ${String(
        await page.locator('[data-testid^="mcq-recommended-"]').count(),
      )}; опций с тег-чипами: ${String(
        await page.locator('[data-testid^="mcq-tags-"]').count(),
      )}, на первой из них чипы ${await page
        .locator('[data-testid^="mcq-tags-"]')
        .first()
        .locator('span')
        .allInnerTexts()
        .then((chips) => chips.map((chip) => `«${chip}»`).join(', '))
        .catch(() => '—')}`,
      screen: roundShot,
    });

    record({
      id: '1.1-7',
      claim: 'всегда есть вариант Other со свободным вводом',
      observed: `элементов \`mcq-other-*\`: ${String(
        await page.locator('[data-testid^="mcq-other-"]').count(),
      )}`,
      screen: roundShot,
    });

    record({
      id: '1.1-8',
      claim: 'внизу — кнопка Submit Answers',
      observed: `\`mcq-submit\` подписана «${await page.getByTestId('mcq-submit').innerText()}»`,
      screen: roundShot,
    });

    await page.getByTestId('mcq-option-q-audience-solo-devs').check();
    await page.getByTestId('mcq-option-q-problem-context').check();
    await page.getByTestId('mcq-submit').click();
    await expect(page.getByTestId('round-answered').first()).toBeVisible({ timeout: 60_000 });
    const answeredShot = await screen(page, 'round-answered-fixed');

    const disabledInputs = await page
      .locator('[data-testid="round-answered"] input[disabled]')
      .count();
    record({
      id: '1.1-9',
      claim: 'после отправки форма остаётся в ленте в disabled-состоянии с зафиксированным выбором',
      observed: `в зафиксированном раунде отключённых полей: ${String(disabledInputs)}; выбранное значение видно как \`answered-value\`: ${String(
        await page.getByTestId('answered-value').count(),
      )}`,
      screen: answeredShot,
    });

    /* ------------------------------------------------- §1.2 the analytical bridge */

    /*
     * The interviewer's comment between two rounds (row `1.2-3`) — the content gap the red-team
     * called «слой 1 из Части 6 эталона». It is written when the answers are stored, so it is on
     * screen by the time the round above is fixed.
     */
    const bridgeShot = await screen(page, 'analytical-bridge');
    record({
      id: '1.2-3',
      claim:
        'между раундами ИИ пишет аналитический мостик по противоречиям ответов — «это не косметика»',
      observed: `мостиков в ленте: ${String(await page.getByTestId('interview-bridge').count())}; первый: «${await page
        .getByTestId('interview-bridge')
        .first()
        .innerText()
        .then((text) => text.replace(/\s+/g, ' ').slice(0, 140))
        .catch(() => '—')}»`,
      screen: bridgeShot,
    });

    await page.getByTestId('proceed').click();
    await expect(page.locator('[data-state="current"][data-stage="constitution"]')).toBeVisible();

    /* --------------------------------------------------------- §1.1 the stage chip */

    const chipShot = await screen(page, 'stage-chip');
    const chip = await page
      .getByTestId('stage-chip')
      .first()
      .innerText()
      .catch(() => '(нет чипа)');

    /*
     * All four traits, measured (row `1.1-10`). The first edition read the chip's text and called
     * the row parity; the эталон names a *colour* for the target, a *gradient* on the border and
     * *motion* on the dashes, and none of those is text.
     */
    const chipStyle = await styleOf(page, '[data-testid="stage-chip"]', ['background-image']);
    const chipTarget = await styleOf(page, '[data-testid="stage-chip"] span span:last-child', [
      'color',
      'font-weight',
    ]);
    const chipDashes = await styleOf(page, '[data-testid="stage-chip"] .dash-flow', [
      'animation-name',
      'animation-duration',
    ]);
    const primaryInk = await page.evaluate(() =>
      window.getComputedStyle(document.documentElement).getPropertyValue('--color-primary-ink'),
    );

    record({
      id: '1.1-10',
      claim:
        'pill по центру: слева «откуда», анимированные тире dash-flow, стрелка, справа «куда» в primary; градиентная рамка primary/20',
      observed: `текст: «${chip.replace(/\s+/g, ' ')}»; цель окрашена ${chipTarget.color ?? '—'} (токен --color-primary-ink = ${primaryInk.trim()}), вес ${chipTarget['font-weight'] ?? '—'}; рамка: ${(chipStyle['background-image'] ?? '—').slice(0, 90)}…; тире: анимация «${chipDashes['animation-name'] ?? '—'}» ${chipDashes['animation-duration'] ?? '—'}`,
      screen: chipShot,
    });

    attributeReadings.push(await msgAttributes(page, 'transition'));
    attributeReadings.push(await msgAttributes(page, 'bundle'));

    record({
      id: '1.2-5',
      claim: 'после Interview создаётся бандл («Project bundle created: …»)',
      observed: `блок в ленте: «${await page
        .getByTestId('bundle-created')
        .first()
        .innerText()
        .then((text) => text.replace(/\s+/g, ' '))
        .catch(() => '(блока нет)')}»`,
      screen: chipShot,
    });

    // Waited for rather than read on the way past: the pill re-renders with the router, and the
    // first edition of this row read «—» off a header that had not caught up yet.
    await expect(page.getByTestId('stage-substage')).toBeVisible({ timeout: 30_000 });

    record({
      id: '1.4-5',
      claim: 'step pills из графа; подстадия — в подписи активного шага',
      observed: `активная пилюля печатает подстадию как «${(
        await page.getByTestId('stage-substage').innerText()
      ).replace(/\s+/g, ' ')}», чип рядом — «${chip.replace(/\s+/g, ' ')}»`,
      screen: chipShot,
    });

    /* ----------------------------------------------------- §1.1 the document card */

    await page.getByTestId('ask-round').click();
    await expect(page.getByTestId('mcq-card')).toBeVisible({ timeout: 60_000 });
    await page.getByTestId('mcq-option-q-constitution-scope-strict').check();
    await page.getByTestId('mcq-submit').click();
    await expect(page.getByTestId('interview-panel')).toBeVisible();
    await page.getByTestId('proceed').click();
    await expect(page.getByTestId('stage-substage')).toHaveAttribute('data-substage', 'generate');

    await page.getByTestId('generate-spec').click();
    await expect(page.getByTestId('spec-card')).toBeVisible({ timeout: 60_000 });
    const documentShot = await screen(page, 'document-card');

    const captionStyle = await styleOf(page, '[data-testid="spec-card"] p', ['color']);

    record({
      id: '1.1-11',
      claim:
        'карточка документа: название стадии **в primary**, путь моно, бейдж Approved, Rev N, кнопка Preview **(глаз)**',
      observed: `путь: «${await page.getByTestId('document-path').first().innerText()}»; ревизия: «${await page
        .getByTestId('document-revision')
        .first()
        .innerText()
        .catch(
          () => '—',
        )}»; подпись стадии окрашена ${captionStyle.color ?? '—'} (токен --color-primary-ink = ${primaryInk.trim()})`,
      screen: documentShot,
    });

    attributeReadings.push(await msgAttributes(page, 'document'));

    await page.getByTestId('approve-spec').click();
    await expect(page.getByTestId('spec-card')).toHaveAttribute('data-approved', 'true');
    record({
      id: '1.1-11a',
      claim: 'бейдж Approved (success) на карточке документа',
      observed: `\`document-approved\` на странице: ${String(
        await page.getByTestId('document-approved').count(),
      )}`,
      screen: documentShot,
    });

    await page.getByTestId('proceed').click();
    await expect(page.getByTestId('review-board')).toBeVisible({ timeout: 60_000 });
    const boardShot = await screen(page, 'review-board');

    /* ------------------------------------------------------------- §1.3 the board */

    record({
      id: '1.3-1',
      claim: 'бейдж вердикта Needs Revision (amber) или Pass (success) + подпись «<Stage> review»',
      observed: `вердикт: «${await page.getByTestId('review-outcome').innerText()}»`,
      screen: boardShot,
    });

    record({
      id: '1.3-2',
      claim: 'абзац-сводка ревью',
      observed: `\`review-summary\`: «${(await page.getByTestId('review-summary').innerText())
        .replace(/\s+/g, ' ')
        .slice(0, 100)}…»`,
      screen: boardShot,
    });

    const group = async (testId: string): Promise<string> => {
      const root = page.getByTestId(testId);
      if ((await root.count()) === 0) return `${testId}: группы нет`;

      const total = await root.locator('input[type="checkbox"]').count();
      const checked = await root.locator('input[type="checkbox"]:checked').count();
      const heading = (await root.locator('summary').innerText()).replace(/\s+/g, ' ');

      return `«${heading}» — отмечено ${String(checked)} из ${String(total)}`;
    };

    record({
      id: '1.3-3',
      claim:
        'две группы: Must Fix (N) — отмечены по умолчанию; Recommendations (N) — сняты по умолчанию',
      observed: `${await group('review-mustfix')}; ${await group('review-recommendations')}`,
      screen: boardShot,
    });

    record({
      id: '1.3-4',
      claim:
        'пункт: чекбокс · **«Секция — подсекция»** · Confidence score X/10 с тултипом · проблема · курсивное «Suggestion: …»',
      observed: `заголовок первого пункта: «${await page
        .locator('[data-testid^="review-item-section-"]')
        .first()
        .innerText()
        .catch(() => '(заголовком служит не путь секции)')}»; на доске бейджей уверенности ${String(
        await page.locator('[data-testid^="review-item-confidence-"]').count(),
      )}, строк-предложений ${String(
        await page.locator('[data-testid^="review-item-suggestion-"]').count(),
      )}`,
      screen: boardShot,
    });

    attributeReadings.push(await msgAttributes(page, 'review'));

    record({
      id: '1.3-5',
      claim: 'три кнопки: Accept feedback / Request changes / Ignore',
      observed: (
        await Promise.all(
          ['review-accept', 'review-request-changes', 'review-ignore'].map(async (id) =>
            page
              .getByTestId(id)
              .innerText()
              .then((text) => `«${text}»`)
              .catch(() => `(${id} отсутствует)`),
          ),
        )
      ).join(', '),
      screen: boardShot,
    });

    /* --------------------------------------------------- §1.2 free chat mid-review */

    /*
     * Counted, then waited for **one more**. Waiting on a selector that is already on screen is not
     * waiting at all, and the feed is full of blocks that were there before this message.
     */
    const messagesBefore = await page.locator('[data-msg-kind="message"]').count();

    await page.getByTestId('composer').getByRole('textbox').fill('Что мне здесь выбрать?');
    await page.getByTestId('chat-send').click();
    await page.waitForFunction(
      (count: number) => document.querySelectorAll('[data-msg-kind="message"]').length > count + 1,
      messagesBefore,
      { timeout: 60_000 },
    );
    const chatShot = await screen(page, 'free-chat-in-review');

    const replyAttributes = await page.evaluate(() => {
      const messages = [...document.querySelectorAll('[data-msg-kind="message"]')].filter(
        (node) => node.getAttribute('data-msg-role') !== 'user',
      );
      const last = messages.at(-1);
      if (last === undefined) return {};

      return Object.fromEntries([...last.attributes].map((a) => [a.name, a.value]));
    });

    record({
      id: '1.1-3a',
      claim: 'data-msg-role="user|ai"',
      observed: `у ответа роль записана как «${replyAttributes['data-msg-role'] ?? '—'}» (эталон пишет «ai»)`,
      screen: chatShot,
    });

    /*
     * **Reloaded, then read again** (row `1.2-4`; А-12). The claim А-12 returned to the gap list is
     * not "a reply arrives" — it is that the reference's saved session contains its chat verbatim.
     * A walk that reads the attributes in the one second they are true proves nothing about that,
     * which is exactly what the red-team said about the first edition of this row.
     */
    await page.reload();
    await expect(page.getByTestId('review-board')).toBeVisible({ timeout: 60_000 });
    const afterReload = await screen(page, 'free-chat-after-reload');

    const survivors = await page.evaluate(() =>
      [...document.querySelectorAll('[data-msg-kind="message"]')]
        .filter((node) => node.textContent.includes('Что мне здесь выбрать?'))
        .map((node) => ({
          role: node.getAttribute('data-msg-role') ?? '',
          stage: node.getAttribute('data-msg-stage') ?? '',
          substage: node.getAttribute('data-msg-substage') ?? '',
          text: node.textContent.trim(),
        })),
    );

    record({
      id: '1.2-4',
      claim:
        'свободный чат работает в любой точке; ответ приходит тем же чатом с data-msg-substage="review"; сохранённая сессия эталона содержит свой чат дословно',
      observed: `до перезагрузки ответ нёс stage=«${replyAttributes['data-msg-stage'] ?? '—'}», substage=«${
        replyAttributes['data-msg-substage'] ?? '—'
      }»; **после перезагрузки** реплика на месте: ${String(survivors.length)} шт., stage=«${
        survivors[0]?.stage ?? '—'
      }», substage=«${survivors[0]?.substage ?? '—'}», текст «${survivors[0]?.text ?? '—'}»; доска ревью на месте: ${String(
        await page.getByTestId('review-board').count(),
      )}`,
      screen: afterReload,
    });

    attributeReadings.push(await msgAttributes(page, 'message'));

    const alignment = await page.evaluate(() => {
      const classesOf = (role: string): string =>
        document.querySelector(`[data-msg-role="${role}"]`)?.getAttribute('class') ?? '';

      return { user: classesOf('user'), ai: classesOf('assistant') };
    });

    const proseStyle = await styleOf(page, '[data-testid="chat-turn-assistant"]', [
      'font-size',
      'line-height',
      'max-width',
    ]);

    record({
      id: '1.5-11',
      claim: 'проза ИИ несёт типографический класс `chat-prose prose`',
      observed: `выравнивание пузыря пользователя «${
        alignment.user.includes('justify-end') ? 'justify-end (справа)' : alignment.user
      }», прозы ИИ «${alignment.ai.includes('justify-end') ? 'justify-end' : 'по левому краю'}»; типографика прозы: ${Object.entries(
        proseStyle,
      )
        .map(([name, value]) => `${name}=${value ?? '—'}`)
        .join(', ')}`,
      screen: afterReload,
    });

    /* ------------------------------------------------------------ to the terminal */

    await page.getByTestId('review-accept').click();
    await expect(page.getByTestId('review-board')).toHaveCount(0);
    await page.getByTestId('proceed').click();

    for (const stage of PARITY_STAGES.filter((name) => name !== 'constitution')) {
      await completeStage(page, stage);
    }

    await expect(page.getByTestId('session-complete')).toBeVisible({ timeout: 60_000 });
    const completeShot = await screen(page, 'session-complete');

    /*
     * The Preview control is asked for **here**, at the terminal, and the position is the point: on
     * the document a session is working on the content is inline, so a Preview toggle would open
     * what is already open. It appears on the ones behind it, which is where the эталон's eye is.
     */
    record({
      id: '1.1-11b',
      claim: 'на карточке документа — кнопка Preview (глаз)',
      observed: `на завершённой сессии карточек с \`document-preview-toggle\`: ${String(
        await page.getByTestId('document-preview-toggle').count(),
      )} (на текущем документе содержимое показано целиком, без переключателя)`,
      screen: completeShot,
    });

    /*
     * **The last thing in the feed** (row `1.1-13`). The panel was always the last *block*; what the
     * red-team screenshotted was four surfaces rendered after the block list. So the question the
     * walk asks is the positional one the эталон actually makes: what is the feed's final child?
     */
    const tail = await page.evaluate(() => {
      const feed = document.querySelector('[data-testid="feed"]');
      const children = feed === null ? [] : [...feed.children];
      // The panel by its own name, not by the caption it prints (task 143).
      const panel = children.findIndex(
        (node) => node.querySelector('[data-testid="session-complete"]') !== null,
      );

      return {
        last:
          children.at(-1)?.querySelector('[data-testid]')?.getAttribute('data-testid') ?? '(нет)',
        below: children
          .slice(panel + 1)
          .map((node) => node.querySelector('[data-testid]')?.getAttribute('data-testid') ?? '?')
          .filter((id) => id !== '?'),
      };
    });

    record({
      id: '1.1-13',
      claim:
        '**финал ленты**: панель Session completed (Bundle: имя — N spec files generated; Edit, Download)',
      observed: `бандл: «${await page.getByTestId('completion-bundle').innerText()}»; файлов: «${await page
        .getByTestId('completion-file-count')
        .innerText()}»; последний элемент ленты — \`${tail.last}\`; ниже панели ещё поверхностей: ${
        tail.below.length === 0 ? 'ноль' : tail.below.map((id) => `\`${id}\``).join(', ')
      }; копия панели: «${(await page.getByTestId('session-complete').innerText())
        .replace(/\s+/g, ' ')
        .slice(0, 260)}»`,
      screen: completeShot,
    });

    record({
      id: '1.1-14',
      claim:
        'панель «Build with your favourite tool»: Lovable / Bolt / Replit / Generate AI Prompt',
      observed: `\`build-with\` присутствует: ${String(
        await page.getByTestId('build-with').count(),
      )}; \`generate-ai-prompt\`: ${String(await page.getByTestId('generate-ai-prompt').count())}`,
      screen: completeShot,
    });

    /* -------------------------------------------------------------- §1.5 surfaces */

    const projectId = await projectIdOf(page);

    const composerBox = page.getByTestId('composer').getByRole('textbox');
    await composerBox.fill('/');
    const slashVisible = await page
      .getByTestId('slash-menu')
      .isVisible()
      .catch(() => false);
    await composerBox.fill('');

    const models = await page
      .getByTestId('model-picker')
      .locator('option')
      .allInnerTexts()
      .catch(() => []);

    record({
      id: '1.5-1',
      claim:
        'per-chat model picker в композере: Auto + конкретные модели; выбор сохраняется на чат',
      observed: `пикер предлагает: ${models.map((label) => `«${label}»`).join(', ') || '(пусто)'}`,
      screen: completeShot,
    });

    /*
     * Counted **inside the composer**, and the send button's fill read rather than assumed (row
     * `1.5-2`). The first edition counted `attachment-input` across the whole page — where the
     * sidebar sits beside the feed — and called the row answered.
     */
    const inComposer = async (id: string): Promise<number> =>
      page.getByTestId('composer').getByTestId(id).count();

    const sendFill = await styleOf(page, '[data-testid="chat-send"]', [
      'background-image',
      'background-color',
    ]);

    record({
      id: '1.5-2',
      claim:
        'композер: contenteditable, **attach**, @-ссылки, slash, пикер, отправка **с брендовым градиентом**',
      observed: `внутри композера: attach=${String(await inComposer('composer-attach'))}, model-picker=${String(
        await inComposer('model-picker'),
      )}, send=${String(await inComposer('chat-send'))}; меню слэш-команд по «/»: ${
        slashVisible ? 'открывается' : 'не открылось'
      }; заливка Send: background-image ${sendFill['background-image'] ?? '—'}`,
      screen: completeShot,
    });

    /*
     * **The sidebar is left open** and its width is *measured* (row `1.5-3`). The first edition
     * clicked `sidebar-toggle` before counting, and the sidebar is open by default — so five panels
     * were counted on a hidden `<aside>`, and `data-width` was read from the attribute the
     * component writes about itself rather than from the box the browser drew.
     */
    const sidebarShot = await screen(page, 'sidebar');

    const widthOf = async (): Promise<number> =>
      page
        .getByTestId('sidebar-panel')
        .boundingBox()
        .then((box) => Math.round(box?.width ?? 0));

    const restingWidth = await widthOf();

    // Six keyboard steps to the left: the half of the handle's travel that used to do nothing.
    await page.getByTestId('sidebar-resize').focus();
    for (let step = 0; step < 6; step += 1) await page.keyboard.press('ArrowLeft');
    const widenedWidth = await widthOf();

    record({
      id: '1.5-3',
      claim:
        'сайдбар **resizable ~280px**: Specs (бандлы), Local Workspace (Mount folder), **Attachments**',
      observed: `панели: ${(
        await Promise.all(
          ['specs-panel', 'local-workspace', 'mount-folder', 'attachments-panel'].map(async (id) =>
            page
              .getByTestId(id)
              .count()
              .then((count) => `${id}=${String(count)}`),
          ),
        )
      ).join(', ')}; заголовок панели вложений: «${await page
        .getByTestId('attachments-panel')
        .locator('h3, h2')
        .first()
        .innerText()
        .catch(
          () => '—',
        )}»; замеренная ширина ${String(restingWidth)}px, после шести шагов ручки влево ${String(
        widenedWidth,
      )}px`,
      screen: sidebarShot,
    });

    record({
      id: '1.4-8',
      claim: 'каждая методология экспортирует набор файлов своего конфига',
      // The mode as the panel's own token rather than as the «Mode: …» line it sits in (task 143).
      observed: `режим панели экспорта: ${
        (await page.getByTestId('export-mode').getAttribute('data-mode')) ?? '(режима нет)'
      }`,
      screen: sidebarShot,
    });

    attributeReadings.push(await msgAttributes(page, 'completion'));

    record({
      id: '1.1-3',
      claim:
        'каждое сообщение несёт data-msg-id, data-msg-role, data-msg-stage, data-msg-substage, data-msg-snippet',
      observed: `${attributeReadings.join(' — ')} — не встречены этой прогулкой: generation (первая попытка ничего не рисует), proposal (уточнений в этой прогулке нет)`,
      screen: completeShot,
    });

    await page.goto(`/projects/${projectId}`);
    await expect(page.getByTestId('project-page')).toBeVisible();
    const projectShot = await screen(page, 'project-page');

    record({
      id: '1.5-4a',
      claim: 'проектная страница: имя + **описание-тултип** + Share',
      observed: `имя: «${await page.getByTestId('project-page-name').innerText()}»; описание: «${await page
        .getByTestId('project-description')
        .innerText()
        .then((text) => text.replace(/\s+/g, ' ').slice(0, 90))
        .catch(() => '(описания нет)')}», в атрибуте title целиком: ${
        (await page.getByTestId('project-description').getAttribute('title')) === null
          ? 'нет'
          : 'да'
      }`,
      screen: projectShot,
    });

    record({
      id: '1.5-4',
      claim:
        'проектная страница: вкладки Generate | Edit, поиск, фильтры Active/Archived/All, строка чата с бейджами и статусом, карточка MCP Servers',
      observed: (
        await Promise.all(
          [
            'tab-generate',
            'tab-edit',
            'chat-search',
            'filter-active',
            'filter-archived',
            'filter-all',
            'chat-methodology',
            'chat-bundle',
            'chat-status',
            'chat-age',
            'mcp-card',
            'mcp-add-server',
          ].map(async (id) =>
            page
              .getByTestId(id)
              .count()
              .then((count) => `${id}=${String(count)}`),
          ),
        )
      ).join(', '),
      screen: projectShot,
    });

    /* ------------------------------------------- §1.4 the Edit workflow, and its prefill */

    await page.getByTestId('start-edit-chat').click();
    await expect(page.getByTestId('session')).toBeVisible({ timeout: 60_000 });
    const editShot = await screen(page, 'edit-reference');

    record({
      id: '1.4-3',
      claim:
        'Edit-режим: методология «MySpec edit-workflow v1», три шага Reference → Describe → Review',
      observed: `step pills: «${(await page.getByTestId('step-pills').innerText()).replace(
        /\s+/g,
        ' ',
      )}»; бейдж методологии: «${await page
        .getByTestId('methodology-badge')
        .first()
        .innerText()
        .catch(() => '—')}»`,
      screen: editShot,
    });

    await page.getByTestId('proceed').click();
    await expect(page.getByTestId('mcq-card')).toBeVisible({ timeout: 60_000 });
    const describeShot = await screen(page, 'edit-describe');

    record({
      id: '1.4-4',
      claim: 'префилл «I want to update spec {bundle} to …»',
      observed: `поле Describe открывается на «${await page
        .getByTestId('mcq-other-q-edit-describe')
        .inputValue()
        .catch(() => '(поля нет)')}»; первый пузырь Edit-чата целиком: «${await page
        .getByTestId('session-prompt-line')
        .first()
        .innerText()
        .then((text) => text.replace(/\s+/g, ' '))
        .catch(() => '—')}»`,
      screen: describeShot,
    });
  });

  /**
   * One vocabulary, on a methodology that renames its positions (row `1.4-6`; D-119).
   *
   * `myspec-brownfield-v1` calls the `constitution` position «Proposal» and budgets its interview
   * at two rounds, so it is the graph on which both of the content gaps the red-team found are
   * observable at once: the proceed button, the chip and the card captions used to print the
   * canonical seven beside a pill reading «Proposal», and the panel used to print the environment's
   * three beside a gate that stops at two.
   */
  test('§1.4 — one vocabulary and one budget, on a non-default methodology', async ({
    page,
    context,
  }) => {
    const user = await createSignedInUser('parity-m11-vocabulary');
    await signIn(context, user);

    await startSession(page, IDEA, 'myspec-brownfield-v1');
    const opened = await screen(page, 'brownfield-opened');

    record({
      id: '1.4-6',
      claim: 'методология задаёт, как называется каждая позиция (D-119)',
      observed: `пилюли: «${(await page.getByTestId('step-pills').innerText()).replace(/\s+/g, ' ')}»; кнопка перехода: «${await page
        .getByTestId('proceed')
        .innerText()}»`,
      screen: opened,
    });

    record({
      id: '1.4-7a',
      claim: 'бюджет раундов — свойство методологии (brownfield объявляет два)',
      /*
       * The two numbers off the panel rather than the sentence that frames them (task 143): what
       * the row is about is the budget the gate enforces, and «1 of 3 question rounds» is one
       * wording of it.
       */
      observed: `панель называет: ${
        (await page.getByTestId('interview-panel').getAttribute('data-answered-rounds')) ?? '—'
      } из ${(await page.getByTestId('interview-panel').getAttribute('data-round-budget')) ?? '—'}`,
      screen: opened,
    });

    await page.getByTestId('ask-round').click();
    await expect(page.getByTestId('mcq-card')).toBeVisible({ timeout: 60_000 });
    await page.getByTestId('mcq-option-q-audience-solo-devs').check();
    await page.getByTestId('mcq-option-q-problem-context').check();
    await page.getByTestId('mcq-submit').click();
    await expect(page.getByTestId('round-answered').first()).toBeVisible({ timeout: 60_000 });

    await page.getByTestId('proceed').click();
    await expect(page.locator('[data-state="current"][data-stage="constitution"]')).toBeVisible();
    const moved = await screen(page, 'brownfield-proposal');

    record({
      id: '1.4-6a',
      claim: 'имя методологии доходит до стадийного чипа и подписей карточек',
      observed: `чип: «${(await page.getByTestId('stage-chip').last().innerText()).replace(/\s+/g, ' ')}»; кнопка перехода теперь: «${await page
        .getByTestId('proceed')
        .innerText()}»; блок бандла: «${await page
        .getByTestId('bundle-created')
        .innerText()
        .then((text) => text.replace(/\s+/g, ' '))
        .catch(() => '—')}»`,
      screen: moved,
    });
  });

  test('§1.4 — five methodologies, and step pills drawn from the graph', async ({
    page,
    context,
  }) => {
    const user = await createSignedInUser('parity-m10-graphs');
    await signIn(context, user);

    await page.goto('/projects');
    await expect(page.getByTestId('create-project')).toBeEnabled();
    const pickerShot = await screen(page, 'methodology-picker');

    const offered = await page
      .locator('[data-testid^="methodology-"]')
      .evaluateAll((nodes) =>
        nodes
          .map((node) => node.getAttribute('data-testid') ?? '')
          .filter((id) => id.startsWith('methodology-')),
      );

    record({
      id: '1.4-1',
      claim: 'четыре методологии генерации, названные **полными именами**',
      observed: `пикер предлагает: ${offered.map((id) => `\`${id}\``).join(', ')}; полные имена на поверхности: ${await page
        .locator('[data-testid^="methodology-name-"]')
        .allInnerTexts()
        .then((names) => names.map((name) => `«${name}»`).join(', '))
        .catch(() => '(нет)')}`,
      screen: pickerShot,
    });

    for (const methodology of [
      'myspec-greenfield-v1',
      'myspec-brownfield-v1',
      'speckit-greenfield-v1',
      'openspec-brownfield-v1',
    ]) {
      await startSession(page, IDEA, methodology);

      const pills = await page.getByTestId('step-pills').innerText();
      const shot = await screen(page, `pills-${methodology}`);

      record({
        id: `1.4-2-${methodology}`,
        claim: 'step pills рендерятся из графа выбранной методологии, активный подсвечен',
        observed: `«${pills.replace(/\s+/g, ' ')}»`,
        screen: shot,
      });

      await page.goto('/projects');
      await expect(page.getByTestId('create-project')).toBeEnabled();
    }
  });

  test('§1.5 — theme, loader, toasts, and the connection surface', async ({ page, context }) => {
    const user = await createSignedInUser('parity-m10-visual');
    await signIn(context, user);

    await startSession(page, IDEA, 'myspec-greenfield-v1');

    const before = await page.evaluate(() => document.documentElement.dataset.theme ?? '(none)');
    await page.getByTestId('theme-toggle').click();
    const after = await page.evaluate(() => document.documentElement.dataset.theme ?? '(none)');
    const darkShot = await screen(page, 'theme-toggled');

    await page.reload();
    const survived = await page.evaluate(() => document.documentElement.dataset.theme ?? '(none)');

    record({
      id: '1.5-5',
      claim: 'тема dark/light через localStorage, переживает перезагрузку',
      observed: `было «${before}», стало «${after}», после перезагрузки «${survived}»`,
      screen: darkShot,
    });

    record({
      id: '1.5-6',
      claim:
        'загрузочный экран с анимированным брендовым SVG; тосты; поверхность «Connection lost»',
      observed: (
        await Promise.all(
          ['brand-loader', 'toast-viewport', 'connection-lost'].map(async (id) =>
            page
              .getByTestId(id)
              .count()
              .then((count) => `${id}=${String(count)} (в покое)`),
          ),
        )
      ).join(', '),
      screen: darkShot,
    });
  });
});
