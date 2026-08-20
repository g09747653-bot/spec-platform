import { expect, test, type Page } from '@playwright/test';

/**
 * The dashboard and its live feed (task 153).
 *
 * The acceptance criterion is a *browser* claim and cannot be made anywhere else: a line the
 * orchestrator emits has to appear on an already-open page, without that page asking for it. The
 * only way to know the page did not ask is to watch the requests it makes — so the case counts them.
 */

const PROJECT = 'e2e-loop-project';

test.beforeEach(async ({ request }) => {
  const response = await request.post('/api/harness', {
    data: {
      action: 'seed',
      projectId: PROJECT,
      title: 'Тестовый проект контура',
      milestones: [
        {
          milestoneId: 'ms_01',
          title: 'Каркас',
          dependsOn: [],
          tasks: [
            { taskId: 'task_1', title: 'Инициализировать репозиторий', dependsOn: [] },
            { taskId: 'task_2', title: 'Схема базы', dependsOn: ['task_1'] },
          ],
        },
        {
          milestoneId: 'ms_02',
          title: 'Ядро',
          dependsOn: ['ms_01'],
          tasks: [{ taskId: 'task_3', title: 'Репозиторий заметок', dependsOn: ['task_2'] }],
        },
      ],
    },
  });

  expect(response.ok()).toBe(true);
});

test('shows the project, its milestones and its tasks, in Russian', async ({ page }) => {
  await page.goto('/');

  await expect(page.locator('html')).toHaveAttribute('lang', 'ru');
  await expect(page.getByTestId('project-title')).toHaveText('Тестовый проект контура');
  await expect(page.getByTestId('milestone')).toHaveCount(2);
  await expect(page.getByTestId('task')).toHaveCount(3);
  await expect(page.getByTestId('task-total')).toHaveText('3');

  // Statuses are words the operator reads, not the tokens the database stores.
  await expect(page.getByText('Ожидает').first()).toBeVisible();
  await expect(page.getByText('В работе').first()).toBeVisible();
  await expect(page.locator('body')).not.toContainText('IN_PROGRESS');
  await expect(page.locator('body')).not.toContainText('PENDING');

  // Dependencies are on screen: the loop's whole ordering argument is invisible without them.
  await expect(page.getByTestId('task').filter({ hasText: 'Схема базы' })).toContainText(
    'Ждёт: task_1',
  );
});

test('has no authentication surface at all', async ({ page, request }) => {
  await page.goto('/');

  await expect(page.locator('body')).not.toContainText(/войти|вход|sign in|log in/i);
  await expect(page.locator('form')).toHaveCount(0);
  await expect(page.locator('input[type="password"]')).toHaveCount(0);

  // Nothing that a signed-out visitor would be bounced to, because there is no such notion here.
  expect((await request.get('/signin')).status()).toBe(404);
  expect((await request.get('/api/auth/session')).status()).toBe(404);
});

test('a line the orchestrator emits reaches an open page, with no request from the page', async ({
  page,
  request,
}) => {
  await page.goto('/');
  await expect(page.getByTestId('feed-state')).toHaveAttribute('data-live', 'yes');

  const before = await countFeedLines(page);

  /*
   * Every request the page makes from here on, counted by URL predicate rather than by glob —
   * Next's own navigations carry a `?_rsc=` query that a glob silently misses.
   */
  const requested: string[] = [];
  page.on('request', (call) => {
    const url = new URL(call.url());
    if (url.pathname !== '/api/observability/stream-logs') requested.push(call.url());
  });

  const emitted = 'оркестратор: задача task_1 принята в работу';
  const response = await request.post('/api/harness', {
    data: { action: 'log', projectId: PROJECT, message: emitted, agentRole: 'ORCHESTRATOR' },
  });
  expect(response.ok()).toBe(true);

  // The line arrives on the page that was already open.
  await expect(page.getByTestId('feed-line')).toHaveCount(before + 1);
  await expect(page.getByTestId('feed').getByText(emitted)).toBeVisible();

  // And the page asked for nothing: no reload, no poll, no refetch. The stream did the work.
  expect(requested).toEqual([]);
});

test('an error line is marked as one, and the level survives the stream', async ({
  page,
  request,
}) => {
  await page.goto('/');
  await expect(page.getByTestId('feed-state')).toHaveAttribute('data-live', 'yes');
  const before = await countFeedLines(page);

  await request.post('/api/harness', {
    data: {
      action: 'log',
      projectId: PROJECT,
      message: 'красный CI: приёмочные тесты упали',
      agentRole: 'CONTROLLER',
      logLevel: 'ERROR',
    },
  });

  await expect(page.getByTestId('feed-line')).toHaveCount(before + 1);
  await expect(page.getByTestId('feed-line').last()).toHaveAttribute('data-level', 'ERROR');
  await expect(page.getByTestId('feed-line').last()).toContainText('CONTROLLER');
});

test('the feed follows its tail once there are more lines than fit', async ({ page, request }) => {
  /*
   * The live gate walk found this and photographed it: three minutes into an autonomous run, with
   * several hundred lines in the DOM, the panel was still showing the first second of the intake.
   * The sentinel that `scrollIntoView` was called on sat outside the scrolling list, so the page
   * moved and the list never did — and the one window an unattended run has onto itself was frozen
   * on the oldest thing it ever saw.
   */
  await page.goto('/');
  await expect(page.getByTestId('feed-state')).toHaveAttribute('data-live', 'yes');

  const before = await countFeedLines(page);

  for (let index = 0; index < 60; index += 1) {
    await request.post('/api/harness', {
      data: { action: 'log', projectId: PROJECT, message: `строка ленты №${String(index)}` },
    });
  }

  await expect(page.getByTestId('feed-line')).toHaveCount(before + 60);

  const scroll = await page.getByTestId('feed').evaluate((list) => ({
    top: list.scrollTop,
    height: list.scrollHeight,
    visible: list.clientHeight,
  }));

  // The list really does overflow — otherwise the case would pass without asserting anything.
  expect(scroll.height).toBeGreaterThan(scroll.visible);
  // And it is parked at the bottom, within a line's height of it.
  expect(scroll.height - (scroll.top + scroll.visible)).toBeLessThanOrEqual(40);

  await expect(page.getByTestId('feed-line').last()).toBeInViewport();
});

test('a reload keeps the tail rather than starting from nothing', async ({ page, request }) => {
  await request.post('/api/harness', {
    data: { action: 'log', projectId: PROJECT, message: 'строка до перезагрузки' },
  });

  await page.goto('/');
  await expect(page.getByTestId('feed').getByText('строка до перезагрузки')).toBeVisible();

  await page.reload();
  await expect(page.getByTestId('feed').getByText('строка до перезагрузки')).toBeVisible();

  // Reconnecting replays a tail that overlaps what is already rendered. Once, not twice.
  await expect(page.getByTestId('feed').getByText('строка до перезагрузки')).toHaveCount(1);
});

test('cold start reaches an interactive page within three seconds', async ({ page }) => {
  /*
   * The bound of the A0 success criteria, measured the way an operator experiences it: from the
   * navigation to a page whose feed is connected — that is, a page that is showing the state loaded
   * from SQLite and is already receiving what happens next. A page that had painted but not attached
   * would satisfy a weaker reading and would still leave the operator watching a dead feed.
   */
  const started = Date.now();

  await page.goto('/');
  await expect(page.getByTestId('project-title')).toBeVisible();
  await expect(page.getByTestId('feed-state')).toHaveAttribute('data-live', 'yes');

  const elapsed = Date.now() - started;
  expect(elapsed, `холодный старт занял ${String(elapsed)} мс`).toBeLessThanOrEqual(3_000);
});

async function countFeedLines(page: Page): Promise<number> {
  return page.getByTestId('feed-line').count();
}

/**
 * The stop state and the one control that lifts it (task 160).
 *
 * The freeze is produced by the production function through the harness, so what the page renders is
 * a real marker — the same bytes a red acceptance verdict writes — rather than a fixture shaped like
 * one. What the browser proves is the half nothing else can: that an operator who opens a frozen
 * dashboard is told which task went red and why **before** they touch anything, and that the only
 * control which resumes the pipeline is a button they have to press.
 */
test('a frozen pipeline says so on the dashboard, with the reason and one way on', async ({
  page,
  request,
}) => {
  const frozen = await request.post('/api/harness', {
    data: {
      action: 'freeze',
      projectId: PROJECT,
      taskId: 'task_2',
      reason: 'Приёмочный прогон «npm test» в чистом контейнере вернул 1 — задача не принята.',
      paused: ['task_3'],
    },
  });
  expect(frozen.ok()).toBe(true);

  await page.goto('/');

  const banner = page.getByTestId('freeze-banner');
  await expect(banner).toBeVisible();
  await expect(banner).toContainText('Конвейер заморожен');
  await expect(page.getByTestId('freeze-reason')).toContainText('чистом контейнере вернул 1');
  await expect(page.getByTestId('freeze-detail')).toContainText('task_2');
  await expect(page.getByTestId('freeze-paused')).toHaveText('1');

  // The board agrees: the paused task is paused, in the operator's own words.
  await expect(page.getByTestId('task').filter({ hasText: 'Репозиторий заметок' })).toContainText(
    'Приостановлена',
  );

  // Pressing it lifts the freeze, and the banner goes with it.
  await page.getByTestId('retry-pipeline').click();
  await expect(page.getByTestId('freeze-banner')).toHaveCount(0);
  await expect(page.getByTestId('retry-error')).toHaveCount(0);
});

test('an unfrozen dashboard carries no stop state at all', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByTestId('freeze-banner')).toHaveCount(0);
  await expect(page.getByTestId('retry-pipeline')).toHaveCount(0);
});
