import { assemblePrompt } from '../assemble-prompt';
import { topicBlock } from './interview-topics';
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
export const INTERVIEW_QUESTIONS_PROMPT_ID = 'interview.questions.v3';

/**
 * How the interviewer speaks, by audience profile (У-5; task 106).
 *
 * The plain register is `interview.questions.v2`'s own wording, carried across unchanged: it was
 * written for the M6 gate defect where a non-technical founder was asked what the constitution
 * document should emphasise, and nothing about У-5 makes that lesson less true. The technical
 * register lifts the vocabulary restriction and nothing else — the prohibition on asking about *our*
 * artifacts is above this block and applies to both, because it is about the process, not the reader.
 *
 * The value arrives as a plain string: `prompts` may import only `specs` (constitution A1), so the
 * `AudienceProfile` union stays in `projects` and an unrecognised value falls back to plain, which is
 * the safe direction — a developer asked plain questions loses a little precision; a non-technical
 * founder asked technical ones cannot answer at all.
 */
const PLAIN_RULES = [
  'They are not technical.',
  'Ask about THEIR product, in plain everyday words a friend would understand.',
  'Prefer concrete over abstract: "who opens this on a Monday morning?" beats "who are the',
  'stakeholders?". Offer options that are real possibilities, not categories.',
].join(' ');

const TECHNICAL_RULES = [
  'They build software and are comfortable with engineering vocabulary.',
  'Ask about THEIR product directly, and where a choice is technical, name it as one — data',
  'model, protocol, deployment target, failure mode. Do not translate an engineering decision',
  'into a metaphor. Offer options that are real alternatives an engineer would weigh, with the',
  'trade-off stated in the description rather than implied.',
].join(' ');

const AUDIENCE_RULES: Record<string, string> = {
  'non-technical': PLAIN_RULES,
  technical: TECHNICAL_RULES,
};

/** The register for a stored profile, defaulting to plain for anything unrecognised. */
export function audienceRules(audience: string): string {
  return AUDIENCE_RULES[audience] ?? PLAIN_RULES;
}

export const REPLY_ASSESSMENT_PROMPT_ID = 'interview.reply-assessment.skeleton.v1';
export const SESSION_SUMMARY_PROMPT_ID = 'interview.summary.skeleton.v1';

export interface InterviewQuestionsPromptInput {
  /**
   * A plain string, deliberately: `prompts` may import only `specs` (constitution A1 — the
   * allowed-edge table), so the stage union stays in `workflow` and the calling agent — which is
   * allowed to know it — passes the name through. Prompt text needs a label, not a type.
   */
  stage: string;
  /**
   * Who is being interviewed (У-5) — `non-technical` or `technical`, from the session.
   *
   * A plain string for the same reason `stage` is: the union lives in `projects`, which this module
   * may not import, and the caller is allowed to know it.
   */
  audience: string;
  /**
   * Which round this is for the current stage, 1-based.
   *
   * Real context, not bookkeeping: a third round should be narrower than a first, and a model with
   * no idea how far in it is has no way to calibrate that.
   */
  roundNumber: number;
  initialPrompt: string;
  summary: string | null;
  satisfiedNeeds: readonly string[];
  unmetNeeds: readonly string[];
  /** Set when the user replied in chat instead of submitting the card — ask narrower (FR-005 AC-6). */
  freeTextReply?: string;
  /**
   * The session's content language (У-1; task 108) — an ISO 639-1 code, or `null`/absent when
   * detection could not tell. Forwarded to the single assembly point, never acted on here.
   */
  contentLanguage?: string | null | undefined;
}

export function interviewQuestionsPrompt(input: InterviewQuestionsPromptInput): AssembledPrompt {
  return assemblePrompt(
    'interview.questions.v3',
    {
      stage: input.stage,
      audienceRules: audienceRules(input.audience),
      roundNumber: String(input.roundNumber),
      /*
       * The stage picks the topics on this side of the boundary (round 2, Д-3). What crosses is what
       * the round is about, in the user's terms — never the name of the file it feeds.
       */
      topics: topicBlock(input.stage),
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
    },
    { contentLanguage: input.contentLanguage },
  );
}

export interface ReplyAssessmentPromptInput {
  reply: string;
  declaredNeeds: readonly string[];
  /** See `InterviewQuestionsPromptInput.contentLanguage` (У-1; task 108). */
  contentLanguage?: string | null | undefined;
}

export function replyAssessmentPrompt(input: ReplyAssessmentPromptInput): AssembledPrompt {
  return assemblePrompt(
    'interview.reply-assessment.skeleton.v1',
    { declaredNeeds: input.declaredNeeds.join(', '), reply: input.reply },
    { contentLanguage: input.contentLanguage },
  );
}

export interface SessionSummaryPromptInput {
  initialPrompt: string;
  answeredHighlights: readonly string[];
  /** See `InterviewQuestionsPromptInput.contentLanguage` (У-1; task 108). */
  contentLanguage?: string | null | undefined;
}

export function sessionSummaryPrompt(input: SessionSummaryPromptInput): AssembledPrompt {
  return assemblePrompt(
    'interview.summary.skeleton.v1',
    {
      initialPrompt: input.initialPrompt,
      answered:
        input.answeredHighlights.length > 0 ? input.answeredHighlights.join('\n') : '(nothing yet)',
    },
    { contentLanguage: input.contentLanguage },
  );
}
