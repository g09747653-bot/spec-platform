import { unzipSync, strFromU8 } from 'fflate';
import { describe, expect, it } from 'vitest';

import { bundlePlan, methodologyConfig, DEFAULT_METHODOLOGY_ID } from '@/modules/methodologies';

import type { ExportableFile } from '../repositories/spec-files';

import { assembleBundle } from './bundle';

/**
 * Task 22 — what the archive contains, and what it must never contain.
 *
 * Every assertion here reads the produced ZIP back rather than trusting the assembly code: the
 * acceptance criteria are about the archive a user downloads, so the archive is what is inspected.
 */
const file = (specType: 'constitution' | 'requirements' | 'solution' | 'tasks', content: string) =>
  ({
    specFileId: `00000000-0000-4000-8000-${specType.slice(0, 8).padEnd(12, '0')}`,
    specType,
    fileName: `${specType}.md`,
    content,
    revisionNumber: 1,
  }) satisfies ExportableFile;

const entries = (zip: Uint8Array) => {
  const unzipped = unzipSync(zip);
  return Object.fromEntries(
    Object.entries(unzipped).map(([name, bytes]) => [name, strFromU8(bytes)]),
  );
};

describe('bundle assembly (task 22)', () => {
  it('contains exactly the four parity files, named exactly (FR-015 AC-2/AC-10)', () => {
    const result = assembleBundle(
      [
        file('constitution', '# Constitution'),
        file('requirements', '# Requirements'),
        file('solution', '# Solution'),
        file('tasks', '# Tasks'),
      ],
      'default',
    );

    expect(Object.keys(entries(result.zip))).toEqual([
      'constitution.md',
      'requirements.md',
      'solution.md',
      'tasks.md',
    ]);
    expect(result.omitted).toEqual([]);
  });

  it('extracts into a directory without renaming: no paths, no prefixes (AC-10)', () => {
    const result = assembleBundle([file('constitution', '# Constitution')], 'default');

    for (const name of Object.keys(entries(result.zip))) {
      expect(name).not.toContain('/');
      expect(name).not.toContain('\\');
      expect(name).toMatch(/^[a-z]+\.md$/);
    }
  });

  it('preserves content byte-for-byte, including unicode and trailing newlines', () => {
    const content = '# Constitution\n\n- принцип P1 — детерминизм\n\n```ts\nconst a = 1;\n```\n';

    const result = assembleBundle([file('constitution', content)], 'default');

    expect(entries(result.zip)['constitution.md']).toBe(content);
  });

  it('omits a file with no approved revision rather than emitting it empty (AC-6/AC-9)', () => {
    const result = assembleBundle(
      [file('constitution', '# Constitution'), file('tasks', '# Tasks')],
      'default',
    );

    const contents = entries(result.zip);

    expect(Object.keys(contents)).toEqual(['constitution.md', 'tasks.md']);
    expect(result.included).toEqual(['constitution.md', 'tasks.md']);
    expect(result.omitted).toEqual(['requirements.md', 'solution.md']);
    expect(Object.values(contents).every((value) => value.length > 0)).toBe(true);
  });

  it('still produces an archive when nothing has been approved (AC-6)', () => {
    const result = assembleBundle([], 'default');

    expect(entries(result.zip)).toEqual({});
    expect(result.omitted).toHaveLength(4);
  });

  it('keeps the omission manifest out of the archive (AC-8)', () => {
    const result = assembleBundle([file('constitution', '# Constitution')], 'default');

    const names = Object.keys(entries(result.zip));

    expect(names).not.toContain('manifest.json');
    expect(names).not.toContain('README.md');
    expect(names).toHaveLength(1);
  });

  it('emits the bundle in parity order regardless of the order rows arrived in', () => {
    const result = assembleBundle(
      [
        file('tasks', '# Tasks'),
        file('constitution', '# Constitution'),
        file('solution', '# Solution'),
        file('requirements', '# Requirements'),
      ],
      'default',
    );

    expect(result.included).toEqual([
      'constitution.md',
      'requirements.md',
      'solution.md',
      'tasks.md',
    ]);
  });

  it('reports the mode it used, so a download is never ambiguous (AC-4)', () => {
    expect(assembleBundle([], 'default').mode).toBe('default');
  });

  it('never contains quality.md in default mode, even if a quality file is supplied (P3)', () => {
    const withQuality = [
      file('constitution', '# Constitution'),
      {
        specFileId: '00000000-0000-4000-8000-000000000009',
        specType: 'quality' as const,
        fileName: 'quality.md' as const,
        content: '# Quality',
        revisionNumber: 1,
      },
    ];

    const result = assembleBundle(withQuality, 'default');

    expect(Object.keys(entries(result.zip))).toEqual(['constitution.md']);
    expect(result.included).not.toContain('quality.md');
  });
});

/**
 * Config-driven bundles (task 117 AC-1/AC-3).
 *
 * The first assertion is the contract that must not move: `myspec-greenfield-v1`'s plan and the
 * parity default produce the **same archive bytes**, so the M6 export is not "preserved" by care —
 * it is the same computation reached two ways.
 */
describe('bundles of other methodologies (task 117)', () => {
  const four = [
    file('constitution', '# Constitution'),
    file('requirements', '# Requirements'),
    file('solution', '# Solution'),
    file('tasks', '# Tasks'),
  ];

  it('produces byte-identical output for the default methodology and for no methodology at all', () => {
    const implicit = assembleBundle(four, 'default');
    const explicit = assembleBundle(
      four,
      'default',
      bundlePlan(methodologyConfig(DEFAULT_METHODOLOGY_ID), 'default'),
    );

    expect(explicit.included).toEqual(implicit.included);
    expect(explicit.omitted).toEqual(implicit.omitted);
    expect([...explicit.zip]).toEqual([...implicit.zip]);
  });

  it('names SpecKit’s files as SpecKit names them, from the same stored rows', () => {
    const result = assembleBundle(
      four,
      'default',
      bundlePlan(methodologyConfig('speckit-greenfield-v1'), 'default'),
    );

    // Same four rows in the database; four different names in the download. `spec.md` holds what the
    // `requirements` row holds, and `plan.md` what the `solution` row holds — the storage slot is an
    // internal address, and the user never sees it.
    expect(Object.keys(entries(result.zip))).toEqual([
      'constitution.md',
      'spec.md',
      'plan.md',
      'tasks.md',
    ]);
    expect(entries(result.zip)['plan.md']).toBe('# Solution');
    expect(result.included).toEqual(['constitution.md', 'spec.md', 'plan.md', 'tasks.md']);
  });

  it('exports the brownfield set, and omits by the name the user would look for', () => {
    const result = assembleBundle(
      [file('constitution', '# Proposal')],
      'default',
      bundlePlan(methodologyConfig('myspec-brownfield-v1'), 'default'),
    );

    expect(Object.keys(entries(result.zip))).toEqual(['proposal.md']);
    expect(result.included).toEqual(['proposal.md']);
    expect(result.omitted).toEqual(['requirements.md', 'tasks.md']);
  });

  it('drops the Quality stage from a default-mode export and restores it in quality mode', () => {
    const config = methodologyConfig(DEFAULT_METHODOLOGY_ID);

    expect(bundlePlan(config, 'default').map((entry) => entry.fileName)).not.toContain(
      'quality.md',
    );
    expect(bundlePlan(config, 'quality').map((entry) => entry.fileName)).toContain('quality.md');
  });
});
