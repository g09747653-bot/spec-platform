import { assemblePrompt } from '../assemble-prompt';
import type { AssembledPrompt } from '../registry';

/**
 * The autonomous driver's two prompts, as calls on the registry (task 145; А-7).
 *
 * Typed doorways in the shape `review.ts` and `interview.ts` established: they turn the agent's
 * input into the asset's variables, render the optional blocks, and do nothing else.
 *
 * The rendering here is not decoration. Both assets show the model a **closed list of ids** and ask
 * it to answer with ids from that list; the list it is shown and the list the answer is checked
 * against are therefore built from the same array, one line apart. Rendering a round any other way —
 * summarising it, dropping the ids, describing the options in prose — would make the check a second
 * opinion about what was on offer rather than the same fact read twice.
 */
export const DRIVER_ANSWER_PROMPT_ID = 'driver.answer.v1';
export const DRIVER_REVIEW_PROMPT_ID = 'driver.review.v1';

/** One option as the round holds it — ids and labels, plus the round's own recommendation. */
export interface DriverOption {
  id: string;
  label: string;
  recommended?: boolean | undefined;
}

/** One question as the round holds it. */
export interface DriverQuestion {
  id: string;
  text: string;
  type: 'single' | 'multiple';
  options: readonly DriverOption[];
}

export interface DriverAnswerPromptInput {
  /** The session's grounding input, verbatim. Fenced by this module, never by the caller. */
  seed: string;
  /** The interview summary so far, or `null` before one exists. */
  summary: string | null;
  /** Which part of the bundle is collecting, for framing. */
  stage: string;
  questions: readonly DriverQuestion[];
  contentLanguage?: string | null | undefined;
}

function renderQuestions(questions: readonly DriverQuestion[]): string {
  return questions
    .map((question) => {
      const head = `- ${question.id} | ${question.text} | ${question.type}`;
      const options = question.options.map(
        (option) =>
          `    ${option.id} — ${option.label}${option.recommended === true ? ' (recommended)' : ''}`,
      );

      return [head, ...options].join('\n');
    })
    .join('\n');
}

export function driverAnswerPrompt(input: DriverAnswerPromptInput): AssembledPrompt {
  return assemblePrompt(
    'driver.answer.v1',
    {
      stage: input.stage,
      /*
       * Empty rather than a sentence saying there is nothing yet: an empty optional block collapses
       * in `interpolateTemplate`, and a sentence about our own plumbing is material the model reads
       * as context (the reasoning `verificationBlock` carries in `review.ts`).
       */
      summaryBlock:
        input.summary === null ? '' : `\nWhat has been established so far:\n${input.summary}`,
      seed: input.seed,
      questions: renderQuestions(input.questions),
    },
    { contentLanguage: input.contentLanguage },
  );
}

/** One finding as the board holds it. */
export interface DriverFinding {
  id: string;
  title: string;
  suggestion: string;
}

export interface DriverReviewPromptInput {
  seed: string;
  specType: string;
  /** The findings already committed to the rewrite. Shown, never offered. */
  blocking: readonly DriverFinding[];
  /** The findings this call is about. */
  advisory: readonly DriverFinding[];
  contentLanguage?: string | null | undefined;
}

/**
 * A findings list, or an explicit «none».
 *
 * `(none)` rather than an empty string here, unlike the summary block above, and the difference is
 * what the emptiness means: a missing summary is a stage the interview has not reached, while an
 * empty blocking list is a fact about *this board* that changes how the optional findings should be
 * judged. A model shown a blank where a list belongs reads it as a rendering failure.
 */
function renderFindings(findings: readonly DriverFinding[]): string {
  if (findings.length === 0) return '(none)';

  return findings
    .map((finding) => `- ${finding.id} — ${finding.title}: ${finding.suggestion}`)
    .join('\n');
}

export function driverReviewPrompt(input: DriverReviewPromptInput): AssembledPrompt {
  return assemblePrompt(
    'driver.review.v1',
    {
      specType: input.specType,
      seed: input.seed,
      blocking: renderFindings(input.blocking),
      advisory: renderFindings(input.advisory),
    },
    { contentLanguage: input.contentLanguage },
  );
}
