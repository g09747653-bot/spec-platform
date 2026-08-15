import type { MethodologyConfig, MethodologyStage, MethodologyStep } from '../model/config';

import { vendoredDocument } from './vendored-document';

/**
 * The MySpec methodologies — our own graphs (Эталон §1.4, §5.2).
 *
 * `myspec-greenfield-v1` **is** the workflow the first six milestones built. Its documents declare
 * `parity` structure, which means the section schema decides them exactly as before: this config
 * adds no second opinion about what a `constitution.md` must contain, and the parity fixture proves
 * its derived table is the hand-written one row for row.
 *
 * `myspec-brownfield-v1` is the short loop the reference product offers for changes to an existing
 * system: Interview → Proposal → Requirements, with Tasks optional. «Proposal» sits in the
 * `constitution` position — the first document of the graph, the one that frames everything after
 * it — and exports as `proposal.md`. Its round budgets are lower on purpose: brownfield work starts
 * from a system that already exists, so the interview has less to establish.
 */

/**
 * The terminal step (Эталон §1.4: every workflow's table ends in «Complete»).
 *
 * A step even though the position writes nothing: the header numbers what the session is walking
 * towards, and a rail that stopped at the last document would leave a finished session with no lit
 * pill at all.
 */
const COMPLETE_STEP: MethodologyStep = { label: 'Complete', stage: 'complete', substages: null };

const complete: MethodologyStage = {
  position: 'complete',
  document: null,
  roundBudget: null,
  revisionBudget: null,
  optional: false,
};

export const MYSPEC_GREENFIELD_V1: MethodologyConfig = {
  id: 'myspec-greenfield-v1',
  name: 'MySpec generate-workflow v1',
  badge: { vendor: 'MySpec', flavour: 'Greenfield', version: 'V1' },
  chatClass: 'generate',
  summary: 'The full bundle for something new: constitution, requirements, solution, tasks.',
  stages: [
    {
      position: 'interview',
      document: null,
      roundBudget: null,
      revisionBudget: null,
      optional: false,
    },
    {
      position: 'constitution',
      document: {
        specType: 'constitution',
        fileName: 'constitution.md',
        structure: { kind: 'parity' },
        templateId: null,
      },
      roundBudget: null,
      revisionBudget: null,
      optional: false,
    },
    {
      position: 'requirements',
      document: {
        specType: 'requirements',
        fileName: 'requirements.md',
        structure: { kind: 'parity' },
        templateId: null,
      },
      roundBudget: null,
      revisionBudget: null,
      optional: false,
    },
    {
      position: 'solution',
      document: {
        specType: 'solution',
        fileName: 'solution.md',
        structure: { kind: 'parity' },
        templateId: null,
      },
      roundBudget: null,
      revisionBudget: null,
      optional: false,
    },
    {
      position: 'tasks',
      document: {
        specType: 'tasks',
        fileName: 'tasks.md',
        structure: { kind: 'parity' },
        templateId: null,
      },
      roundBudget: null,
      revisionBudget: null,
      optional: false,
    },
    {
      position: 'quality',
      document: {
        specType: 'quality',
        fileName: 'quality.md',
        structure: { kind: 'parity' },
        templateId: null,
      },
      roundBudget: null,
      revisionBudget: null,
      optional: true,
    },
    complete,
  ],
  steps: [
    { label: 'Interview', stage: 'interview', substages: null },
    { label: 'Constitution', stage: 'constitution', substages: null },
    { label: 'Requirements', stage: 'requirements', substages: null },
    { label: 'Solution', stage: 'solution', substages: null },
    { label: 'Tasks', stage: 'tasks', substages: null },
    { label: 'Quality', stage: 'quality', substages: null },
    COMPLETE_STEP,
  ],
};

export const MYSPEC_BROWNFIELD_V1: MethodologyConfig = {
  id: 'myspec-brownfield-v1',
  name: 'MySpec generate-brownfield v1',
  badge: { vendor: 'MySpec', flavour: 'Brownfield', version: 'V1' },
  chatClass: 'generate',
  summary: 'A fast loop for changing a system that already exists: proposal, then requirements.',
  stages: [
    {
      position: 'interview',
      document: null,
      roundBudget: 2,
      revisionBudget: null,
      optional: false,
    },
    {
      position: 'constitution',
      // Not `parity`: a proposal is not a constitution, and validating it against the constitution's
      // required headings would assert the wrong document. Its shape is our own template, read the
      // same way the vendored ones are.
      document: vendoredDocument('constitution', 'proposal.md', 'myspec/proposal-template'),
      roundBudget: 2,
      revisionBudget: null,
      optional: false,
    },
    {
      position: 'requirements',
      document: {
        specType: 'requirements',
        fileName: 'requirements.md',
        structure: { kind: 'parity' },
        templateId: null,
      },
      roundBudget: 2,
      revisionBudget: null,
      optional: false,
    },
    {
      position: 'tasks',
      document: {
        specType: 'tasks',
        fileName: 'tasks.md',
        structure: { kind: 'parity' },
        templateId: null,
      },
      roundBudget: 2,
      revisionBudget: null,
      optional: true,
    },
    complete,
  ],
  steps: [
    { label: 'Interview', stage: 'interview', substages: null },
    { label: 'Proposal', stage: 'constitution', substages: null },
    { label: 'Requirements', stage: 'requirements', substages: null },
    { label: 'Tasks', stage: 'tasks', substages: null },
    COMPLETE_STEP,
  ],
};

/**
 * The Edit workflow (Эталон §1.4, §5.1 «Vibe Specify'ing»).
 *
 * Three steps over two positions, because that is what the three steps are: Reference is the
 * grounding pick, and Describe/Review are the collect and the generate-plus-review of one working
 * stage. The stage produces no document of its own — an edit session revises the bundle the
 * referenced session already produced, through the proposed-changes path of M4 — so
 * `requiredDocumentStages` is empty and its terminal asks for nothing new.
 */
export const MYSPEC_EDIT_V1: MethodologyConfig = {
  id: 'myspec-edit-v1',
  name: 'MySpec edit-workflow v1',
  badge: { vendor: 'MySpec', flavour: 'Edit', version: 'V1' },
  chatClass: 'edit',
  summary: 'Reference spec files, describe changes, review and apply suggested edits.',
  stages: [
    {
      position: 'interview',
      document: null,
      roundBudget: 1,
      revisionBudget: null,
      optional: false,
    },
    {
      position: 'constitution',
      document: null,
      roundBudget: 1,
      revisionBudget: null,
      optional: false,
    },
    complete,
  ],
  steps: [
    { label: 'Reference', stage: 'interview', substages: null },
    { label: 'Describe', stage: 'constitution', substages: ['collect'] },
    { label: 'Review', stage: 'constitution', substages: ['generate', 'review'] },
    COMPLETE_STEP,
  ],
};
