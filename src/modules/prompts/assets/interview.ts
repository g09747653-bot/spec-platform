import { assemblePrompt } from '../assemble-prompt';
import type { AssembledPrompt } from '../registry';

/**
 * The interview prompts, as calls on the registry (tasks 33, 36, 38; migrated in task 41).
 *
 * The text moved to `registry.ts`; the identifiers, wording and call signatures did not, so the M2
 * agents and their tests see exactly what they saw before. What these functions do now is render the
 * conditional blocks — a summary that may not exist yet, a free-text reply that may not have
 * happened — into the strings the templates interpolate.
 *
 * None of them contains a control rule: how many rounds may be asked, whether the interview may end,
 * which needs count as satisfied are all gates in code (constitution P1).
 */
export const INTERVIEW_QUESTIONS_PROMPT_ID = 'interview.questions.skeleton.v1';
export const REPLY_ASSESSMENT_PROMPT_ID = 'interview.reply-assessment.skeleton.v1';
export const SESSION_SUMMARY_PROMPT_ID = 'interview.summary.skeleton.v1';

export interface InterviewQuestionsPromptInput {
  /**
   * A plain string, deliberately: `prompts` may import only `specs` (constitution A1 — the
   * allowed-edge table), so the stage union stays in `workflow` and the calling agent — which is
   * allowed to know it — passes the name through. Prompt text needs a label, not a type.
   */
  stage: string;
  initialPrompt: string;
  summary: string | null;
  satisfiedNeeds: readonly string[];
  unmetNeeds: readonly string[];
  /** Set when the user replied in chat instead of submitting the card — ask narrower (FR-005 AC-6). */
  freeTextReply?: string;
}

export function interviewQuestionsPrompt(input: InterviewQuestionsPromptInput): AssembledPrompt {
  return assemblePrompt('interview.questions.skeleton.v1', {
    stage: input.stage,
    initialPrompt: input.initialPrompt,
    summaryBlock: input.summary === null ? '' : `\nSession summary so far:\n${input.summary}`,
    satisfiedNeeds: input.satisfiedNeeds.length > 0 ? input.satisfiedNeeds.join(', ') : '(none)',
    unmetNeeds: input.unmetNeeds.length > 0 ? input.unmetNeeds.join(', ') : '(none declared yet)',
    replyBlock:
      input.freeTextReply === undefined
        ? ''
        : [
            '',
            'The user answered the previous card in free text instead of submitting it. Ask a',
            'narrower follow-up covering only what this reply leaves open:',
            input.freeTextReply,
          ].join('\n'),
  });
}

export interface ReplyAssessmentPromptInput {
  reply: string;
  declaredNeeds: readonly string[];
}

export function replyAssessmentPrompt(input: ReplyAssessmentPromptInput): AssembledPrompt {
  return assemblePrompt('interview.reply-assessment.skeleton.v1', {
    declaredNeeds: input.declaredNeeds.join(', '),
    reply: input.reply,
  });
}

export interface SessionSummaryPromptInput {
  initialPrompt: string;
  answeredHighlights: readonly string[];
}

export function sessionSummaryPrompt(input: SessionSummaryPromptInput): AssembledPrompt {
  return assemblePrompt('interview.summary.skeleton.v1', {
    initialPrompt: input.initialPrompt,
    answered:
      input.answeredHighlights.length > 0 ? input.answeredHighlights.join('\n') : '(nothing yet)',
  });
}
