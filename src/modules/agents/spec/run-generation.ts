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
import {
  describeViolations,
  parseHeadings,
  validateStructure,
} from '@/modules/specs/validate-structure';

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
  /**
   * The attachments available when this context was assembled, recorded on the revision (DR-12).
   *
   * It travels with the context rather than being read here, because the fact being recorded is
   * "what the prompt was built from" — a second query at write time would answer a slightly later
   * question and could disagree with the document that was actually generated.
   */
  contextAttachmentIds?: readonly string[];
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
  | {
      status: 'failed';
      code: 'GENERATION_FAILED';
      attempts: number;
      /**
       * Why, for the server's eyes. `structure` means the model produced a document missing or
       * reordering a required section; `providers` means the chain was exhausted. The user sees the
       * same sanitised message either way — both are "generation did not complete, retry" — but the
       * two have very different remedies and telling them apart in a log is what makes a systematic
       * prompt problem visible (FR-008 AC-7; FR-018 AC-2).
       */
      reason: 'providers' | 'structure';
      /** The chain was exhausted by rate limiting, not by faults (round 2, Д-5). */
      overloaded?: boolean;
      /** Structural violations, in the machine-readable form; never rendered to the user. */
      detail?: string;
    };

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

    /*
     * Structure is checked before anything is written (FR-008 AC-4/AC-7; task 51).
     *
     * A document missing a required section is a failed generation, not a spec to be fixed later: it
     * would otherwise sit in the revision chain looking exactly like a real one, and P3's baseline
     * would be true of the checker and false of the bundle. The check goes through
     * `validateStructure`; the agent never sees the heading list itself (D-16).
     */
    const structure = validateStructure(specType, result.text);

    if (!structure.valid) {
      /*
       * What the model *did* write, next to what it was asked for (round 3).
       *
       * "Missing section X" names the requirement; it does not say whether the document had the
       * wrong headings, the right ones inside a code fence, or no headings at all — and those have
       * different remedies. Diagnosing one live failure without this meant reconstructing it from a
       * pruned chunk log, because a rejected document is deliberately never persisted. Headings
       * only, capped: enough to tell those cases apart, and not the document itself.
       */
      console.error('generated document rejected on structure', {
        runId,
        specType,
        characters: result.text.length,
        headings: parseHeadings(result.text)
          .slice(0, 12)
          .map((heading) => `${'#'.repeat(heading.level)} ${heading.text}`),
      });

      await recorder.fail();
      await store.markFailed(runId, result.attempts);

      return {
        status: 'failed',
        code: 'GENERATION_FAILED',
        attempts: result.attempts,
        reason: 'structure',
        detail: describeViolations(structure.violations),
      };
    }

    // The document is whole and conformant. Only now does it become a revision (FR-008 AC-3;
    // NFR-003 AC-2).
    const revisions = createRevisionRepository(db);
    const specFile = await revisions.ensureSpecFile(projectId, specType);
    const revision = await revisions.append({
      specFileId: specFile.id,
      content: result.text,
      contextAttachmentIds: input.contextAttachmentIds ?? [],
    });

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
    /*
     * An aborted run is not a failed one: it was never allowed to reach a verdict, so it is left as
     * it stands rather than being recorded as a generation that could not be produced.
     *
     * A reader dropping its connection is no longer such a case (round 4, Р-2; D-95): the generation
     * endpoint stopped aborting on client disconnect, precisely so that a reconnect finds the run
     * still going. This branch is for a caller that genuinely cancels.
     */
    if (signal?.aborted === true) throw error;

    await recorder.fail();
    await store.markFailed(runId, attempts);

    if (error instanceof AllProvidersFailedError) {
      return {
        status: 'failed',
        code: 'GENERATION_FAILED',
        attempts: error.attempts,
        reason: 'providers',
        overloaded: error.overloaded,
      };
    }

    throw error;
  }
}
