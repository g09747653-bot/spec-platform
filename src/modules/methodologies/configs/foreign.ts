import type { MethodologyConfig, MethodologyStage } from '../model/config';

import { vendoredDocument } from './vendored-document';

/**
 * The two methodologies whose material is vendored (Эталон §1.4, §5.2; task 116).
 *
 * Neither graph is reverse-engineered from a screenshot: the step names come from Эталон §1.4, and
 * the documents are the upstream templates — spec-kit's `constitution`/`spec`/`plan`/`tasks` and
 * OpenSpec's `proposal`/`spec`/`design`/`tasks` — copied under their MIT licences, which sit beside
 * them in `templates/`.
 *
 * The canonical position each step occupies is a mapping, not a claim of sameness. SpecKit's
 * «Specify» writes `spec.md` and is the third position of the graph; ours calls that position
 * `requirements` because that is the letter the machine's alphabet uses for "the third document, the
 * one the plan is built from". The user never sees the letter — they see the step name, the file
 * name, and the template's own shape.
 */

const complete: MethodologyStage = {
  position: 'complete',
  document: null,
  roundBudget: null,
  revisionBudget: null,
  optional: false,
};

/** `Interview → Constitution → Specify → Plan → Tasks → Complete` (Эталон §1.4). */
export const SPECKIT_GREENFIELD_V1: MethodologyConfig = {
  id: 'speckit-greenfield-v1',
  name: 'SpecKit generate-greenfield v1',
  badge: { vendor: 'SpecKit', flavour: 'Greenfield', version: 'V1' },
  chatClass: 'generate',
  summary: "GitHub's spec-driven toolkit: constitution, feature spec, implementation plan, tasks.",
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
      document: vendoredDocument(
        'constitution',
        'constitution.md',
        'speckit/constitution-template',
      ),
      roundBudget: null,
      revisionBudget: null,
      optional: false,
    },
    {
      position: 'requirements',
      document: vendoredDocument('requirements', 'spec.md', 'speckit/spec-template'),
      roundBudget: null,
      revisionBudget: null,
      optional: false,
    },
    {
      position: 'solution',
      document: vendoredDocument('solution', 'plan.md', 'speckit/plan-template'),
      roundBudget: null,
      revisionBudget: null,
      optional: false,
    },
    {
      position: 'tasks',
      document: vendoredDocument('tasks', 'tasks.md', 'speckit/tasks-template'),
      roundBudget: null,
      revisionBudget: null,
      optional: false,
    },
    complete,
  ],
  steps: [
    { label: 'Interview', stage: 'interview', substages: null },
    { label: 'Constitution', stage: 'constitution', substages: null },
    { label: 'Specify', stage: 'requirements', substages: null },
    { label: 'Plan', stage: 'solution', substages: null },
    { label: 'Tasks', stage: 'tasks', substages: null },
  ],
};

/** `Explore → Proposal → Specs → Solution → Tasks → Complete` (Эталон §1.4). */
export const OPENSPEC_BROWNFIELD_V1: MethodologyConfig = {
  id: 'openspec-brownfield-v1',
  name: 'OpenSpec generate-brownfield v1',
  badge: { vendor: 'OpenSpec', flavour: 'Brownfield', version: 'V1' },
  chatClass: 'generate',
  summary:
    'A change-first pipeline for existing systems: proposal, capability specs, design, tasks.',
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
      document: vendoredDocument('constitution', 'proposal.md', 'openspec/proposal'),
      roundBudget: null,
      revisionBudget: null,
      optional: false,
    },
    {
      position: 'requirements',
      document: vendoredDocument('requirements', 'spec.md', 'openspec/spec'),
      roundBudget: null,
      revisionBudget: null,
      optional: false,
    },
    {
      position: 'solution',
      document: vendoredDocument('solution', 'design.md', 'openspec/design'),
      roundBudget: null,
      revisionBudget: null,
      optional: false,
    },
    {
      position: 'tasks',
      document: vendoredDocument('tasks', 'tasks.md', 'openspec/tasks'),
      roundBudget: null,
      revisionBudget: null,
      optional: false,
    },
    complete,
  ],
  steps: [
    { label: 'Explore', stage: 'interview', substages: null },
    { label: 'Proposal', stage: 'constitution', substages: null },
    { label: 'Specs', stage: 'requirements', substages: null },
    { label: 'Solution', stage: 'solution', substages: null },
    { label: 'Tasks', stage: 'tasks', substages: null },
  ],
};
