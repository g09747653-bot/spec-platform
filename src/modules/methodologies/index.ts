/**
 * `methodologies` — stage graphs, documents, budgets and templates as data (task 116; А-2 · M9).
 *
 * A leaf-ish module by design: it reads the stage vocabulary from `workflow/model/stages`, the file
 * vocabulary from `specs/model/spec-files`, and the section-list *shape* from
 * `specs/validate-structure` — and imports nothing else. It holds no state, performs no I/O, and
 * decides nothing at runtime; every export is a pure function of frozen configuration.
 *
 * May import: `workflow` (stage model), `specs` (file vocabulary, section-list shape).
 * Must not import: `agents`, `prompts`, `projects`, `quality`, `adapters`, `web`.
 */
export const MODULE_ID = 'methodologies';

export {
  bundleFileNames,
  bundlePlan,
  documentAt,
  requiredDocumentStages,
  stageOf,
  CHAT_CLASSES,
  type ChatClass,
  type DocumentStructure,
  type MethodologyBadge,
  type MethodologyConfig,
  type MethodologyStage,
  type MethodologyStep,
  type BundleEntry,
  type StageDocument,
} from './model/config';

export { buildTransitionTable, entryPosition } from './graph';

export {
  assertMethodologyConfig,
  configEntryPosition,
  methodologyIssues,
  stepCoversPosition,
  visitsSpecStage,
  MethodologyConfigError,
  type MethodologyIssue,
  type MethodologyValidationCode,
} from './validate';

export {
  assertMethodologyConfigs,
  isMethodologyId,
  methodologiesForChatClass,
  methodologyConfig,
  transitionTableFor,
  DEFAULT_METHODOLOGY_ID,
  METHODOLOGY_CONFIGS,
  METHODOLOGY_IDS,
  type MethodologyId,
} from './registry';

export { templateSections, templateText } from './templates/sections';
export { type VendoredTemplateId } from './templates/vendored';
