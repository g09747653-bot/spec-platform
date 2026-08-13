import type { AssembledPrompt } from './spec-generation';

/**
 * Prompt assets for the structured interview (constitution — Coding Standards: prompts are
 * versioned assets referenced by identifier; task 33, 36, 38).
 *
 * Three prompts, three artifacts: a question round, an assessment of a free-text reply, a session
 * summary. None of them contains a control rule — how many rounds may be asked, whether the
 * interview may end, which needs count as satisfied in the record — all of that is enforced by
 * gates and schemas in code (P1). The prompts ask for **content** in a declared JSON or prose
 * shape, and everything returned is Zod-validated before it is persisted or shown.
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
  const system = [
    'You are conducting a structured product interview. Draft the next round of questions as',
    'JSON only — no prose, no code fence. Shape:',
    '{"stage": "<stage>", "questions": [{"id", "text", "type": "single"|"multiple",',
    '"options": [{"id", "label", "description?"}], "allowOther": true,',
    '"informationNeeds": ["<need>"]}]}.',
    'Between 2 and 8 options per question; every question carries allowOther: true and names the',
    'information needs it is meant to satisfy. Return {"stage": "<stage>", "questions": []} when',
    'nothing further is worth asking.',
  ].join(' ');

  const user = [
    `Stage: ${input.stage}`,
    '',
    'Product idea:',
    input.initialPrompt,
    ...(input.summary === null ? [] : ['', 'Session summary so far:', input.summary]),
    '',
    `Information needs already satisfied (do not ask about these again): ${
      input.satisfiedNeeds.length > 0 ? input.satisfiedNeeds.join(', ') : '(none)'
    }`,
    `Information needs still outstanding: ${
      input.unmetNeeds.length > 0 ? input.unmetNeeds.join(', ') : '(none declared yet)'
    }`,
    ...(input.freeTextReply === undefined
      ? []
      : [
          '',
          'The user answered the previous card in free text instead of submitting it. Ask a',
          'narrower follow-up covering only what this reply leaves open:',
          input.freeTextReply,
        ]),
  ].join('\n');

  return { id: INTERVIEW_QUESTIONS_PROMPT_ID, system, user };
}

export interface ReplyAssessmentPromptInput {
  reply: string;
  declaredNeeds: readonly string[];
}

export function replyAssessmentPrompt(input: ReplyAssessmentPromptInput): AssembledPrompt {
  const system = [
    'Judge which of the listed information needs the reply demonstrably answers. Be conservative:',
    'when in doubt, leave a need out. Return JSON only: {"satisfiedNeeds": ["<need>"]} — a subset',
    'of the listed needs, possibly empty.',
  ].join(' ');

  const user = [
    `Information needs: ${input.declaredNeeds.join(', ')}`,
    '',
    'Reply:',
    input.reply,
  ].join('\n');

  return { id: REPLY_ASSESSMENT_PROMPT_ID, system, user };
}

export interface SessionSummaryPromptInput {
  initialPrompt: string;
  answeredHighlights: readonly string[];
}

export function sessionSummaryPrompt(input: SessionSummaryPromptInput): AssembledPrompt {
  const system = [
    'Summarise the interview so far in 2–4 plain sentences: what is being built, for whom, and',
    'the key constraints. Return the summary text only.',
  ].join(' ');

  const user = [
    'Product idea:',
    input.initialPrompt,
    '',
    'Answered so far:',
    ...(input.answeredHighlights.length > 0 ? input.answeredHighlights : ['(nothing yet)']),
  ].join('\n');

  return { id: SESSION_SUMMARY_PROMPT_ID, system, user };
}
