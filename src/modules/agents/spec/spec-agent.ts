import type { LlmAdapter } from '@/modules/adapters/llm';
import type { StageDocument } from '@/modules/methodologies';
import { templateText } from '@/modules/methodologies';
import type { AssembledPrompt } from '@/modules/prompts';
import {
  methodologyGenerationPrompt,
  specGenerationPrompt,
} from '@/modules/prompts/assets/spec-generation';
import type { CoreSpecType } from '@/modules/specs/model/spec-files';
import type { StructureResult } from '@/modules/specs/validate-structure';

import type { ContextSources } from '../context-assembler';
import { describePacking, packPrompt, type PackingRecord } from '../pack-prompt';
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
  /**
   * Everything the document is generated from (task 50), **unassembled**.
   *
   * The sources rather than a finished string, since А-8: the context has to be packed to the window
   * of whichever provider the chain reaches, and that is not known until an attempt begins. Absent
   * in the skeleton path, where there is no context and the prompt is what it always was.
   */
  sources?: ContextSources;
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
  /** What the packer did for the provider that answered, or absent when there was no context. */
  packing?: PackingRecord;
}

/** Whether this document follows the parity baseline, which is also the default when unstated. */
function isParityDocument(document: StageDocument | null | undefined): boolean {
  return document === null || document === undefined || document.structure.kind === 'parity';
}

/**
 * The prompt as a function of its context, so the same document can be built for two windows.
 *
 * Exported because it is what `run-generation.ts` needs too: that file owns the streaming, durable
 * and restart machinery, and this is the one thing the two paths must not spell differently — the
 * document a methodology asks for and the document it accepts come apart the moment they do.
 */
export function specPromptBuilder(input: {
  specType: CoreSpecType;
  document?: StageDocument | null;
  documentLabel?: string;
  initialPrompt: string;
  changeInstruction?: string;
  contentLanguage?: string | null | undefined;
}): (context: string) => AssembledPrompt {
  const document = input.document ?? null;
  const parity = isParityDocument(document);

  return (context: string) =>
    parity || document === null
      ? specGenerationPrompt({
          specType: input.specType,
          initialPrompt: input.initialPrompt,
          context,
          changeInstruction: input.changeInstruction,
          contentLanguage: input.contentLanguage,
        })
      : methodologyGenerationPrompt({
          documentLabel: input.documentLabel ?? input.specType,
          /* The document's own type, so a plan gets the dependency rules whatever it is named (А-52). */
          specType: document.specType,
          template: document.templateId === null ? '' : templateText(document.templateId),
          requiredSections:
            document.structure.kind === 'declared' ? document.structure.sections : [],
          initialPrompt: input.initialPrompt,
          context,
          changeInstruction: input.changeInstruction,
          contentLanguage: input.contentLanguage,
        });
}

export function createSpecAgent(adapter: LlmAdapter) {
  return {
    async generate(input: SpecAgentInput): Promise<SpecAgentResult> {
      const document = input.document ?? null;
      const build = specPromptBuilder(input);
      const prompt = build('');

      /*
       * With sources, the prompt is a function of the provider that will read it (А-8): the chain is
       * a chain of different windows, and the packing is decided per attempt inside the adapter.
       * Without them there is nothing to pack, and the messages are exactly what they always were.
       */
      let packing: PackingRecord | undefined;
      const sources = input.sources;

      const result = await adapter.generateStreaming({
        messages:
          sources === undefined
            ? [
                { role: 'system', content: prompt.system },
                { role: 'user', content: prompt.user },
              ]
            : (target) => {
                const packed = packPrompt({ build, sources, target, label: input.specType });
                packing = packed.record;
                console.info(describePacking(packed.record));
                return packed.messages;
              },
        runId: input.runId,
        onChunk: input.onChunk,
        signal: input.signal,
      });

      return {
        content: result.text,
        promptId: prompt.id,
        structure: documentStructureVerdict(document, input.specType, result.text),
        ...(packing === undefined ? {} : { packing }),
      };
    },
  };
}

export type SpecAgent = ReturnType<typeof createSpecAgent>;
