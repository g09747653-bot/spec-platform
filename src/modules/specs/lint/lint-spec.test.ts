import { describe, expect, it } from 'vitest';

import { earsViolation, lintSpecDocument } from './lint-spec';

/**
 * Task 114 — the deterministic linters.
 *
 * The acceptance criteria name three documents that must each be caught and one that must produce
 * nothing, so the fixtures are exactly those: a broken cross-reference, a renumbered identifier, a
 * non-EARS requirement line, and a clean document. The fourth rule — requirement→task traceability —
 * has its own pair, because a tasks document is the only place it can fire.
 *
 * Every assertion here is about a *measurement*: the same bytes give the same findings, and no model
 * is involved anywhere on the path (there is nothing in this file that could call one).
 */
const CLEAN_REQUIREMENTS = `# Requirements

## Functional Requirements

### FR-001 — Authentication

- AC-1: When a visitor submits valid credentials, the system shall create a session.
- AC-2: While a session is active, the system shall scope every query to its owner.

### FR-002 — Export

- AC-1: The system shall produce a ZIP containing exactly the four parity files.
- AC-2: If the bundle is incomplete, then the system shall refuse the export.

## Non-Functional Requirements

### NFR-001 — Responsiveness

- AC-1: Where streaming is available, the system shall render the first token within three seconds.
`;

describe('cross-reference resolution (AC: a seeded broken cross-reference is caught)', () => {
  it('reports an identifier that is referenced but defined nowhere in the bundle', () => {
    const broken = `${CLEAN_REQUIREMENTS}
## Notes

Export behaviour is constrained by FR-042 and by NFR-001.
`;

    const findings = lintSpecDocument({ specType: 'requirements', content: broken });

    expect(findings.map((finding) => finding.rule)).toEqual(['cross-reference']);
    expect(findings[0]?.title).toBe('FR-042 is referenced but never defined');
    expect(findings[0]?.sectionPath).toBe('Requirements — Notes');
    expect(findings[0]?.suggestion).toContain('FR-042');
  });

  it('resolves a reference against another document of the bundle', () => {
    const solution = `# Solution

## Modules

The export module implements FR-002.
`;

    const findings = lintSpecDocument({
      specType: 'solution',
      content: solution,
      bundle: { requirements: CLEAN_REQUIREMENTS },
    });

    expect(findings).toEqual([]);
  });

  it('reports each unresolved identifier once, however often it is named', () => {
    const content = `# Solution

## Modules

FR-042 is named here, and FR-042 again here, and once more: FR-042.
`;

    expect(lintSpecDocument({ specType: 'solution', content })).toHaveLength(1);
  });

  it('ignores an identifier inside a fenced example, which is quoted material', () => {
    const content = ['# Solution', '', '```ts', "const example = 'FR-999';", '```', ''].join('\n');

    expect(lintSpecDocument({ specType: 'solution', content })).toEqual([]);
  });
});

describe('identifier stability (AC: a renumbered identifier is caught)', () => {
  it('reports an identifier the previous revision defined and this one does not', () => {
    const renumbered = CLEAN_REQUIREMENTS.replace('FR-002 — Export', 'FR-003 — Export');

    const findings = lintSpecDocument({
      specType: 'requirements',
      content: renumbered,
      previousContent: CLEAN_REQUIREMENTS,
    });

    expect(findings.map((finding) => finding.rule)).toEqual(['identifier-stability']);
    expect(findings[0]?.title).toBe('FR-002 disappeared from this revision');
  });

  it('says nothing when the identifiers survived, even if everything else changed', () => {
    const rewritten = CLEAN_REQUIREMENTS.replace(
      'the system shall create a session',
      'the system shall create a session and record its origin',
    );

    expect(
      lintSpecDocument({
        specType: 'requirements',
        content: rewritten,
        previousContent: CLEAN_REQUIREMENTS,
      }),
    ).toEqual([]);
  });

  it('treats FR-1 and FR-001 as the same requirement, not as a renumbering', () => {
    const padded = CLEAN_REQUIREMENTS.replace('FR-001 —', 'FR-1 —');

    expect(
      lintSpecDocument({
        specType: 'requirements',
        content: padded,
        previousContent: CLEAN_REQUIREMENTS,
      }),
    ).toEqual([]);
  });

  it('says nothing on a first revision, which has nothing to be stable against', () => {
    expect(
      lintSpecDocument({
        specType: 'requirements',
        content: CLEAN_REQUIREMENTS,
        previousContent: null,
      }),
    ).toEqual([]);
  });
});

describe('EARS conformance (AC: a non-EARS requirement line is caught)', () => {
  it('reports a requirement line that never says what the system shall do', () => {
    const vague = CLEAN_REQUIREMENTS.replace(
      '- AC-1: The system shall produce a ZIP containing exactly the four parity files.',
      '- AC-1: The export should be fast and produce a good ZIP.',
    );

    const findings = lintSpecDocument({ specType: 'requirements', content: vague });

    expect(findings.map((finding) => finding.rule)).toEqual(['ears']);
    expect(findings[0]?.body).toContain('nothing to test');
    expect(findings[0]?.suggestion).toContain('EARS');
  });

  it('reports a trigger that is never closed', () => {
    const runOn = CLEAN_REQUIREMENTS.replace(
      '- AC-1: When a visitor submits valid credentials, the system shall create a session.',
      '- AC-1: When a visitor submits valid credentials the system shall create a session.',
    );

    const findings = lintSpecDocument({ specType: 'requirements', content: runOn });

    expect(findings).toHaveLength(1);
    expect(findings[0]?.body).toContain('never closed with a comma');
  });

  it('reports an "If" with no "then"', () => {
    expect(earsViolation('If the bundle is incomplete the system shall refuse.')).toContain('then');
    expect(earsViolation('If the bundle is incomplete, then the system shall refuse.')).toBeNull();
  });

  it('accepts all five EARS shapes', () => {
    for (const line of [
      'The system shall persist every revision.',
      'When the user approves a draft, the system shall record the approval.',
      'While a generation is in flight, the system shall offer a way to stop it.',
      'Where the Quality stage is enabled, the system shall emit quality.md.',
      'If a provider fails, then the system shall try the next provider in the chain.',
    ]) {
      expect(earsViolation(line)).toBeNull();
    }
  });

  it('leaves prose alone: only lines inside a requirement entry are judged', () => {
    const withProse = `${CLEAN_REQUIREMENTS}
## Rationale

The bundle is the product, and its quality outranks delivery speed. Nothing here is testable, and
nothing here is a requirement.

- This bullet is discussion, not a requirement, and it never says shall on purpose.
`;

    expect(lintSpecDocument({ specType: 'requirements', content: withProse })).toEqual([]);
  });
});

describe('requirement → task traceability', () => {
  const TASKS = `# Tasks

## Milestone 1

- [ ] 1. Build authentication
  - _Requirements: FR-001_
- [ ] 2. Build responsiveness
  - _Requirements: NFR-001_
`;

  it('reports a requirement no task refers to', () => {
    const findings = lintSpecDocument({
      specType: 'tasks',
      content: TASKS,
      bundle: { requirements: CLEAN_REQUIREMENTS },
    });

    expect(findings.map((finding) => finding.rule)).toEqual(['traceability']);
    expect(findings[0]?.title).toBe('FR-002 has no task');
  });

  it('says nothing when every requirement is covered', () => {
    const covered = `${TASKS}- [ ] 3. Build export
  - _Requirements: FR-002_
`;

    expect(
      lintSpecDocument({
        specType: 'tasks',
        content: covered,
        bundle: { requirements: CLEAN_REQUIREMENTS },
      }),
    ).toEqual([]);
  });

  it('applies only to a tasks document', () => {
    expect(
      lintSpecDocument({
        specType: 'solution',
        content: '# Solution\n\n## Modules\n\nNothing references anything.\n',
        bundle: { requirements: CLEAN_REQUIREMENTS },
      }),
    ).toEqual([]);
  });
});

describe('a clean document yields no linter items at all (AC)', () => {
  it('finds nothing in a document that satisfies every rule', () => {
    expect(
      lintSpecDocument({
        specType: 'requirements',
        content: CLEAN_REQUIREMENTS,
        previousContent: CLEAN_REQUIREMENTS,
        bundle: { requirements: CLEAN_REQUIREMENTS },
      }),
    ).toEqual([]);
  });

  it('is a pure function of its input: the same bytes give the same findings, in the same order', () => {
    const broken = `${CLEAN_REQUIREMENTS}\n## Notes\n\nSee FR-042, FR-041 and NFR-099.\n`;
    const input = { specType: 'requirements', content: broken } as const;

    const first = lintSpecDocument(input);
    const second = lintSpecDocument(input);

    expect(first).toEqual(second);
    expect(first.map((finding) => finding.id)).toEqual([
      'linter-cross-reference-FR-41',
      'linter-cross-reference-FR-42',
      'linter-cross-reference-NFR-99',
    ]);
  });
});
