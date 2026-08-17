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
async function attributesOf(page: Page, selector: string): Promise<Record<string, string>> {
  return page.evaluate((css: string) => {
    const element = document.querySelector(css);
    if (element === null) return {};

    return Object.fromEntries([...element.attributes].map((a) => [a.name, a.value]));
  }, selector);
}

test.describe('parity checklist evidence (task 128)', () => {
  test.describe.configure({ mode: 'serial', timeout: 240_000 });
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

    const seedAttributes = await attributesOf(page, '[data-msg-role="user"]');
    record({
      id: '1.1-3',
      claim:
        'каждое сообщение несёт data-msg-id, data-msg-role, data-msg-stage, data-msg-substage, data-msg-snippet',
      observed: `у сообщения пользователя: ${Object.keys(seedAttributes)
        .filter((name) => name.startsWith('data-'))
        .map((name) => `\`${name}\``)
        .join(', ')}`,
      screen: seeded,
    });

    record({
      id: '1.2-1',
      claim: 'seed-сообщение шаблонное: «I want to build {название}. My project description is: …»',
      observed: `первое сообщение ленты: «${(
        await page.getByTestId('session-prompt-line').first().innerText()
      )
        .replace(/\s+/g, ' ')
        .slice(0, 120)}»`,
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

    const card = await page.getByTestId('mcq-card').innerText();
    record({
      id: '1.1-5',
      claim:
        'у вопроса — текст, красная звёздочка обязательности, подпись «Select one» / «Select all that apply»',
      observed: `в карточке встречается: ${['*', 'Select one', 'Select all that apply']
        .filter((needle) => card.includes(needle))
        .map((needle) => `«${needle}»`)
        .join(', ')}`,
      screen: roundShot,
    });

    record({
      id: '1.1-6',
      claim: 'опция = радио/чекбокс + название + пометка (Recommended) + однострочное описание',
      observed: card.includes('(Recommended)')
        ? 'пометка «(Recommended)» присутствует в карточке'
        : 'пометки «(Recommended)» в этой карточке нет (стаб не помечает)',
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

    await page.getByTestId('proceed').click();
    await expect(page.locator('[data-state="current"][data-stage="constitution"]')).toBeVisible();

    /* --------------------------------------------------------- §1.1 the stage chip */

    const chipShot = await screen(page, 'stage-chip');
    const chip = await page
      .getByTestId('stage-chip')
      .first()
      .innerText()
      .catch(() => '(нет чипа)');
    record({
      id: '1.1-10',
      claim:
        'стадийный чип по центру ленты: «Constitution · Collecting ──▶ Constitution · Generating»',
      observed: `первый чип ленты: «${chip.replace(/\s+/g, ' ')}»`,
      screen: chipShot,
    });

    /* ----------------------------------------------------- §1.1 the document card */

    await page.getByTestId('ask-round').click();
    await expect(page.getByTestId('mcq-card')).toBeVisible({ timeout: 60_000 });
    await page.getByTestId('mcq-option-q-constitution-scope-strict').check();
    await page.getByTestId('mcq-submit').click();
    await expect(page.getByTestId('interview-panel')).toBeVisible();
    await page.getByTestId('proceed').click();
    await expect(page.getByTestId('stage-substage')).toHaveText(/Generating/);

    await page.getByTestId('generate-spec').click();
    await expect(page.getByTestId('spec-card')).toBeVisible({ timeout: 60_000 });
    const documentShot = await screen(page, 'document-card');

    record({
      id: '1.1-11',
      claim:
        'карточка документа: название стадии, путь specs/<bundle>/constitution.md (моно), бейдж Approved, Rev N со второй ревизии, кнопка Preview',
      observed: `путь: «${await page.getByTestId('document-path').first().innerText()}»; ревизия: «${await page
        .getByTestId('document-revision')
        .first()
        .innerText()
        .catch(() => '—')}»; кнопка предпросмотра: ${String(
        await page.getByTestId('document-preview-toggle').count(),
      )}`,
      screen: documentShot,
    });

    await page.getByTestId('approve-spec').click();
    await expect(page.getByTestId('spec-card')).toContainText('approved');
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

    const board = await page.getByTestId('review-board').innerText();

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
        'пункт: чекбокс · «Секция — подсекция» · Confidence score X/10 с тултипом · проблема · курсивное «Suggestion: …»',
      observed: `в доске встречается: ${['Confidence', 'Suggestion']
        .filter((needle) => board.includes(needle))
        .map((needle) => `«${needle}»`)
        .join(', ')}`,
      screen: boardShot,
    });

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

    record({
      id: '1.2-4',
      claim:
        'свободный чат работает в любой точке; ответ приходит тем же чатом с data-msg-substage="review", стадия не ломается',
      observed: `ответ несёт stage=«${replyAttributes['data-msg-stage'] ?? '—'}», substage=«${
        replyAttributes['data-msg-substage'] ?? '—'
      }»; доска ревью на месте: ${String(await page.getByTestId('review-board').count())}`,
      screen: chatShot,
    });

    const alignment = await page.evaluate(() => {
      const classesOf = (role: string): string =>
        document.querySelector(`[data-msg-role="${role}"]`)?.getAttribute('class') ?? '';

      return { user: classesOf('user'), ai: classesOf('assistant') };
    });

    record({
      id: '1.1-2',
      claim:
        'пузырь пользователя справа (rounded-2xl rounded-tl-sm, приглушённый фон), проза ИИ слева',
      observed: `у блока пользователя выравнивание «${
        alignment.user.includes('justify-end') ? 'justify-end (справа)' : alignment.user
      }», у блока ИИ «${alignment.ai.includes('justify-end') ? 'justify-end' : 'по левому краю'}»`,
      screen: chatShot,
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

    record({
      id: '1.2-5',
      claim: 'после Interview создаётся бандл («Project bundle created: …»), имя из описания',
      observed: `имя бандла в панели завершения: «${await page
        .getByTestId('completion-bundle')
        .innerText()}»`,
      screen: completeShot,
    });

    record({
      id: '1.1-13',
      claim:
        'финал ленты: панель Session completed (Bundle: имя — N spec files generated; Edit, Download)',
      observed: `бандл: «${await page.getByTestId('completion-bundle').innerText()}»; файлов: «${await page
        .getByTestId('completion-file-count')
        .innerText()}»; кнопки: ${['completion-edit', 'completion-download']
        .map((id) => `\`${id}\``)
        .join(', ')}`,
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

    record({
      id: '1.5-2',
      claim: 'композер: attach, @-ссылки на файлы, slash-команды, пикер модели, отправка',
      observed: `${(
        await Promise.all(
          ['attachment-input', 'model-picker', 'chat-send'].map(async (id) =>
            page
              .getByTestId(id)
              .count()
              .then((count) => `${id}=${String(count)}`),
          ),
        )
      ).join(', ')}; меню слэш-команд по «/»: ${slashVisible ? 'открывается' : 'не открылось'}`,
      screen: completeShot,
    });

    await page
      .getByTestId('sidebar-toggle')
      .click()
      .catch(() => undefined);
    const sidebarShot = await screen(page, 'sidebar');
    record({
      id: '1.5-3',
      claim: 'сайдбар (resizable ~280px): Specs, Local Workspace (Mount folder), Attachments',
      observed: (
        await Promise.all(
          [
            'specs-panel',
            'local-workspace',
            'mount-folder',
            'attachments-panel',
            'sidebar-resize',
          ].map(async (id) =>
            page
              .getByTestId(id)
              .count()
              .then((count) => `${id}=${String(count)}`),
          ),
        )
      ).join(', '),
      screen: sidebarShot,
    });

    await page.goto(`/projects/${projectId}`);
    await expect(page.getByTestId('project-page')).toBeVisible();
    const projectShot = await screen(page, 'project-page');

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
        .catch(() => '(поля нет)')}»`,
      screen: describeShot,
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
      claim: 'четыре методологии генерации = четыре конфигурации графа (+ Auto)',
      observed: `пикер предлагает: ${offered.map((id) => `\`${id}\``).join(', ')}`,
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
