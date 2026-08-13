/**
 * `prompts` — versioned prompt assets, referenced by identifier from logic
 * (constitution — Coding Standards: prompts are assets, not string literals).
 *
 * May import: `specs` (section schema).
 * Must not import: any other module.
 */
export const MODULE_ID = 'prompts';

export { assemblePrompt, PromptAssemblyError } from './assemble-prompt';
export {
  assertPromptRegistry,
  promptRegistry,
  PromptRegistryError,
  PROMPT_IDS,
  type AssembledPrompt,
  type PromptAsset,
  type PromptId,
  type PromptVariables,
} from './registry';
