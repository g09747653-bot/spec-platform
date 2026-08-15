import { describe, expect, it } from 'vitest';

import { outlineOf, slugify } from './outline';

/**
 * Task 122 — the Outline, and the one thing about it that is easy to get wrong.
 *
 * Every stage of a spec bundle has an «Acceptance Criteria», so duplicate heading names are the
 * ordinary case here rather than the edge case. AC-2 is precisely about that: an outline whose
 * entries all scroll to the first occurrence is worse than no outline, because it looks like it
 * works.
 */
describe('outlineOf', () => {
  it('reads the heading tree with levels, in document order', () => {
    const outline = outlineOf(
      ['# Requirements', '', 'Text.', '', '## FR-001', '', '### Acceptance Criteria', ''].join(
        '\n',
      ),
    );

    expect(outline.map((heading) => [heading.level, heading.text])).toEqual([
      [1, 'Requirements'],
      [2, 'FR-001'],
      [3, 'Acceptance Criteria'],
    ]);
  });

  it('gives duplicated headings distinct anchors, keeping the first one unsuffixed', () => {
    const outline = outlineOf(
      [
        '## FR-001',
        '### Acceptance Criteria',
        '## FR-002',
        '### Acceptance Criteria',
        '## FR-003',
        '### Acceptance Criteria',
      ].join('\n'),
    );

    expect(
      outline.filter((heading) => heading.level === 3).map((heading) => heading.anchor),
    ).toEqual(['acceptance-criteria', 'acceptance-criteria-2', 'acceptance-criteria-3']);
  });

  it('ignores a hash inside a fenced code block', () => {
    const outline = outlineOf(
      ['# Real', '', '```md', '# Not a heading', '```', '', '## Also real'].join('\n'),
    );

    expect(outline.map((heading) => heading.text)).toEqual(['Real', 'Also real']);
  });

  it('records the source line, so Raw can be taken to the same place', () => {
    const outline = outlineOf(['intro', '', '## Scope', 'body'].join('\n'));

    expect(outline[0]).toMatchObject({ text: 'Scope', line: 2 });
  });

  it('drops closing hashes and trims, so `## Scope ##` is «Scope»', () => {
    expect(outlineOf('## Scope ##')[0]?.text).toBe('Scope');
  });

  it('gives a heading of punctuation an anchor anyway', () => {
    expect(slugify('***')).toBe('section');
    expect(outlineOf(['## ***', '## ***'].join('\n')).map((heading) => heading.anchor)).toEqual([
      'section',
      'section-2',
    ]);
  });

  it('handles non-Latin headings, because a document is in the user’s language (У-1)', () => {
    expect(slugify('Требования к системе')).toBe('требования-к-системе');
  });
});
