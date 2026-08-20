import type { Page } from '@playwright/test';

/**
 * A reload Gecko may abort, retried once (D-276's other half).
 *
 * **The same event, one layer down.** D-276 was about a browser's *console* wording for an aborted
 * request; this is about the abort landing on the navigation itself. Firefox answers
 * `page.reload()` with `NS_BINDING_ABORTED; maybe frame was detached?` when a request is still open
 * as the navigation starts — and the request need not be one the test knows about: a suite that
 * waits for its own `fetch` to settle can still be reloading while the page's event stream, a
 * prefetch or Next's own router request is in flight.
 *
 * A retry is the honest response and it weakens nothing: the reload still happens, and the state the
 * case asserts afterwards is asserted against the page the reload produced. What it removes is a
 * verdict that depended on which engine translated a cancelled request into a thrown error — the
 * same defect D-276 named, and the reason `bug-hunt-M12.spec.ts` had been red on Firefox
 * intermittently since the engine matrix split (А-15), including on `main`.
 *
 * Only the abort is retried. Any other failure of a reload is the product's, and is thrown.
 */
export async function reloadSettled(page: Page): Promise<void> {
  try {
    await page.reload();
    return;
  } catch (error) {
    if (!/NS_BINDING_ABORTED|frame was detached/i.test(String(error))) throw error;
  }

  await page.reload();
}
