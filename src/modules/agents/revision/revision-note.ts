import type { LlmAdapter } from '@/modules/adapters/llm';
import { assemblePrompt } from '@/modules/prompts';

/**
 * The paragraph that precedes Rev N+1 (task 113; Эталон §1.3).
 *
 * A small agent with one job: say, in the user's language and in the first person, what the writer
 * is folding in and what it is settling on its own. It is a **required part of the revision
 * contract**, not a courtesy — a rewrite that applies four tick-marks always decides something the
 * ticks did not say, and a writer that decides silently leaves the user to find it in a diff of a
 * document they already approved.
 *
 * Three properties keep it honest:
 *
 * - **It sees only the ticked points.** The filter is the caller's, as everywhere else in this
 *   cycle, so a paragraph promising to fix something the user declined is not a bug that can happen.
 * - **It never writes.** Persisting the note is the caller's business, and the note is stored on the
 *   board whose decision it explains — not on the revision, which does not exist yet.
 * - **A failure is not a failed revision.** The caller treats an empty note as an absent note. The
 *   paragraph is prose about work that happens anyway; trading the revision for it would be the
 *   wrong way round (the same reasoning `ensureStageReview` applies to a board it could not produce).
 *
 * Prose out, so there is no schema and no Р-1 retry: there is nothing to parse and therefore nothing
 * that can be malformed. What is enforced is length — a model that answers with an essay gets its
 * first paragraph, because the card has room for a paragraph.
 */
export interface RevisionNoteInput {
  specType: string;
  /** The exact points the user ticked, already filtered. */
  points: readonly { sectionPath: string; title: string; suggestion: string }[];
  specContent: string;
  /** The session's content language (У-1; task 108); forwarded to the assembly point. */
  contentLanguage?: string | null | undefined;
  runId: string;
  signal?: AbortSignal;
}

/** How much of an over-long answer is kept. A paragraph, generously measured. */
const MAX_NOTE_CHARS = 1200;

/** The first paragraph, trimmed — a model that ignored "one paragraph" still says something usable. */
function firstParagraph(text: string): string {
  const cleaned = text.replace(/^\s*(?:```[a-z]*\s*)?/i, '').replace(/```\s*$/, '');
  const paragraph =
    cleaned
      .trim()
      .split(/\n{2,}/)[0]
      ?.trim() ?? '';

  return paragraph.length <= MAX_NOTE_CHARS ? paragraph : `${paragraph.slice(0, MAX_NOTE_CHARS)}…`;
}

export function createRevisionNoteAgent(adapter: LlmAdapter) {
  return {
    /** The paragraph, or `''` when the model gave nothing usable. Never throws for content. */
    async note(input: RevisionNoteInput): Promise<string> {
      if (input.points.length === 0) return '';

      const prompt = assemblePrompt(
        'revision.note.v1',
        {
          specType: input.specType,
          selectedPoints: input.points
            .map((point) => `- ${point.sectionPath} — ${point.title}: ${point.suggestion}`)
            .join('\n'),
          specContent: input.specContent,
        },
        { contentLanguage: input.contentLanguage },
      );

      const result = await adapter.generateStreaming({
        messages: [
          { role: 'system', content: prompt.system },
          { role: 'user', content: prompt.user },
        ],
        runId: input.runId,
        signal: input.signal,
      });

      return firstParagraph(result.text);
    },
  };
}

export type RevisionNoteAgent = ReturnType<typeof createRevisionNoteAgent>;
