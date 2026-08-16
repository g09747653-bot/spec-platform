import { readFile } from 'node:fs/promises';

import { strFromU8, unzipSync } from 'fflate';
import { expect, type Page } from '@playwright/test';

/**
 * Capturing a download and reading what is inside it (task 79).
 *
 * Every assertion about an export in this suite reads the **produced archive** rather than the
 * interface's description of it. That is the point of the helper: FR-015 is a set of claims about a
 * ZIP a person receives — its names, its contents, and what is *not* in it — and only the file can
 * answer them. A test that trusted the panel would pass against an export that said one thing and
 * shipped another, which is precisely the ambiguity constitution A6 exists to remove.
 */
export interface CapturedArchive {
  /** Entry names, in the order the archive lists them. */
  names: string[];
  /** Entry name → its text content. */
  entries: Record<string, string>;
}

/**
 * Clicks a download control and returns the archive it produced.
 *
 * `control` exists because task 126 added a second one: the completion panel's Download must produce
 * the same archive as the export panel's, and the way to assert that is to capture both with the
 * same helper and compare the files. It defaults to the export panel, which is what every caller
 * written before that meant.
 */
export async function downloadBundle(
  page: Page,
  control = 'download-export',
): Promise<CapturedArchive> {
  const download = await Promise.all([
    page.waitForEvent('download'),
    page.getByTestId(control).click(),
  ]).then(([event]) => event);

  const path = await download.path();
  expect(path, 'the download produced no file').not.toBeNull();

  const archive = unzipSync(new Uint8Array(await readFile(path)));

  return {
    names: Object.keys(archive),
    entries: Object.fromEntries(
      Object.entries(archive).map(([name, bytes]) => [name, strFromU8(bytes)]),
    ),
  };
}
