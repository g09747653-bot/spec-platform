import { expect, test, type Page } from '@playwright/test';

import { createSignedInUser, signIn } from './fixtures/auth';
import { completeInterview, completeStage, reachDrafting, startSession } from './fixtures/journey';

/**
 * The application shell (tasks 136, 137, 141).
 *
 * The two tests at the top are the customer's own reproductions, written down so they can never come
 * back: a sidebar that collapses and will not come back, and a composer squashed into a vertical
 * strip one letter wide. Everything after them is the frame those two defects came out of — a
 * surface that scrolled as one long page, capped at a text-page width, with its controls riding the
 * conversation out of reach.
 */

/** The width of a control, or 0 when it is not on the page. */
async function widthOf(page: Page, testId: string): Promise<number> {
  const box = await page.getByTestId(testId).boundingBox();

  return Math.round(box?.width ?? 0);
}

async function documentScrolls(page: Page): Promise<{ x: boolean; y: boolean }> {
  return page.evaluate(() => {
    const root = document.documentElement;

    return {
      x: root.scrollWidth > root.clientWidth,
      y: root.scrollHeight > root.clientHeight,
    };
  });
}

test.describe('the session shell', () => {
  test('the sidebar collapses, comes back, and remembers which it was (task 136)', async ({
    page,
    context,
  }) => {
    await signIn(context, await createSignedInUser('shell'));
    await page.setViewportSize({ width: 1280, height: 800 });

    await startSession(page, 'A tool whose sidebar can be collapsed and restored');
    await reachDrafting(page);

    const expanded = await widthOf(page, 'sidebar-panel');
    expect(expanded).toBeGreaterThan(200);

    await page.getByTestId('sidebar-toggle').click();
    await expect(page.getByTestId('session-sidebar')).toHaveAttribute('data-collapsed', 'true');
    await expect(page.getByTestId('sidebar-panel')).toBeHidden();

    /*
     * The heart of the report. The toggle used to live at the top of a column as tall as the
     * conversation, so the second press was not a press anybody could make. It is in the pinned
     * header now, and this asserts the property that makes that matter: it is on screen and usable
     * *after* the collapse, without scrolling anything.
     */
    await expect(page.getByTestId('sidebar-toggle')).toBeInViewport();
    await page.getByTestId('sidebar-toggle').click();

    await expect(page.getByTestId('session-sidebar')).toHaveAttribute('data-collapsed', 'false');
    expect(await widthOf(page, 'sidebar-panel')).toBe(expanded);

    // Collapsed is a preference, so a reload keeps it rather than quietly undoing it.
    await page.getByTestId('sidebar-toggle').click();
    await page.reload();
    await expect(page.getByTestId('session')).toBeVisible();
    await expect(page.getByTestId('session-sidebar')).toHaveAttribute('data-collapsed', 'true');

    await page.getByTestId('sidebar-toggle').click();
    await expect(page.getByTestId('sidebar-panel')).toBeVisible();
  });

  test('the collapse control stays reachable on a long conversation (task 136)', async ({
    page,
    context,
  }) => {
    await signIn(context, await createSignedInUser('shell'));
    await page.setViewportSize({ width: 1280, height: 800 });

    await startSession(page, 'A tool with a long conversation');
    await completeInterview(page);
    await completeStage(page, 'constitution');

    // Long enough that the conversation scrolls: the state the customer was in when they pressed it.
    await page.getByTestId('feed-scroll').evaluate((node) => {
      node.scrollTo({ top: node.scrollHeight });
    });

    await expect(page.getByTestId('sidebar-toggle')).toBeInViewport();
    await expect(page.getByTestId('composer')).toBeInViewport();

    await page.getByTestId('sidebar-toggle').click();
    await expect(page.getByTestId('session-sidebar')).toHaveAttribute('data-collapsed', 'true');
    await expect(page.getByTestId('sidebar-toggle')).toBeInViewport();
  });

  test('the message box keeps a usable width at every viewport and sidebar width (task 136)', async ({
    page,
    context,
  }) => {
    await signIn(context, await createSignedInUser('shell'));
    await page.setViewportSize({ width: 1280, height: 800 });

    await startSession(page, 'A tool whose composer cannot be squashed');
    await reachDrafting(page);

    /*
     * The failing configuration, exactly: the sidebar dragged to the widest value the control has
     * ever offered. The box measured 46 pixels — «Ask anything» rendered one letter per line —
     * because a textarea scrolls its own content, so its automatic minimum size is zero, and it
     * absorbed every pixel the row was short. It now has a row to itself.
     */
    for (const stored of ['300', '5600']) {
      await page.evaluate((value) => {
        window.localStorage.setItem('spec-platform:sidebar-width', value);
      }, stored);
      await page.reload();
      await expect(page.getByTestId('composer')).toBeVisible();

      for (const width of [1280, 1536, 1920]) {
        await page.setViewportSize({ width, height: 800 });

        const box = await widthOf(page, 'chat-message');
        expect(box, `message box at ${String(width)}px with width=${stored}`).toBeGreaterThan(420);

        const scroll = await documentScrolls(page);
        expect(scroll.x, `horizontal scroll at ${String(width)}px`).toBe(false);
      }
    }
  });

  /*
   * The sibling the audit found (task 136). «Answer in your own words instead» opened the free-text
   * box and nothing put it away again — the same shape as the collapse the customer reported, on a
   * card in the middle of every interview. Found by walking every toggle on the surface rather than
   * by meeting it.
   */
  test('every disclosure on the round card can be closed again (task 136)', async ({
    page,
    context,
  }) => {
    await signIn(context, await createSignedInUser('shell'));
    await page.setViewportSize({ width: 1280, height: 800 });

    await startSession(page, 'A tool whose disclosures are two-way');
    await expect(page.getByTestId('interview-panel')).toBeVisible();
    await page.getByTestId('ask-round').click();
    await expect(page.getByTestId('mcq-card')).toBeVisible();

    await page.getByTestId('mcq-reply-toggle').click();
    await expect(page.getByTestId('mcq-reply-text')).toBeVisible();

    await page.getByTestId('mcq-reply-text').fill('a paragraph I would rather not lose');
    await page.getByTestId('mcq-reply-cancel').click();

    await expect(page.getByTestId('mcq-reply-text')).toHaveCount(0);
    await expect(page.getByTestId('mcq-reply-toggle')).toBeVisible();

    // And back again, with what was typed still there.
    await page.getByTestId('mcq-reply-toggle').click();
    await expect(page.getByTestId('mcq-reply-text')).toHaveValue(
      'a paragraph I would rather not lose',
    );
  });

  test('the page does not scroll — the panes do (task 141)', async ({ page, context }) => {
    await signIn(context, await createSignedInUser('shell'));
    await page.setViewportSize({ width: 1280, height: 800 });

    await startSession(page, 'A tool that behaves like an application');
    await completeInterview(page);
    await completeStage(page, 'constitution');

    const scroll = await documentScrolls(page);
    expect(scroll.y, 'the page itself scrolled').toBe(false);
    expect(scroll.x, 'the page scrolled sideways').toBe(false);

    // The conversation is what scrolls, and it is long enough here to prove it.
    const feed = await page.getByTestId('feed-scroll').evaluate((node) => ({
      scrollHeight: node.scrollHeight,
      clientHeight: node.clientHeight,
    }));
    expect(feed.scrollHeight).toBeGreaterThan(feed.clientHeight);

    await page.getByTestId('feed-scroll').evaluate((node) => {
      node.scrollTo({ top: node.scrollHeight });
    });
    // Scrolling the conversation moves nothing else: the header and composer are pinned.
    await expect(page.getByTestId('session-project-name')).toBeInViewport();
    await expect(page.getByTestId('chat-send')).toBeInViewport();
  });

  test('it is fully operable at 1000×700 (task 141)', async ({ page, context }) => {
    await signIn(context, await createSignedInUser('shell'));
    await page.setViewportSize({ width: 1000, height: 700 });

    await startSession(page, 'A tool that works on a small window');
    await reachDrafting(page);

    const scroll = await documentScrolls(page);
    expect(scroll.x, 'horizontal scroll at 1000×700').toBe(false);
    expect(scroll.y, 'page scroll at 1000×700').toBe(false);

    // The controls that move the session are all reachable without a sideways scroll.
    for (const control of ['chat-message', 'chat-send', 'sidebar-toggle', 'generate-spec']) {
      await expect(page.getByTestId(control), control).toBeInViewport();
    }

    expect(await widthOf(page, 'chat-message')).toBeGreaterThan(360);
  });

  test('the sidebar resizes, by pointer and by keyboard (task 137)', async ({ page, context }) => {
    await signIn(context, await createSignedInUser('shell'));
    await page.setViewportSize({ width: 1440, height: 900 });

    await startSession(page, 'A tool whose sidebar can be resized');
    await reachDrafting(page);

    const before = await widthOf(page, 'sidebar-panel');

    const handle = page.getByTestId('sidebar-resize');
    const box = await handle.boundingBox();
    if (box === null) throw new Error('the resize handle has no box to drag');

    await page.mouse.move(box.x + 2, box.y + 40);
    await page.mouse.down();
    await page.mouse.move(box.x - 80, box.y + 40, { steps: 8 });
    await page.mouse.up();

    const wider = await widthOf(page, 'sidebar-panel');
    expect(wider).toBeGreaterThan(before);

    // And by keyboard, because a resize only a mouse can do is half a control.
    await handle.focus();
    await handle.press('ArrowRight');
    await handle.press('ArrowRight');
    expect(await widthOf(page, 'sidebar-panel')).toBeLessThan(wider);

    // Whatever it is dragged to, the conversation keeps the greater part of the frame.
    const feed = await widthOf(page, 'composer');
    expect(feed).toBeGreaterThan(await widthOf(page, 'sidebar-panel'));

    // The width is a device preference and survives a reload.
    const settled = await widthOf(page, 'sidebar-panel');
    await page.reload();
    await expect(page.getByTestId('sidebar-panel')).toBeVisible();
    expect(await widthOf(page, 'sidebar-panel')).toBe(settled);
  });

  test('the keyboard shortcuts work, and the application says what they are (task 141)', async ({
    page,
    context,
  }) => {
    await signIn(context, await createSignedInUser('shell'));
    await page.setViewportSize({ width: 1280, height: 800 });

    await startSession(page, 'A tool that can be driven from the keyboard');
    await reachDrafting(page);

    // The list, from the button in the header and from the key.
    await page.getByTestId('shortcuts-open').click();
    await expect(page.getByTestId('shortcuts-dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('shortcuts-dialog')).toBeHidden();

    await page.keyboard.press('?');
    await expect(page.getByTestId('shortcuts-dialog')).toBeVisible();

    /*
     * Every documented shortcut is a row, and every row is exercised below. A list that promised a
     * key nothing performs would be worse than no list.
     */
    const listed = await page
      .getByTestId('shortcut-row')
      .evaluateAll((rows) => rows.map((row) => row.getAttribute('data-shortcut')));
    expect(listed).toEqual(
      expect.arrayContaining([
        'shortcuts',
        'toggle-sidebar',
        'focus-composer',
        'slash',
        'open-viewer',
        'view-outline',
        'view-preview',
        'view-raw',
        'view-diff',
        'close',
        'send',
      ]),
    );
    await page.keyboard.press('Escape');

    // B collapses and restores.
    await page.keyboard.press('b');
    await expect(page.getByTestId('session-sidebar')).toHaveAttribute('data-collapsed', 'true');
    await page.keyboard.press('b');
    await expect(page.getByTestId('session-sidebar')).toHaveAttribute('data-collapsed', 'false');

    // C puts the caret in the message box; a letter typed there is then a letter, not a shortcut.
    await page.keyboard.press('c');
    await expect(page.getByTestId('chat-message')).toBeFocused();
    await page.keyboard.type('bb');
    await expect(page.getByTestId('chat-message')).toHaveValue('bb');
    await expect(page.getByTestId('session-sidebar')).toHaveAttribute('data-collapsed', 'false');

    // Ctrl+Enter sends, from inside the box.
    await page.getByTestId('chat-message').fill('does the keyboard send?');
    await page.keyboard.press('Control+Enter');
    await expect(page.getByTestId('chat-message')).toHaveValue('');

    // `/` from outside the box opens the command menu.
    await page.getByTestId('feed').click({ position: { x: 5, y: 5 } });
    await page.keyboard.press('/');
    await expect(page.getByTestId('slash-menu')).toBeVisible();
  });
});
