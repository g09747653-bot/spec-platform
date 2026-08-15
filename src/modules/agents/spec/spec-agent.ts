import type { LlmAdapter } from '@/modules/adapters/llm';
import type { StageDocument } from '@/modules/methodologies';
import { templateText } from '@/modules/methodologies';
import {
  methodologyGenerationPrompt,
  specGenerationPrompt,
} from '@/modules/prompts/assets/spec-generation';
import type { CoreSpecType } from '@/modules/specs/model/spec-files';
import type { StructureResult } from '@/modules/specs/validate-structure';

import { documentStructureVerdict } from './document-structure';

/**
 * The spec writer (tasks 20 and 51; solution.md — `agents`).
 *
 * It builds the prompt, calls the model through the one adapter interface, and returns markdown **with
 * the verdict on its structure**. It decides nothing about stage order — that is the state machine's
 * job, and asking a model to decide it would violate P1 — and it knows nothing about which provider
 * served the call, or whether the provider was real.
 *
 * The verdict travels with the content rather than being left to the caller's memory: every path that
 * could persist a document has to look at it, which is what makes "output failing structural
 * validation is never persisted" (FR-008 AC-4/AC-7) a property of the type rather than of discipline.
 * The check goes through `validateStructure`; the heading list itself never reaches this file (D-16).
 *
 * The streaming path — durable chunks, failover restarts, revision persistence — lives in
 * `run-generation.ts`, which is this agent's run inside a request.
 */
export interface SpecAgentInput {
  specType: CoreSpecType;
  /**
   * The methodology's descriptor for this document (task 116), or absent for the parity path.
   *
   * Absent is the parity baseline and is what every caller written before methodologies existed
   * means. Present, it decides three things together — which prompt asset is used, which template
   * the writer is shown, and which section list the result is checked against — so the document a
   * methodology asks for and the document it accepts cannot come apart.
   */
  document?: StageDocument | null;
  /** What the methodology calls this document. Defaults to the spec type. */
  documentLabel?: string;
  initialPrompt: string;
  /** Assembled generation context (task 50). Absent in the skeleton path. */
  context?: string;
  changeInstruction?: string;
  /** The session's content language (У-1; task 108); forwarded to the prompt assembly point. */
  contentLanguage?: string | null | undefined;
  runId: string;
  onChunk?: (text: string) => void;
  signal?: AbortSignal;
}

export interface SpecAgentResult {
  content: string;
  promptId: string;
  /** Whether the content carries its required sections, in order. Never `undefined`. */
  structure: StructureResult;
}

/** Whether this document follows the parity baseline, which is also the default when unstated. */
function isParityDocument(document: StageDocument | null | undefined): boolean {
  return document === null || document === undefined || document.structure.kind === 'parity';
}

export function createSpecAgent(adapter: LlmAdapter) {
  return {
    async generate(input: SpecAgentInput): Promise<SpecAgentResult> {
      const document = input.document ?? null;
      const parity = isParityDocument(document);

      const prompt =
        parity || document === null
          ? specGenerationPrompt({
              specType: input.specType,
              initialPrompt: input.initialPrompt,
              context: input.context,
              changeInstruction: input.changeInstruction,
              contentLanguage: input.contentLanguage,
            })
          : methodologyGenerationPrompt({
              documentLabel: input.documentLabel ?? input.specType,
              template: document.templateId === null ? '' : templateText(document.templateId),
              requiredSections:
                document.structure.kind === 'declared' ? document.structure.sections : [],
              initialPrompt: input.initialPrompt,
              context: input.context,
              changeInstruction: input.changeInstruction,
              contentLanguage: input.contentLanguage,
            });

      const result = await adapter.generateStreaming({
        messages: [
          { role: 'system', content: prompt.system },
          { role: 'user', content: prompt.user },
        ],
        runId: input.runId,
        onChunk: input.onChunk,
        signal: input.signal,
      });

      return {
        content: result.text,
        promptId: prompt.id,
        structure: documentStructureVerdict(document, input.specType, result.text),
      };
    },
  };
}

export type SpecAgent = ReturnType<typeof createSpecAgent>;
