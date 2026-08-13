/** `adapters/llm` — provider adapters and the unified model interface (constitution A3, P7). */
export const MODULE_ID = 'adapters/llm';

export {
  AllProvidersFailedError,
  type GenerateOptions,
  type GenerateResult,
  type LlmAdapter,
  type ModelMessage,
  type ProviderId,
} from './types';
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
