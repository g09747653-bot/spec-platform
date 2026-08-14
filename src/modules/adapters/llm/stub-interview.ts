/**
 * Deterministic interview documents for the stub provider (task 33 on the test double; the
 * milestone runs with no LLM key — START_HERE M2).
 *
 * Like `stubDocumentFor`, everything here is plainly synthetic and keyed by plain strings: an
 * adapter may not import a core module (constitution A1), so stage names arrive as labels and the
 * composition root picks the document. The rounds follow a fixed curriculum per stage, which is
 * what makes the interview E2E-testable without a model:
 *
 * - round 1 asks two questions (target users, core problem — or the stage's scope and
 *   constraints);
 * - round 2 asks about success criteria and delivery constraints;
 * - round 3 is the narrower follow-up: one question, one need;
 * - beyond round 3 there is nothing left to ask and the document declares no questions.
 *
 * The JSON deliberately matches `QuestionSetSchema` — the stub stands in for a well-behaved
 * model; the repair and rejection paths are exercised in unit tests with corrupted documents.
 */
interface StubQuestion {
  id: string;
  text: string;
  type: 'single' | 'multiple';
  options: { id: string; label: string; description?: string }[];
  allowOther: true;
  informationNeeds: string[];
}

const option = (id: string, label: string): { id: string; label: string } => ({ id, label });

function roundOne(stage: string): StubQuestion[] {
  if (stage === 'interview') {
    return [
      {
        id: 'q-audience',
        text: 'Who is this primarily for?',
        type: 'single',
        options: [
          option('solo-devs', 'Solo developers and indie hackers'),
          option('teams', 'Small development teams'),
          option('founders', 'Non-technical founders'),
        ],
        allowOther: true,
        informationNeeds: ['target-users'],
      },
      {
        id: 'q-problem',
        text: 'Which problems should it solve first?',
        type: 'multiple',
        options: [
          option('context', 'Agents lose context'),
          option('blank-page', 'Writing specs from a blank page'),
          option('review', 'No review workflow'),
          option('persistence', 'Nothing is persisted'),
        ],
        allowOther: true,
        informationNeeds: ['core-problem'],
      },
    ];
  }

  return [
    {
      id: `q-${stage}-scope`,
      text: `What should the ${stage} document emphasise?`,
      type: 'single',
      options: [
        option('strict', 'Strict, minimal and testable'),
        option('broad', 'Broad context with rationale'),
        option('balanced', 'A balance of both'),
      ],
      allowOther: true,
      informationNeeds: [`${stage}-focus`],
    },
  ];
}

function roundTwo(stage: string): StubQuestion[] {
  if (stage !== 'interview') return [];

  return [
    {
      id: 'q-success',
      text: 'What does success look like for v1?',
      type: 'single',
      options: [
        option('parity', 'Parity with the reference tool'),
        option('speed', 'Fastest possible path to a bundle'),
        option('quality', 'Highest spec quality per bundle'),
      ],
      allowOther: true,
      informationNeeds: ['success-criteria'],
    },
    {
      id: 'q-constraints',
      text: 'Which constraints are non-negotiable?',
      type: 'multiple',
      options: [
        option('stack', 'A mandated technology stack'),
        option('budget', 'A fixed budget'),
        option('deadline', 'A fixed deadline'),
        option('compliance', 'Compliance requirements'),
      ],
      allowOther: true,
      informationNeeds: ['constraints'],
    },
  ];
}

function roundThree(stage: string): StubQuestion[] {
  if (stage !== 'interview') return [];

  return [
    {
      id: 'q-success-narrow',
      text: 'Narrowing down: which single measure decides success?',
      type: 'single',
      options: [
        option('no-rewrite', 'A bundle usable without rewriting'),
        option('time-to-zip', 'Prompt-to-ZIP time'),
      ],
      allowOther: true,
      informationNeeds: ['success-criteria'],
    },
  ];
}

/**
 * Recognising the interview prompts, so the stub *provider* can answer them (round 2, Д-3).
 *
 * These matter because of what they replace. The interview endpoints used to construct a test double
 * directly — `createTestDoubleAdapter({ document: stubInterviewRoundDocument(...) })` — with a
 * Milestone 2 comment promising that tasks 42–45 would swap the composition root. Those tasks swapped
 * generation, review, revision and refinement, and left the interview behind. Every question every
 * user has ever been asked came from the canned text below, on a deployment paying for a real model.
 *
 * Now the endpoints use `createDefaultAdapter()` like everything else, and the stub answers the
 * prompt it is given — the same arrangement review and refinement have had since M4. The end-to-end
 * suite still gets deterministic questions, because it points the chain at `stub`; a deployment gets
 * the model it pays for.
 *
 * Keyed off plain strings: an adapter may not import a core module (constitution A1).
 */
export function looksLikeInterviewRoundPrompt(prompt: string): boolean {
  return (
    prompt.includes('"questions": [{"id", "text"') || prompt.includes('This round should cover')
  );
}

export function looksLikeSummaryPrompt(prompt: string): boolean {
  return prompt.includes('Summarise the interview so far');
}

export function looksLikeReplyAssessmentPrompt(prompt: string): boolean {
  return prompt.includes('"satisfiedNeeds"') && prompt.includes('Judge which of the listed');
}

/** The stage the round is being collected for, read back out of the assembled prompt. */
export function stageFromInterviewPrompt(prompt: string): string {
  return /Set "stage" to "([a-z]+)"/.exec(prompt)?.[1] ?? 'interview';
}

/**
 * Which round this is, read back out of the prompt.
 *
 * The endpoint used to hand the number straight to a double it built itself. Now the stub is a
 * provider like any other and sees only the prompt — so the prompt carries the number, which a real
 * model wants anyway: a third round should be narrower than a first.
 */
export function roundNumberFromInterviewPrompt(prompt: string): number {
  const stated = /question round (\d+) for this part/.exec(prompt)?.[1];

  return stated === undefined ? 1 : Number(stated);
}

/** The stub model's answer to "draft round N for this stage" — JSON matching the question-set shape. */
export function stubInterviewRoundDocument(stage: string, roundNumber: number): string {
  const questions =
    roundNumber <= 1
      ? roundOne(stage)
      : roundNumber === 2
        ? roundTwo(stage)
        : roundNumber === 3
          ? roundThree(stage)
          : [];

  return JSON.stringify({ stage, questions }, null, 2);
}

/**
 * The stub assessment of a free-text reply: deliberately conservative — it never claims a need
 * was satisfied (FR-005 AC-6's "proceed if the reply covers the need" is exercised in unit tests
 * with a configured document; the walking flow takes the narrower-follow-up branch).
 */
export function stubReplyAssessmentDocument(): string {
  return JSON.stringify({ satisfiedNeeds: [] });
}

/** The stub session summary — deterministic, non-blank, visibly synthetic. */
export function stubSessionSummaryDocument(topic: string): string {
  const headline =
    topic
      .split('\n')
      .find((line) => line.trim() !== '')
      ?.trim() ?? 'the idea';

  return [
    `Building: ${headline}.`,
    'Target users and the core problem were captured in the interview;',
    'constraints and success criteria are recorded with the answers.',
  ].join(' ');
}
