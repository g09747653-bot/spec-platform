import { describe, expect, it } from 'vitest';

import {
  defineSectionList,
  describeViolations,
  parseHeadings,
  validateAgainstSections,
} from './validate-structure';

/**
 * The structural engine (task 40; NFR-007).
 *
 * These cases run against **invented** section names, not the parity baseline. That is deliberate on
 * two counts: restating the real headings in a fixture is what constitution P3 forbids (and what lint
 * now rejects), and the engine's behaviour — presence, level, relative order — is independent of which
 * headings it is given. The baseline itself is asserted end to end in `__tests__/parity.test.ts`,
 * through `validateStructure`, which is the only sanctioned way to reach it.
 */
const sections = defineSectionList([
  { level: 2, heading: 'Alpha' },
  { level: 2, heading: 'Beta' },
  { level: 2, heading: 'Gamma' },
]);

const document = (...lines: string[]) => lines.join('\n');

describe('parseHeadings', () => {
  it('reads ATX headings with their level, in document order', () => {
    const parsed = parseHeadings(document('# Title', '', '## Alpha', '', '### Detail'));

    expect(parsed).toEqual([
      { level: 1, text: 'Title' },
      { level: 2, text: 'Alpha' },
      { level: 3, text: 'Detail' },
    ]);
  });

  it('ignores headings inside fenced code blocks', () => {
    const parsed = parseHeadings(
      document('## Alpha', '', '```sh', '# not a heading, a shell comment', '```', '', '## Beta'),
    );

    expect(parsed.map((heading) => heading.text)).toEqual(['Alpha', 'Beta']);
  });

  it('does not let a fence of a different character close a block', () => {
    const parsed = parseHeadings(document('```', '## Hidden', '~~~', '## Still hidden', '```'));

    expect(parsed).toEqual([]);
  });

  it('accepts setext headings, which a model sometimes emits instead of ATX', () => {
    const parsed = parseHeadings(document('Alpha', '---', '', 'Title', '==='));

    expect(parsed).toEqual([
      { level: 2, text: 'Alpha' },
      { level: 1, text: 'Title' },
    ]);
  });

  it('does not mistake a thematic break or a list item for a setext underline', () => {
    const parsed = parseHeadings(document('Some prose.', '', '---', '', '- item', '---'));

    expect(parsed).toEqual([]);
  });

  it('strips closing hashes and surrounding whitespace', () => {
    expect(parseHeadings('##   Alpha   ##')).toEqual([{ level: 2, text: 'Alpha' }]);
  });
});

describe('validateAgainstSections', () => {
  it('accepts a document with every required heading, in order', () => {
    const result = validateAgainstSections(
      document('# Title', '## Alpha', 'text', '## Beta', '## Gamma'),
      sections,
    );

    expect(result).toEqual({ valid: true, violations: [] });
  });

  it('accepts extra headings between and around the required ones', () => {
    const result = validateAgainstSections(
      document(
        '## Preface',
        '## Alpha',
        '### Sub',
        '## Beta',
        '## Interlude',
        '## Gamma',
        '## End',
      ),
      sections,
    );

    expect(result.valid).toBe(true);
  });

  it('rejects a document missing a required heading', () => {
    const result = validateAgainstSections(document('## Alpha', '## Gamma'), sections);

    expect(result.valid).toBe(false);
    expect(result.violations).toEqual([
      { code: 'MISSING_HEADING', heading: 'Beta', expectedLevel: 2 },
    ]);
  });

  it('rejects a document whose headings are out of order', () => {
    const result = validateAgainstSections(document('## Beta', '## Alpha', '## Gamma'), sections);

    expect(result.valid).toBe(false);
    // Alpha is satisfied by its own occurrence; the section that cannot be placed after it is Beta,
    // and naming Beta is what tells the reader which move fixes the document.
    expect(result.violations).toEqual([
      { code: 'HEADING_OUT_OF_ORDER', heading: 'Beta', expectedLevel: 2 },
    ]);
  });

  it('rejects a heading present at the wrong level', () => {
    const result = validateAgainstSections(document('## Alpha', '### Beta', '## Gamma'), sections);

    expect(result.violations).toEqual([
      { code: 'WRONG_LEVEL', heading: 'Beta', expectedLevel: 2, actualLevel: 3 },
    ]);
  });

  it('reports every violation at once rather than stopping at the first', () => {
    const result = validateAgainstSections(document('## Gamma'), sections);

    expect(result.violations.map((violation) => violation.heading)).toEqual(['Alpha', 'Beta']);
  });

  it('tolerates casing and whitespace differences, and nothing else', () => {
    const forgiven = validateAgainstSections(
      document('##   alpha', '## BETA', '##  Gamma  '),
      sections,
    );
    expect(forgiven.valid).toBe(true);

    const notForgiven = validateAgainstSections(
      document('## Alpha', '## Beta!', '## Gamma'),
      sections,
    );
    expect(notForgiven.valid).toBe(false);
  });

  it('does not accept a required heading that only appears inside a code fence', () => {
    const result = validateAgainstSections(
      document('## Alpha', '```md', '## Beta', '```', '## Gamma'),
      sections,
    );

    expect(result.violations).toEqual([
      { code: 'MISSING_HEADING', heading: 'Beta', expectedLevel: 2 },
    ]);
  });

  it('matches a later duplicate so a repeated heading cannot fake an ordering failure', () => {
    const result = validateAgainstSections(
      document('## Beta', '## Alpha', '## Beta', '## Gamma'),
      sections,
    );

    expect(result.valid).toBe(true);
  });
});

describe('describeViolations', () => {
  it('summarises without quoting any document content', () => {
    const result = validateAgainstSections(document('## Gamma', '## Alpha'), sections);
    const summary = describeViolations(result.violations);

    expect(summary).toBe('missing section "## Beta"; section "## Gamma" is out of order');
  });
});

describe('defineSectionList', () => {
  it('is reusable for a section list of another module’s own devising', () => {
    expect(defineSectionList([{ level: 3, heading: 'Traceability Matrix' }])).toEqual([
      { level: 3, heading: 'Traceability Matrix' },
    ]);
  });

  it('rejects an empty list', () => {
    expect(() => defineSectionList([])).toThrow();
  });

  it('rejects a list that names the same section twice', () => {
    expect(() =>
      defineSectionList([
        { level: 2, heading: 'Alpha' },
        { level: 2, heading: 'alpha' },
      ]),
    ).toThrow();
  });

  it('rejects a heading level outside markdown’s range', () => {
    expect(() => defineSectionList([{ level: 7, heading: 'Alpha' }])).toThrow();
  });
});
