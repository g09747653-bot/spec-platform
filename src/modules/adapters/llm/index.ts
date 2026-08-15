/** `adapters/llm` — provider adapters and the unified model interface (constitution A3, P7). */
export const MODULE_ID = 'adapters/llm';

export {
  AllProvidersFailedError,
  type AttemptStart,
  type GenerateOptions,
  type GenerateResult,
  type LlmAdapter,
  type ModelMessage,
  type ProviderId,
  type ToolDefinition,
} from './types';
export {
  createFailoverClient,
  type FailoverClientOptions,
  type ProviderFailure,
} from './failover-client';
export {
  buildProviderRegistry,
  providerChain,
  ProviderConfigurationError,
  type ProviderEntry,
} from './provider-registry';
export {
  createDefaultAdapter,
  modelRegistry,
  pinnedProvider,
  AUTO_MODEL,
  type ModelChoice,
} from './default-adapter';
export {
  createStreamRecorder,
  DEFAULT_BATCH_BYTES,
  DEFAULT_BATCH_MS,
  type ChunkStore,
  type RecordedChunk,
  type StreamRecorder,
} from './stream-recorder';
export {
  createGenerationStore,
  type GenerationRun,
  type GenerationStore,
} from './generation-store';
export {
  chunkDocument,
  createTestDoubleAdapter,
  documentFromPrompt,
  STUB_DOCUMENT,
  stubDocumentFor,
  type TestDoubleOptions,
} from './test-double';
export {
  stubInterviewRoundDocument,
  stubReplyAssessmentDocument,
  stubSessionSummaryDocument,
} from './stub-interview';
export { looksLikeReviewPrompt, specTypeFromReviewPrompt, stubReviewDocument } from './stub-review';
export {
  looksLikeRevisionNotePrompt,
  pointCountFromNotePrompt,
  stubRevisionNoteDocument,
} from './stub-revision-note';
export {
  documentsFromEditPrompt,
  instructionFromEditPrompt,
  looksLikeEditPrompt,
  stubEditDocument,
} from './stub-edit';
export {
  documentFromRefinementPrompt,
  instructionFromRefinementPrompt,
  looksLikeRefinementPrompt,
  stubRefinementDocument,
} from './stub-refinement';
