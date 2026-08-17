import { z } from 'zod';

import type { LlmAdapter, ProviderId } from '@/modules/adapters/llm';
import { assemblePrompt } from '@/modules/prompts';

import { parseJsonDocument } from '../interview/interview-agent';
import { constrainedOutput } from '../schemas/constrained-output';

/**
 * The edit agent (task 118; Эталон §1.4 «Edit», §5.1 «Vibe Specify'ing»).
 *
 * It is given the documents an Edit chat referenced and one plain-language request, and it answers
 * with the **subset** of them that the request touches, each rewritten whole. Deciding the subset is
 * the agent's job and not the caller's: "add a rate limit" is a requirements change, a solution
 * change and probably a task, and nobody outside the model has read the documents closely enough to
 * say which.
 *
 * Two properties are enforced here rather than hoped for, because the model has an obvious way to
 * get each of them wrong:
 *
 * - **A file name must be one of the ones we supplied.** An answer keyed by an invented name is
 *   dropped, not resolved by guessing: a proposal has to point at a row that exists.
 * - **A file returned byte-identical is not a change**, and is dropped too. Models asked for "the
 *   whole document" like to return every document, and a proposal card offering a diff with no
 *   lines in it is a decision with nothing to decide.
 *
 * What happens to the surviving files — whether the change is admissible, whether it removes a
 * required heading, how it is stored — belongs to `ProposedChangeService`, on the other side of a
 * module boundary. Same split as the refinement agent, for the same reason.
 */
const EditResult = z.object({
  summary: z.string().min(1),
  files: z.array(
    z.object({
      fileName: z.string().min(1),
      content: z.string().min(1),
      rationale: z.string().default(''),
    }),
  ),
});

/**
 * The shape a runtime that can be constrained is held to (А-10; task 131).
 *
 * This is the call D-161 was measured on: a whole bundle restated as JSON strings is the longest,
 * most escape-heavy answer the product asks of a model, and the local one could not hold it — three
 * unparseable drafts in a row, six samples, with the prompt read whole and no deadline in sight.
 */
const EDIT_OUTPUT = constrainedOutput('edit_proposal', EditResult);

/** One document as the agent is shown it, and as its answer refers back to it. */
export interface EditDocument {
  fileName: string;
  content: string;
}

export interface EditAgentInput {
  /** The referenced documents, in bundle order. */
  documents: readonly EditDocument[];
  instruction: string;
  /** The session's content language (У-1; task 108); forwarded to the prompt assembly point. */
  contentLanguage?: string | null | undefined;
  runId: string;
  signal?: AbortSignal;
}

export interface ProposedFileEdit {
  fileName: string;
  content: string;
  rationale: string;
}

/** What the failover chain actually did, so the run row records it rather than guessing (task 44). */
export interface EditAttribution {
  providerUsed: ProviderId;
  attempts: number;
}

export type EditOutcome =
  | ({
      kind: 'edits';
      summary: string;
      files: readonly ProposedFileEdit[];
      promptId: string;
    } & EditAttribution)
  /** The model produced something that is not a usable answer. */
  | ({ kind: 'draft-invalid'; promptId: string; issues: readonly string[] } & EditAttribution);

/** How a document is put in front of the model: named, fenced, and quoted verbatim. */
function renderDocuments(documents: readonly EditDocument[]): string {
  return documents
    .map((document) =>
      [`<<<FILE ${document.fileName}`, document.content, `FILE ${document.fileName}`].join('\n'),
    )
    .join('\n\n');
}

export function createEditAgent(adapter: LlmAdapter) {
  /**
   * One resample on an unusable draft — exactly one (D-94's rule, applied here).
   *
   * The M9п gate walk is what asked for it: the local model returned a reply that was not parseable
   * JSON, and the whole edit was lost to a single bad sample. Resampling is the cheapest repair that
   * **invents nothing** — the answer is a set of whole documents, so there is no half of it worth
   * salvaging — and one is the right number: a second failure is a signal about the prompt or the
   * model, and a third sample would hide it behind a longer wait.
   */
  async function sample(input: EditAgentInput, attempt: number): Promise<EditOutcome> {
    const outcome = await propose(input);
    if (outcome.kind !== 'draft-invalid' || attempt >= 2) return outcome;

    console.warn('edit draft unusable; resampling once', {
      runId: input.runId,
      issues: outcome.issues,
    });

    return sample(input, attempt + 1);
  }

  async function propose(input: EditAgentInput): Promise<EditOutcome> {
    const prompt = assemblePrompt(
      'edit.propose.v1',
      {
        documents: renderDocuments(input.documents),
        fileNames: input.documents.map((document) => document.fileName).join(', '),
        instruction: input.instruction,
      },
      { contentLanguage: input.contentLanguage },
    );

    const result = await adapter.generateStreaming({
      messages: [
        { role: 'system', content: prompt.system },
        { role: 'user', content: prompt.user },
      ],
      structuredOutput: EDIT_OUTPUT,
      runId: input.runId,
      signal: input.signal,
    });

    const attribution: EditAttribution = {
      providerUsed: result.providerUsed,
      attempts: result.attempts,
    };

    const draft = parseJsonDocument(result.text);
    if (draft === null) {
      return {
        kind: 'draft-invalid',
        promptId: prompt.id,
        issues: ['the draft is not parseable JSON'],
        ...attribution,
      };
    }

    const parsed = EditResult.safeParse(draft);
    if (!parsed.success) {
      return {
        kind: 'draft-invalid',
        promptId: prompt.id,
        issues: parsed.error.issues.map(
          (issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`,
        ),
        ...attribution,
      };
    }

    const known = new Map(input.documents.map((document) => [document.fileName, document]));

    const files = parsed.data.files.flatMap((file): ProposedFileEdit[] => {
      const original = known.get(file.fileName);
      if (original === undefined) return [];
      if (original.content === file.content) return [];

      return [{ fileName: file.fileName, content: file.content, rationale: file.rationale }];
    });

    return {
      kind: 'edits',
      summary: parsed.data.summary,
      files,
      promptId: prompt.id,
      ...attribution,
    };
  }

  return {
    propose: (input: EditAgentInput): Promise<EditOutcome> => sample(input, 1),
  };
}

export type EditAgent = ReturnType<typeof createEditAgent>;
