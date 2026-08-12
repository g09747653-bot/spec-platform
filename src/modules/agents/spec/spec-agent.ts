import type { LlmAdapter } from '@/modules/adapters/llm';
import { specGenerationPrompt } from '@/modules/prompts/assets/spec-generation';
import type { SpecType } from '@/modules/specs/model/spec-files';

/**
 * The spec writer (task 20; solution.md — `agents`).
 *
 * It assembles context, calls the model through the one adapter interface, and returns markdown. It
 * decides nothing about stage order — that is the state machine's job and asking a model to decide it
 * would violate P1. It also knows nothing about which provider served the call, or whether the provider
 * was real: the walking skeleton runs it against the deterministic stub, and tasks 43–45 swap in the
 * provider registry without touching this file.
 *
 * Structural validation against the section schema (FR-008 AC-4/AC-7) arrives with `validateStructure`
 * in task 40. Until then the agent returns what the adapter produced, and the skeleton's job is to prove
 * the path, not the prose.
 */
export interface SpecAgentInput {
  specType: SpecType;
  initialPrompt: string;
  changeInstruction?: string;
  runId: string;
  onChunk?: (text: string) => void;
  signal?: AbortSignal;
}

export interface SpecAgentResult {
  content: string;
  promptId: string;
}

export function createSpecAgent(adapter: LlmAdapter) {
  return {
    async generate(input: SpecAgentInput): Promise<SpecAgentResult> {
      const prompt = specGenerationPrompt({
        specType: input.specType,
        initialPrompt: input.initialPrompt,
        changeInstruction: input.changeInstruction,
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

      return { content: result.text, promptId: prompt.id };
    },
  };
}

export type SpecAgent = ReturnType<typeof createSpecAgent>;
