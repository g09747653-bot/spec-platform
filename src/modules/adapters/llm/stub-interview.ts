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
 * Since task 144 there is a second curriculum beside that one, for the concrete style, read out of
 * the prompt like the stage and the round number. It answers the `interview` stage only, and the
 * rounds above are untouched — their option ids are named by nine spec files and by the end-to-end
 * journey, and a fixture that renumbered them would fail suites that have nothing to do with it.
 *
 * The JSON deliberately matches `QuestionSetSchema` — the stub stands in for a well-behaved
 * model; the repair and rejection paths are exercised in unit tests with corrupted documents.
 */
interface StubOption {
  id: string;
  label: string;
  description?: string;
  recommended?: boolean;
  tags?: string[];
  note?: string;
  href?: string;
  logo?: string;
}

interface StubQuestion {
  id: string;
  text: string;
  type: 'single' | 'multiple';
  options: StubOption[];
  allowOther: true;
  informationNeeds: string[];
}

const option = (id: string, label: string, description?: string): StubOption => ({
  id,
  label,
  ...(description === undefined ? {} : { description }),
});

/**
 * The one option a well-behaved v3 model would advise (task 106; Эталон §1.1).
 *
 * Exactly one question of the stub's curriculum carries a recommendation, deliberately: the badge
 * has to be provably absent where the model did not mark anything, and a fixture that recommended
 * something everywhere could not show that.
 */
const recommend = (id: string, label: string, description: string): StubOption => ({
  ...option(id, label, description),
  recommended: true,
});

/**
 * An option carrying tag chips (task 134; row `1.1-6`).
 *
 * One option of the curriculum has them, for the same reason exactly one carries a recommendation:
 * the chips have to be provably absent where the model supplied none, and a fixture that tagged
 * everything could not show that.
 */
const tagged = (id: string, label: string, description: string, tags: string[]): StubOption => ({
  ...option(id, label, description),
  tags,
});

/**
 * An option carrying its reference note — logo, link, ⓘ and chips (task 144; видео §5).
 *
 * The concrete curriculum below is the only place this appears, and inside it exactly one question
 * mixes annotated options with bare ones, because the asymmetry is the thing that has to be provable:
 * the note belongs to the *option*, so a walk has to be able to show one option wearing all four
 * markers beside another wearing none, in one question, at one moment.
 *
 * The notes are deliberately long. A stub that writes only short lines passes a layout that breaks on
 * a real one — that lesson cost a gate run — so the shortest of them clears 160 characters, which is
 * about where a two-sentence note stops fitting on one line.
 */
const spravka = (
  id: string,
  label: string,
  description: string,
  reference: { note: string; href: string; logo?: string; tags: string[] },
): StubOption => ({
  ...option(id, label, description),
  note: reference.note,
  href: reference.href,
  ...(reference.logo === undefined ? {} : { logo: reference.logo }),
  tags: reference.tags,
});

function roundOne(stage: string): StubQuestion[] {
  if (stage === 'interview') {
    return [
      {
        id: 'q-audience',
        text: 'Who is this primarily for?',
        type: 'single',
        options: [
          tagged('solo-devs', 'Solo developers and indie hackers', 'One person, many projects', [
            'fastest to ship',
            'no team setup',
          ]),
          recommend('teams', 'Small development teams', 'Two to ten people sharing a backlog'),
          option('founders', 'Non-technical founders', 'People who describe, but do not build'),
        ],
        allowOther: true,
        informationNeeds: ['target-users'],
      },
      {
        id: 'q-problem',
        text: 'Which problems should it solve first?',
        type: 'multiple',
        options: [
          option('context', 'Agents lose context', 'The agent forgets what was decided earlier'),
          option('blank-page', 'Writing specs from a blank page', 'Nothing to start from'),
          option('review', 'No review workflow', 'Nobody checks the spec before it is built'),
          option('persistence', 'Nothing is persisted', 'Progress is lost when the tab closes'),
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
 * The concrete curriculum (task 144), drawn from the two worked rounds of the design.
 *
 * It exists beside the default one rather than replacing anything: nine spec files and
 * `e2e/fixtures/journey.ts` name the options of the rounds above by id, and a fixture that renumbered
 * them would fail suites that have nothing to do with this task. Only the `interview` stage has its
 * own concrete rounds; every later stage keeps the curriculum it already had, so a walk in this style
 * can use the same stage helpers it always used.
 *
 * Round 1 is where the asymmetry has to be visible, because the shortest legal path out of the
 * interview answers exactly one round: `q-provider` shows three options wearing note, link, logo and
 * chips beside two wearing none, and `q-key-handling` is a technical question with no technology in
 * any of its options — a key read from an environment variable is a behaviour, not a product.
 */
const CONCRETE_ROUND_ONE: StubQuestion[] = [
  {
    id: 'q-provider',
    text: 'Which provider should the drafting run through when you first switch it on?',
    type: 'single',
    options: [
      spravka(
        'anthropic',
        'Anthropic Claude',
        'One vendor, called directly: one key to hold, one SDK to keep current.',
        {
          note: 'Anthropic makes the Claude family of models and sells access to them directly through its own API. Choosing it means a single vendor, a single key, and a model line-up you follow rather than choose from.',
          href: 'https://www.anthropic.com',
          logo: 'anthropic',
          tags: ['llm provider', 'direct api', 'one key'],
        },
      ),
      spravka(
        'openai',
        'OpenAI',
        'The same shape of integration, against the vendor most of the surrounding tooling was written for.',
        {
          note: 'OpenAI makes the GPT family and sells access through its own API. Choosing it means the widest set of libraries and examples to borrow from, and the same single-vendor dependency any direct integration carries.',
          href: 'https://openai.com',
          logo: 'openai',
          tags: ['llm provider', 'direct api', 'broad tooling'],
        },
      ),
      {
        ...spravka(
          'openrouter',
          'OpenRouter',
          'One key reaches many vendors: you can change model later without touching the app.',
          {
            note: 'OpenRouter is a paid gateway that puts many vendors behind one key and one API shape. Choosing it means changing model is a config edit, and that someone else sits between you and whoever serves the request.',
            href: 'https://openrouter.ai',
            logo: 'openrouter',
            tags: ['gateway', 'many vendors', 'one key'],
          },
        ),
        recommended: true,
      },
      option(
        'byo-key',
        'Bring your own key',
        'Each person pastes the key for the account they already have; nothing is billed centrally.',
      ),
      option(
        'no-preference',
        'No preference — recommend the best fit',
        'The default is chosen for you and written down with the reason; it stays changeable later.',
      ),
    ],
    allowOther: true,
    informationNeeds: ['model-provider'],
  },
  {
    id: 'q-key-handling',
    text: 'How should it get hold of that key on the machine you run it on?',
    type: 'single',
    options: [
      option(
        'env-var',
        'From an environment variable set by whoever deploys it',
        'Nothing to type after the first setup, and anything else running as that user can read it.',
      ),
      option(
        'os-keychain',
        "From the operating system's keychain, unlocked at login",
        'The key never sits in a file you could copy by accident; a machine nobody logs into cannot unlock it.',
      ),
      option(
        'first-run-prompt',
        'Typed once on first run and kept in a file only that user can read',
        'One prompt and then never again, at the cost of a key in plain text on disk.',
      ),
      option(
        'every-start',
        'Asked for every time it starts',
        'Nothing is stored anywhere, and it cannot start on its own after a reboot.',
      ),
    ],
    allowOther: true,
    informationNeeds: ['credential-storage'],
  },
];

/**
 * Round 2 — the same asymmetry, plus the case that degrades field by field.
 *
 * `self-run-postgres` names a technology with no vendored logo, so it keeps its note and its link and
 * loses only the slug. That is «dropped, not rejected» made visible: the half of the reference that is
 * useful does not leave with the half that is decorative.
 */
const CONCRETE_ROUND_TWO: StubQuestion[] = [
  {
    id: 'q-store',
    text: "Where should your team's work and its history live?",
    type: 'single',
    options: [
      spravka(
        'sqlite',
        'A SQLite file on the machine that runs it',
        'Nothing else to install or pay for; a backup is a file copy, and only that machine can read it.',
        {
          note: 'SQLite is a SQL database that lives in a single file on disk, with no server to install or keep running. Choosing it means backups are a file copy, and everything reading the data sits on the machine holding that file.',
          href: 'https://sqlite.org',
          logo: 'sqlite',
          tags: ['embedded', 'single file', 'sql'],
        },
      ),
      spravka(
        'neon',
        'Neon, a hosted Postgres',
        "Ordinary SQL several machines can reach at once, on someone else's hardware and someone else's bill.",
        {
          note: 'Neon runs PostgreSQL as a managed service, with storage separated from compute so an idle database costs little. Choosing it means ordinary SQL, and a third party holding what your team writes.',
          href: 'https://neon.com',
          logo: 'neon',
          tags: ['managed postgres', 'sql', 'hosted'],
        },
      ),
      spravka(
        'self-run-postgres',
        'PostgreSQL on a server you already run',
        'The data never leaves your own hardware, and the upgrades and backups are yours to do.',
        {
          note: 'PostgreSQL is the open-source SQL database most of this list runs or imitates. Choosing it on your own server means nobody else holds the data, and that upgrades, backups and uptime become your work.',
          href: 'https://www.postgresql.org',
          tags: ['self-hosted', 'sql', 'your backups'],
        },
      ),
      option(
        'no-preference-store',
        'No preference — recommend the best fit',
        'The default is chosen for you and written down with the reason; it stays changeable later.',
      ),
    ],
    allowOther: true,
    informationNeeds: ['persistence-layer'],
  },
  {
    id: 'q-first-run',
    text: 'When you first point it at a mailbox that already holds ten thousand messages, what should happen?',
    type: 'single',
    options: [
      option(
        'new-only',
        'Nothing to the backlog — work only on what arrives after it starts',
        'The first run costs nothing and finishes at once; the ten thousand stay untouched for good.',
      ),
      option(
        'backfill-all',
        'Work through everything still unanswered, oldest first, in the background',
        "The backlog clears on its own, and the first day's bill is the largest one you will see.",
      ),
      option(
        'recent-window',
        'Cover the last thirty days and leave the rest alone',
        'What anyone still cares about gets covered, and something older will be missed.',
      ),
      option(
        'ask-once',
        'Ask once, then remember the answer for every mailbox after it',
        'You decide with the mailbox in front of you; there is one more question in the way of starting.',
      ),
    ],
    allowOther: true,
    informationNeeds: ['first-run-backfill'],
  },
];

/** Round 3 — narrower, and bare end to end: a round carrying no notes at all is a correct round. */
const CONCRETE_ROUND_THREE: StubQuestion[] = [
  {
    id: 'q-first-slice',
    text: 'Which piece do you want working end to end first?',
    type: 'single',
    options: [
      option(
        'one-mailbox',
        'The whole path, for one mailbox and one person',
        'It proves itself on day one; nobody else can use it until the second piece lands.',
      ),
      option(
        'the-screen',
        'The screen, against material you paste in by hand',
        'Your team can react to the shape of the work before any model is wired in.',
      ),
      option(
        'provider-plumbing',
        'The provider plumbing — keys, retries, fallbacks — before any screen',
        'The part most likely to be rebuilt is settled first, and there is nothing to look at for a while.',
      ),
    ],
    allowOther: true,
    informationNeeds: ['build-order'],
  },
];

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

/**
 * Which style the round was asked in, read back out of the prompt (task 144).
 *
 * Off the register's own words, for the reason the stage and the round number are read the same way:
 * the stub is a provider and sees only the prompt. `vary what you ask about` appears in the concrete
 * register and in neither of the other two, so it names the style without a marker invented for the
 * fixture's benefit — a sentinel would let the two drift, and the point of reading the text is that
 * they cannot.
 */
export function styleFromInterviewPrompt(prompt: string): string {
  return prompt.includes('vary what you ask about') ? 'concrete' : 'default';
}

/** The stub model's answer to "draft round N for this stage" — JSON matching the question-set shape. */
export function stubInterviewRoundDocument(
  stage: string,
  roundNumber: number,
  style = 'default',
): string {
  const concrete = style === 'concrete' && stage === 'interview';

  const questions = concrete
    ? roundNumber <= 1
      ? CONCRETE_ROUND_ONE
      : roundNumber === 2
        ? CONCRETE_ROUND_TWO
        : roundNumber === 3
          ? CONCRETE_ROUND_THREE
          : []
    : roundNumber <= 1
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

/**
 * The analytical bridge (task 132; Эталон §1.2).
 *
 * Recognised by the sentinel the prompt asks a declining model to answer with, which appears in no
 * other asset. The stub never declines: a walk that has to *see* a bridge cannot assert on one the
 * double decided to skip, and the declining branch is exercised in the agent's own unit test.
 */
export function looksLikeInterviewBridgePrompt(prompt: string): boolean {
  return prompt.includes('NOTHING TO FLAG');
}

/**
 * The stub's comment between two rounds — deterministic, visibly synthetic, and **naming an answer**.
 *
 * Naming one matters: the acceptance criterion for the bridge is that it builds on what was chosen,
 * and a canned sentence that could have been written before the interview started would let a walk
 * pass while the prompt was going out empty.
 */
export function stubInterviewBridgeDocument(prompt: string): string {
  /*
   * The first answered line of the assembled context, whichever shape it takes: the card path hands
   * the bridge «question — chosen labels» (task 135), the reply path hands the reply itself.
   */
  const chosen =
    /^- .*?: (.+)$/m.exec(prompt)?.[1]?.split(';')[0]?.trim() ?? 'what you have chosen so far';

  return [
    `Noted: you chose ${chosen}.`,
    'That sits awkwardly beside the rest of this round, so the next questions will pin down which of',
    'the two matters more. (Produced by the deterministic stub, not by a model.)',
  ].join(' ');
}
