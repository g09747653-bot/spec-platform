import type { SchemaDatabase } from '@/db';
import {
  AllProvidersFailedError,
  createStreamRecorder,
  type GenerationStore,
  type LlmAdapter,
  type ProviderId,
} from '@/modules/adapters/llm';
import { specGenerationPrompt } from '@/modules/prompts/assets/spec-generation';
import type { CoreSpecType } from '@/modules/specs/model/spec-files';
import { createRevisionRepository } from '@/modules/specs/repositories/revisions';

/**
 * One generation run, end to end (task 45; solution.md — Generation Sequence).
 *
 * The route handler owns HTTP; this owns the sequence: stream through the failover chain, record every
 * batch durably, and persist a revision only when a whole document has arrived. It reports progress
 * through callbacks rather than emitting protocol events itself, because `agents` may not import `web`
 * (constitution A1) — and because the same sequence is what a resumed stream re-attaches to.
 *
 * **Nothing partial is ever persisted.** A revision is written after the provider stream has completed
 * successfully, never during it (FR-018 AC-5). The chunk log is not a document: it exists so a
 * reconnecting browser can catch up, and it is pruned the moment the revision exists.
 */
export interface GenerationProgress {
  /** A durable batch is ready to send. The sequence is the client's resume cursor. */
  delta(sequence: number, text: string): void;
  /** The chain moved on mid-stream: discard everything rendered so far (D-9; FR-018 AC-5). */
  restart(attempt: number): void;
}

export interface RunGenerationInput {
  db: SchemaDatabase;
  /** The failover client, or a test double. This code cannot tell the difference (P7). */
  adapter: LlmAdapter;
  store: GenerationStore;
  runId: string;
  projectId: string;
  specType: CoreSpecType;
  initialPrompt: string;
  /** Assembled generation context (task 50). */
  context?: string;
  changeInstruction?: string;
  progress: GenerationProgress;
  signal?: AbortSignal;
}

export type GenerationOutcome =
  | {
      status: 'complete';
      specFileId: string;
      revisionNumber: number;
      providerUsed: ProviderId;
      attempts: number;
    }
  | { status: 'failed'; code: 'GENERATION_FAILED'; attempts: number };

export async function runGeneration(input: RunGenerationInput): Promise<GenerationOutcome> {
  const { db, adapter, store, runId, projectId, specType, progress, signal } = input;

  const recorder = createStreamRecorder({
    runId,
    store,
    onBatch: (chunk) => {
      progress.delta(chunk.sequence, chunk.delta);
    },
  });

  const prompt = specGenerationPrompt({
    specType,
    initialPrompt: input.initialPrompt,
    context: input.context,
    changeInstruction: input.changeInstruction,
  });

  let attempts = 1;

  try {
    const result = await adapter.generateStreaming({
      messages: [
        { role: 'system', content: prompt.system },
        { role: 'user', content: prompt.user },
      ],
      runId,
      signal,
      onChunk: (text) => {
        recorder.delta(text);
      },
      onAttempt: (attempt) => {
        attempts = attempt.attempt;
        if (attempt.attempt === 1) return;

        /*
         * Discard first, tell the client second. `restart()` resets the sequence and empties the
         * buffer synchronously and queues the delete ahead of any later append, so the new attempt's
         * batch 0 cannot land behind the old attempt's rows.
         */
        void recorder.restart();
        void store.markRestarted(runId, attempt.attempt);

        if (attempt.discardsPreviousOutput) progress.restart(attempt.attempt);
      },
    });

    await recorder.flush();

    // The document is whole. Only now does it become a revision (FR-008 AC-3; NFR-003 AC-2).
    const revisions = createRevisionRepository(db);
    const specFile = await revisions.ensureSpecFile(projectId, specType);
    const revision = await revisions.append({ specFileId: specFile.id, content: result.text });

    await store.markComplete(runId, result.providerUsed, result.attempts);
    await recorder.complete();

    return {
      status: 'complete',
      specFileId: specFile.id,
      revisionNumber: revision.revisionNumber,
      providerUsed: result.providerUsed,
      attempts: result.attempts,
    };
  } catch (error) {
    // A caller who disconnected is not a failed run: the run stays open and the client resumes it.
    if (signal?.aborted === true) throw error;

    await recorder.fail();
    await store.markFailed(runId, attempts);

    if (error instanceof AllProvidersFailedError) {
      return { status: 'failed', code: 'GENERATION_FAILED', attempts: error.attempts };
    }

    throw error;
  }
}
