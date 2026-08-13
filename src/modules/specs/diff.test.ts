import { describe, expect, it } from 'vitest';

import { diffLines, formatUnifiedDiff } from './diff';

/**
 * Task 59 — the diff, which the accept/reject decision is taken on.
 *
 * The property that matters is not prettiness: it is that the diff **describes the actual change**.
 * A diff that shows too little would have the user accepting edits they never saw, so the tests are
 * mostly about reconstruction — apply what the diff says and the proposed text comes back.
 */
const lines = (...values: string[]) => values.join('\n');

/** Rebuilds the proposed text from the diff's own line tags, to prove it describes the change. */
const reconstruct = (before: string, after: string): string => {
  const diff = diffLines(before, after);
  if (diff.identical) return before;

  // Every line of the "after" side, taken from context and added lines, in order.
  const beforeLines = before.split('\n');
  const result: string[] = [];
  let cursor = 0;

  for (const hunk of diff.hunks) {
    // Lines before this hunk are unchanged.
    while (cursor < hunk.oldStart - 1) {
      result.push(beforeLines[cursor] ?? '');
      cursor += 1;
    }

    for (const line of hunk.lines) {
      if (line.op === 'remove') cursor += 1;
      else if (line.op === 'add') result.push(line.text);
      else {
        result.push(line.text);
        cursor += 1;
      }
    }
  }

  while (cursor < beforeLines.length) {
    result.push(beforeLines[cursor] ?? '');
    cursor += 1;
  }

  return result.join('\n');
};

describe('diffLines (task 59)', () => {
  it('reports identical text as identical, with nothing to decide', () => {
    const diff = diffLines('# A\n\nSame', '# A\n\nSame');

    expect(diff.identical).toBe(true);
    expect(diff.hunks).toEqual([]);
    expect(diff.added).toBe(0);
    expect(diff.removed).toBe(0);
  });

  it('treats a trailing-newline difference as a change, because it is one', () => {
    expect(diffLines('# A', '# A\n').identical).toBe(false);
  });

  it('counts a single changed line as one added and one removed', () => {
    const diff = diffLines(lines('a', 'b', 'c'), lines('a', 'B', 'c'));

    expect(diff.added).toBe(1);
    expect(diff.removed).toBe(1);
  });

  it('counts a pure insertion as added only', () => {
    const diff = diffLines(lines('a', 'c'), lines('a', 'b', 'c'));

    expect(diff.added).toBe(1);
    expect(diff.removed).toBe(0);
  });

  it('counts a pure deletion as removed only', () => {
    const diff = diffLines(lines('a', 'b', 'c'), lines('a', 'c'));

    expect(diff.added).toBe(0);
    expect(diff.removed).toBe(1);
  });

  it('numbers lines on both sides so the card can point at them', () => {
    const diff = diffLines(lines('a', 'b', 'c'), lines('a', 'B', 'c'));
    const changed = diff.hunks
      .flatMap((hunk) => hunk.lines)
      .filter((line) => line.op !== 'context');

    expect(changed.find((line) => line.op === 'remove')?.oldLine).toBe(2);
    expect(changed.find((line) => line.op === 'remove')?.newLine).toBeNull();
    expect(changed.find((line) => line.op === 'add')?.newLine).toBe(2);
    expect(changed.find((line) => line.op === 'add')?.oldLine).toBeNull();
  });

  it('separates distant changes into their own hunks', () => {
    const before = Array.from({ length: 40 }, (_, index) => `line ${String(index)}`).join('\n');
    const after = before
      .split('\n')
      .map((line, index) => (index === 2 || index === 30 ? `${line}!` : line));

    const diff = diffLines(before, after.join('\n'));

    expect(diff.hunks).toHaveLength(2);
  });

  it('merges nearby changes into one hunk', () => {
    const before = Array.from({ length: 40 }, (_, index) => `line ${String(index)}`).join('\n');
    const after = before
      .split('\n')
      .map((line, index) => (index === 10 || index === 12 ? `${line}!` : line));

    expect(diffLines(before, after.join('\n')).hunks).toHaveLength(1);
  });

  describe('the diff describes the change — apply it and the proposal comes back', () => {
    const cases: [string, string, string][] = [
      ['one line edited', lines('a', 'b', 'c'), lines('a', 'B', 'c')],
      ['inserted at the top', lines('b', 'c'), lines('a', 'b', 'c')],
      ['inserted at the bottom', lines('a', 'b'), lines('a', 'b', 'c')],
      ['removed from the middle', lines('a', 'b', 'c', 'd'), lines('a', 'd')],
      ['whole document replaced', lines('a', 'b'), lines('x', 'y', 'z')],
      ['emptied', lines('a', 'b'), ''],
      ['grown from nothing', '', lines('a', 'b')],
      ['duplicate lines, one removed', lines('a', 'a', 'a'), lines('a', 'a')],
      ['reordered', lines('a', 'b', 'c'), lines('c', 'b', 'a')],
      [
        'a realistic section edit',
        lines('# Spec', '', '## Purpose', '', 'Old text.', '', '## Notes', '', '- one'),
        lines('# Spec', '', '## Purpose', '', 'New text.', '', '## Notes', '', '- one', '- two'),
      ],
    ];

    for (const [name, before, after] of cases) {
      it(name, () => {
        expect(reconstruct(before, after)).toBe(after);
      });
    }
  });

  it('handles a large document without building a quadratic table', () => {
    // 20k lines each side: the prefix/suffix trim must reduce this to a handful of lines, and the
    // cell cap must catch it if it does not. Either way it returns rather than hanging.
    const before = Array.from({ length: 20_000 }, (_, index) => `line ${String(index)}`).join('\n');
    const after = before.replace('line 10000', 'line 10000 changed');

    const diff = diffLines(before, after);

    expect(diff.identical).toBe(false);
    expect(diff.added).toBe(1);
    expect(diff.removed).toBe(1);
  });

  it('still produces a correct-if-coarse diff when the change is too large to align', () => {
    // Nothing in common, both sides long: past the cell cap the whole region is one replacement.
    const before = Array.from({ length: 3_000 }, (_, index) => `old ${String(index)}`).join('\n');
    const after = Array.from({ length: 3_000 }, (_, index) => `new ${String(index)}`).join('\n');

    const diff = diffLines(before, after);

    expect(diff.identical).toBe(false);
    expect(reconstruct(before, after)).toBe(after);
  });
});

describe('formatUnifiedDiff', () => {
  it('renders a header and standard markers', () => {
    const diff = diffLines(lines('a', 'b', 'c'), lines('a', 'B', 'c'));

    const text = formatUnifiedDiff(diff, 'constitution.md');

    expect(text).toContain('--- a/constitution.md');
    expect(text).toContain('+++ b/constitution.md');
    expect(text).toMatch(/@@ -\d+,\d+ \+\d+,\d+ @@/);
    expect(text).toContain('-b');
    expect(text).toContain('+B');
    expect(text).toContain(' a');
  });

  it('renders nothing at all for identical text', () => {
    expect(formatUnifiedDiff(diffLines('same', 'same'), 'x.md')).toBe('');
  });
});
