import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { documentMetrics, lineCount, linesOf, newlineCount } from './metrics';

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

  /**
   * The property the Raw pane's markup rests on (task 147): the line spans put together are the
   * file, character for character. If this fails, Copy and Download still agree with the endpoint —
   * they never read the DOM — but the pane on screen is no longer showing the bytes they hand over,
   * which is the whole claim of a Raw view.
   */
  it('splits into lines that put the document back together exactly', () => {
    const cases = ['', 'one line', 'one line\n', 'one\ntwo', 'a\n\nb\n', 'a\r\nb\r\n', '\n\n\n'];

    for (const content of cases) {
      expect(linesOf(content).join(''), JSON.stringify(content)).toBe(content);
      expect(linesOf(content).length, JSON.stringify(content)).toBe(lineCount(content));
    }

    // A blank line is a line: it is numbered, and it carries the newline that made it blank.
    expect(linesOf('a\n\nb')).toEqual(['a\n', '\n', 'b']);
    // The carriage return belongs to the line the file put it on, not to the split.
    expect(linesOf('a\r\nb')).toEqual(['a\r\n', 'b']);
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
