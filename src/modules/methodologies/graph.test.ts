import { describe, expect, it } from 'vitest';

import { TRANSITION_TABLE } from '@/modules/workflow/transition-table';

import PARITY_TABLE from '../workflow/__tests__/transition-table.parity.json' with { type: 'json' };

import { MYSPEC_BROWNFIELD_V1, MYSPEC_EDIT_V1, MYSPEC_GREENFIELD_V1 } from './configs/myspec';
import { OPENSPEC_BROWNFIELD_V1, SPECKIT_GREENFIELD_V1 } from './configs/foreign';
import { buildTransitionTable } from './graph';
import { bundleFileNames, requiredDocumentStages } from './model/config';
import { DEFAULT_METHODOLOGY_ID, METHODOLOGY_CONFIGS, methodologyConfig } from './registry';
import { edgeIssues, methodologyIssues, type MethodologyValidationCode } from './validate';

/**
 * The anchor of the milestone (task 116 AC-1).
 *
 * `transition-table.parity.json` was dumped from the hand-written 33-row array **before** the
 * derivation in `graph.ts` was written — it is the old table's bytes, not a snapshot taken of the
 * new code and then blessed. So this comparison answers the only question that matters about the
 * refactor: did turning the table into a configuration move a single row, id, endpoint or gate?
 */
describe('the default methodology reproduces the parity table (task 116 AC-1)', () => {
  it('derives byte-for-byte the table captured before the refactor', () => {
    expect(JSON.parse(JSON.stringify(buildTransitionTable(MYSPEC_GREENFIELD_V1)))).toEqual(
      PARITY_TABLE,
    );
  });

  it('is what `TRANSITION_TABLE` and the default id resolve to', () => {
    expect(JSON.parse(JSON.stringify(TRANSITION_TABLE))).toEqual(PARITY_TABLE);
    expect(DEFAULT_METHODOLOGY_ID).toBe(MYSPEC_GREENFIELD_V1.id);
    expect(methodologyConfig(undefined)).toBe(MYSPEC_GREENFIELD_V1);
    expect(methodologyConfig('no-such-methodology')).toBe(MYSPEC_GREENFIELD_V1);
  });

  it('still has 33 rows, and the row order is unchanged', () => {
    expect(TRANSITION_TABLE).toHaveLength(33);
    expect(TRANSITION_TABLE.map((row) => row.id)).toEqual(
      PARITY_TABLE.map((row: { id: string }) => row.id),
    );
  });
});

describe('the five configurations (task 116 AC-3; Эталон §1.4)', () => {
  it('ships exactly the five the reference product offers', () => {
    expect(METHODOLOGY_CONFIGS.map((config) => config.id)).toEqual([
      'myspec-greenfield-v1',
      'myspec-brownfield-v1',
      'speckit-greenfield-v1',
      'openspec-brownfield-v1',
      'myspec-edit-v1',
    ]);
  });

  it.each([
    [
      MYSPEC_GREENFIELD_V1,
      ['Interview', 'Constitution', 'Requirements', 'Solution', 'Tasks', 'Quality', 'Complete'],
    ],
    [MYSPEC_BROWNFIELD_V1, ['Interview', 'Proposal', 'Requirements', 'Tasks', 'Complete']],
    [SPECKIT_GREENFIELD_V1, ['Interview', 'Constitution', 'Specify', 'Plan', 'Tasks', 'Complete']],
    [OPENSPEC_BROWNFIELD_V1, ['Explore', 'Proposal', 'Specs', 'Solution', 'Tasks', 'Complete']],
    [MYSPEC_EDIT_V1, ['Reference', 'Describe', 'Review', 'Complete']],
  ])('$id lists the steps of Эталон §1.4', (config, steps) => {
    expect(config.steps.map((step) => step.label)).toEqual(steps);
  });

  it.each(METHODOLOGY_CONFIGS.map((config) => [config.id, config] as const))(
    '%s passes structural validation',
    (_id, config) => {
      expect(methodologyIssues(config)).toEqual([]);
    },
  );

  it('exports the file set of its own graph, with no name used twice', () => {
    expect(bundleFileNames(MYSPEC_GREENFIELD_V1)).toEqual([
      'constitution.md',
      'requirements.md',
      'solution.md',
      'tasks.md',
      'quality.md',
    ]);
    expect(bundleFileNames(SPECKIT_GREENFIELD_V1)).toEqual([
      'constitution.md',
      'spec.md',
      'plan.md',
      'tasks.md',
    ]);
    expect(bundleFileNames(OPENSPEC_BROWNFIELD_V1)).toEqual([
      'proposal.md',
      'spec.md',
      'design.md',
      'tasks.md',
    ]);
    expect(bundleFileNames(MYSPEC_BROWNFIELD_V1)).toEqual([
      'proposal.md',
      'requirements.md',
      'tasks.md',
    ]);
    expect(bundleFileNames(MYSPEC_EDIT_V1)).toEqual([]);
  });

  it('requires only the documents its terminal actually depends on', () => {
    // The optional stages drop out: Quality for the parity graph, Tasks for brownfield.
    expect(requiredDocumentStages(MYSPEC_GREENFIELD_V1)).toEqual([
      'constitution',
      'requirements',
      'solution',
      'tasks',
    ]);
    expect(requiredDocumentStages(MYSPEC_BROWNFIELD_V1)).toEqual(['constitution', 'requirements']);
    expect(requiredDocumentStages(MYSPEC_EDIT_V1)).toEqual([]);
  });

  it('gives the brownfield graph both doors out of Requirements (optional Tasks)', () => {
    const rows = buildTransitionTable(MYSPEC_BROWNFIELD_V1).filter(
      (row) => row.from.stage === 'requirements' && row.from.substage === 'review',
    );

    expect(rows.map((row) => `${row.to.stage}:${row.gate}`)).toEqual(
      expect.arrayContaining(['complete:stage-to-complete', 'tasks:review-advance']),
    );
  });

  it('gives no methodology but the parity one a route into quality', () => {
    for (const config of METHODOLOGY_CONFIGS.filter(
      (entry) => entry.id !== DEFAULT_METHODOLOGY_ID,
    )) {
      expect(buildTransitionTable(config).some((row) => row.to.stage === 'quality')).toBe(false);
    }
  });
});

/**
 * Every malformation the validator names, seeded one at a time (task 116 AC-2).
 *
 * The configurations are built by mutating a valid one, so each case differs from a shipping config
 * in exactly the property under test — a fixture written from scratch could fail for a second reason
 * and still look like it proved the first.
 */
describe('structural validation rejects a malformed configuration by name (task 116 AC-2)', () => {
  const base = MYSPEC_GREENFIELD_V1;

  const cases: [MethodologyValidationCode, () => typeof base][] = [
    [
      'NO_TERMINAL_STAGE',
      () => ({ ...base, stages: base.stages.filter((stage) => stage.position !== 'complete') }),
    ],
    [
      // A graph whose entry stage leads nowhere: the interview never exits, so the terminal — and
      // with it everything after — is a position the session can look at and never occupy.
      'UNREACHABLE_STAGE',
      () => ({
        ...base,
        stages: base.stages.filter(
          (stage) => stage.position === 'interview' || stage.position === 'complete',
        ),
        steps: base.steps.filter((step) => step.stage === 'interview'),
      }),
    ],
    [
      'TERMINAL_UNREACHABLE',
      () => ({
        ...base,
        stages: base.stages.filter(
          (stage) => stage.position === 'interview' || stage.position === 'complete',
        ),
        steps: base.steps.filter((step) => step.stage === 'interview'),
      }),
    ],
    [
      'NON_POSITIVE_BUDGET',
      () => ({
        ...base,
        stages: base.stages.map((stage) =>
          stage.position === 'requirements' ? { ...stage, roundBudget: 0 } : stage,
        ),
      }),
    ],
    [
      'DUPLICATE_STAGE',
      () => ({ ...base, stages: [...base.stages, base.stages[1]].filter((s) => s !== undefined) }),
    ],
    [
      'STEP_STAGE_NOT_IN_GRAPH',
      () => ({
        ...base,
        steps: [...base.steps, { label: 'Ghost', stage: 'quality' as const, substages: null }],
        stages: base.stages.filter((stage) => stage.position !== 'quality'),
      }),
    ],
    [
      'STAGE_WITHOUT_STEP',
      () => ({ ...base, steps: base.steps.filter((step) => step.stage !== 'solution') }),
    ],
    [
      'DUPLICATE_FILE_NAME',
      () => ({
        ...base,
        stages: base.stages.map((stage) =>
          stage.position === 'solution' && stage.document !== null
            ? { ...stage, document: { ...stage.document, fileName: 'requirements.md' } }
            : stage,
        ),
      }),
    ],
    [
      'DUPLICATE_SPEC_TYPE',
      () => ({
        ...base,
        stages: base.stages.map((stage) =>
          stage.position === 'solution' && stage.document !== null
            ? { ...stage, document: { ...stage.document, specType: 'requirements' as const } }
            : stage,
        ),
      }),
    ],
  ];

  it.each(cases)('names %s', (code, build) => {
    const issues = methodologyIssues(build());

    expect(issues.map((issue) => issue.code)).toContain(code);
  });

  it('accepts every shipping configuration — the cases above are the only failures', () => {
    for (const config of METHODOLOGY_CONFIGS) expect(methodologyIssues(config)).toEqual([]);
  });

  /**
   * The one malformation no configuration can express.
   *
   * The derivation emits backward rows only inside a stage, so a config-level seed for
   * `CROSS_STAGE_BACKWARD_EDGE` would be impossible to write — which is exactly why the check takes
   * a row list. Seeded here directly: if a future change to `graph.ts` ever produced such a row, this
   * is the assertion that would have to have been deleted for it to ship.
   */
  it('names CROSS_STAGE_BACKWARD_EDGE on a row that leaves its stage', () => {
    const rows = [
      {
        id: 'requirements.review->constitution.review',
        from: { stage: 'requirements', substage: 'review' },
        to: { stage: 'constitution', substage: 'review' },
        gate: 'backward',
      },
    ] as const;

    expect(edgeIssues(rows).map((issue) => issue.code)).toEqual(['CROSS_STAGE_BACKWARD_EDGE']);
    expect(edgeIssues(buildTransitionTable(base))).toEqual([]);
  });
});
