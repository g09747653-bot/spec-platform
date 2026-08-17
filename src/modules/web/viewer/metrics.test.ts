import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { documentMetrics, lineCount, newlineCount } from './metrics';

/**
 * The viewer's counts (task 138 AC — «counts match `wc -l`/word count of the exported bytes»).
 *
 * The interesting half is the boundary case, and it is the one that makes the AC precise: `wc -l`
 * counts newline *characters*, so a file whose last line has no newline reports one fewer line than
 * a reader — or a line-number gutter — counts. Both numbers are computed here, from one function
 * each, and the relationship between them is asserted rather than assumed.
 */
const DOCUMENT = ['# Constitution', '', 'The bundle is the product.', ''].join('\n');

describe('documentMetrics', () => {
  it('counts the lines a reader counts', () => {
    expect(lineCount(DOCUMENT)).toBe(3);
    // The Raw gutter numbers exactly these.
    expect(documentMetrics(DOCUMENT).lines).toBe(3);
  });

  it('counts words the way `wc -w` does', () => {
    expect(documentMetrics(DOCUMENT).words).toBe(7);
    expect(documentMetrics('  spaced   out \n\n words ').words).toBe(3);
  });

  it('is zero on an empty document rather than one empty line', () => {
    expect(documentMetrics('')).toEqual({ lines: 0, words: 0, characters: 0 });
  });

  it('equals `wc -l` for a file that ends with a newline, and exceeds it by one for a file that does not', () => {
    expect(newlineCount(DOCUMENT)).toBe(3);
    expect(lineCount(DOCUMENT)).toBe(newlineCount(DOCUMENT));

    const unterminated = 'one\ntwo';
    expect(newlineCount(unterminated)).toBe(1);
    expect(lineCount(unterminated)).toBe(2);
  });

  it('agrees with the real `wc` on this machine, where there is one', () => {
    const directory = mkdtempSync(join(tmpdir(), 'spec-metrics-'));
    const file = join(directory, 'document.md');
    writeFileSync(file, DOCUMENT, 'utf8');

    let counted: string;
    try {
      counted = execFileSync('wc', ['-lw', file], { encoding: 'utf8' });
    } catch {
      // No `wc` (a bare Windows runner). The arithmetic above stands on its own.
      return;
    }

    const [lines, words] = counted.trim().split(/\s+/u).map(Number);
    expect(lines).toBe(newlineCount(DOCUMENT));
    expect(words).toBe(documentMetrics(DOCUMENT).words);
  });
});
