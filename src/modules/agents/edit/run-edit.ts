import type { SchemaDatabase } from '@/db';
import type { OwnerScope } from '@/db/owner-scope';
import type { GenerationStore, LlmAdapter } from '@/modules/adapters/llm';
import { AllProvidersFailedError } from '@/modules/adapters/llm';
import { createProposedChangeService } from '@/modules/specs/proposed-changes/proposed-change-service';

import { createEditAgent, type EditDocument } from './edit-agent';

/**
 * One pass of an Edit chat's Review step (task 118).
 *
 * The shape mirrors `runGeneration`: a run row is already open, the agent is asked, and the result
 * is persisted or the run is marked failed. What differs is the artifact — a spec generation writes
 * **one revision**, an edit writes **no revision at all**, only a batch of proposals for the user to
 * decide on. That is the M4 contract at bundle scale (FR-011 AC-2), and it is what makes "reject
 * leaves every file byte-identical" true by construction rather than by care: there is no write path
 * from here to `spec_revisions`.
 *
 * The batch is named by the run, so the card the user decides on and the run the feed shows are the
 * same thing seen twice, and "which chat produced this edit" is a join rather than a fourth column.
 */
export type EditRunOutcome =
  | { status: 'proposed'; files: readonly { fileName: string; added: number; removed: number }[] }
  /** The model answered, but nothing it said amounts to a change. Not a failure. */
  | { status: 'no-change' }
  | { status: 'failed'; code: string; overloaded: boolean };

export interface RunEditInput {
  db: SchemaDatabase;
  scope: OwnerScope;
  adapter: LlmAdapter;
  store: GenerationStore;
  runId: string;
  /** The referenced documents, with the spec-file row each one is stored in. */
  documents: readonly (EditDocument & { specFileId: string })[];
  instruction: string;
  contentLanguage: string | null;
  signal?: AbortSignal;
}

export async function runEdit(input: RunEditInput): Promise<EditRunOutcome> {
  const { db, scope, store, runId } = input;

  try {
    const outcome = await createEditAgent(input.adapter).propose({
      documents: input.documents.map((document) => ({
        fileName: document.fileName,
        content: document.content,
      })),
      instruction: input.instruction,
      contentLanguage: input.contentLanguage,
      runId,
      ...(input.signal === undefined ? {} : { signal: input.signal }),
    });

    if (outcome.kind === 'draft-invalid') {
      console.error('edit proposal draft invalid', { runId, issues: outcome.issues });
      await store.markFailed(runId, outcome.attempts);

      return { status: 'failed', code: 'DRAFT_INVALID', overloaded: false };
    }

    const bySpecFile = new Map(
      input.documents.map((document) => [document.fileName, document.specFileId]),
    );

    const files = outcome.files.flatMap((file) => {
      const specFileId = bySpecFile.get(file.fileName);
      return specFileId === undefined ? [] : [{ specFileId, content: file.content }];
    });

    const proposed = await createProposedChangeService(db).proposeBatch(scope, {
      editBatchId: runId,
      instruction: input.instruction,
      files,
    });

    /*
     * "The request changes nothing" is an answer, not an error. A run that reached a model, got a
     * coherent reply and found no edit to make is complete — marking it failed would offer a retry
     * for a question that has already been answered.
     */
    if (proposed.status === 'no-change') {
      await store.markComplete(runId, outcome.providerUsed, outcome.attempts);
      return { status: 'no-change' };
    }

    if (proposed.status !== 'proposed') {
      console.error('edit proposal refused', { runId, status: proposed.status });
      await store.markFailed(runId, outcome.attempts);

      return { status: 'failed', code: proposed.status.toUpperCase(), overloaded: false };
    }

    await store.markComplete(runId, outcome.providerUsed, outcome.attempts);

    return {
      status: 'proposed',
      files: proposed.files.map((file) => ({
        fileName: file.fileName,
        added: file.added,
        removed: file.removed,
      })),
    };
  } catch (error) {
    await store.markFailed(runId, 1);

    const overloaded = error instanceof AllProvidersFailedError;
    console.error('edit run failed', { runId, error });

    return { status: 'failed', code: 'GENERATION_FAILED', overloaded };
  }
}
