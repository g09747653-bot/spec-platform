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

/**
 * The concrete register (task 144; директива заказчика 2026-08-18; видео §5–6).
 *
 * The other two registers choose a vocabulary. This one chooses a *subject*: what to build, how it
 * should be built, and how the person will use it once it runs — and nothing else. The prohibitions
 * are the load-bearing half, because the customer's complaint («что должен чувствовать муравей») was
 * not that the words were too hard; it was a question with no answer that changes anything, asked
 * through an invented character. That shape of question is one both existing registers permit, so it
 * has to be banned by name.
 *
 * Selected by style, not by audience (see `audienceRules`): it replaces the profile's register
 * rather than composing with it.
 */
const CONCRETE_RULES = [
  'They want the build pinned down, not explored.',
  'Ask only three kinds of thing: what to build, how they want it built, and how they will use it',
  'once it runs. Address them as "you" in every question and in every option, and sound the same in',
  'round three as in round one: vary what you ask about, never how you ask it. Every option is',
  'something you say to them, never something they say back — no label and no description in the',
  'first person. Never ask what someone else would feel, want or notice, never invent a persona, a',
  'story or a scene to ask through, never ask for an adjective, never put a decision into a',
  'metaphor. Ask about use as observable behaviour — what they run first, how often they come back,',
  'what they do the day it breaks — never about mood, motivation or personality. Every question',
  'settles one thing they could decide today and a builder could act on tomorrow, and no two',
  'questions in a round settle the same thing; drop any question whose answers would all leave the',
  'built thing identical. Never ask for a number they would have to go and measure, and never',
  'assume a decision they have not yet taken. Every option is something that can be chosen and then',
  'done — a named technology, a mechanism, a limit, an order of work — never a category, a theme or',
  'an adjective, and never "a balance of both". Do not build a question out of interchangeable',
  'products: where the options would differ only in the name on the bill, that is a setting, not a',
  'question. Name technologies where they commit the build to something different — a different',
  'data model, a different place it runs, a different failure — and give every such question one',
  'option that declines: "No preference — recommend the best fit".',
].join(' ');

const AUDIENCE_RULES: Record<string, string> = {
  'non-technical': PLAIN_RULES,
  technical: TECHNICAL_RULES,
};

/**
 * The register for a stored profile and style, defaulting to plain for anything unrecognised.
 *
 * The style **displaces** the profile rather than adding to it (task 144): «they are not technical»
 * plus «name the actual technology» is a round that hedges every option into a category, which is
 * precisely the defect the concrete style exists to remove. Naming a technology to a non-technical
 * reader costs nothing here for one reason — in this register a named technology always arrives with
 * its own note, so the option explains itself.
 *
 * Both arguments are plain strings, and both fall back the same way: `prompts` may import only
 * `specs` (constitution A1), so the unions live in `projects` and an unrecognised value means the
 * behaviour that existed before it was written.
 */
export function audienceRules(audience: string, style?: string): string {
  return style === 'concrete' ? CONCRETE_RULES : (AUDIENCE_RULES[audience] ?? PLAIN_RULES);
}

export const REPLY_ASSESSMENT_PROMPT_ID = 'interview.reply-assessment.skeleton.v1';
export const SESSION_SUMMARY_PROMPT_ID = 'interview.summary.skeleton.v1';
export const INTERVIEW_BRIDGE_PROMPT_ID = 'interview.bridge.v1';

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
   * What the interview asks about (task 144) — `concrete`, or absent for the profile's own register.
   *
   * A plain string for the same reason `audience` is, and optional rather than defaulted: a caller
   * that has no style in hand means the register that existed before the style did.
   */
  style?: string | undefined;
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
   * The bounds the draft will be validated against (task 133; row `1.2-2`).
   *
   * Passed in rather than imported: they live in `agents/schemas/question-set.ts`, which this module
   * may not import (A1), and the point of passing them is that the instruction and the check are the
   * same numbers rather than two opinions about one rule.
   */
  questionsPerRound: { readonly max: number };
  optionsPerQuestion: { readonly min: number; readonly max: number };
  /**
   * What a note on an option may be, and which logos exist to name (task 144), from the same schema
   * and for the same reason as the bounds above.
   *
   * `logoSlugs` matters most: the list the model reads and the list the renderer can actually draw
   * have to be one list, or a slug with no vendored SVG becomes a suggestion. Interpolated rather
   * than written into the template, so a newly vendored logo becomes offerable without a prompt edit.
   */
  optionNote: { readonly max: number };
  logoSlugs: readonly string[];
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
      audienceRules: audienceRules(input.audience, input.style),
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
      /*
       * The round's size, from the schema that enforces it (task 133; row `1.2-2`).
       *
       * `prompts` may import `specs` and nothing else (constitution A1), so the numbers arrive from
       * the caller rather than being read here — the agent owns the schema and is allowed to know it.
       */
      minOptions: String(input.optionsPerQuestion.min),
      maxOptions: String(input.optionsPerQuestion.max),
      maxQuestions: String(input.questionsPerRound.max),
      maxNoteChars: String(input.optionNote.max),
      logoSlugs: input.logoSlugs.join(', '),
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

export interface InterviewBridgePromptInput {
  /** The assembled context: the product idea and the answers given so far (А-8). */
  context: string;
  unmetNeeds: readonly string[];
  /**
   * See `InterviewQuestionsPromptInput.contentLanguage` (У-1; task 108).
   *
   * Load-bearing here rather than incidental: the bridge is the interviewer speaking, and an
   * English paragraph between two Russian rounds is exactly the reference product's own weakness
   * that У-1 was written to beat.
   */
  contentLanguage?: string | null | undefined;
}

export function interviewBridgePrompt(input: InterviewBridgePromptInput): AssembledPrompt {
  return assemblePrompt(
    'interview.bridge.v1',
    {
      context: input.context,
      unmetNeeds: input.unmetNeeds.length > 0 ? input.unmetNeeds.join(', ') : '(nothing)',
    },
    { contentLanguage: input.contentLanguage },
  );
}
