import { describe, expect, it } from 'vitest';

import { validateQuestionSetDraft } from '../schemas/question-set';
import {
  CONCRETE_UNDECIDED,
  checkConcreteRound,
  type ConcreteFinding,
  type ConcreteRubricInput,
} from './concrete-rubric';

/**
 * Task 144 — the scripted rubric of the concrete register (§4 of the design).
 *
 * The two worked rounds of §5 are the fixtures, verbatim, and they carry the load: round A is dense
 * with reference notes, round B has **none at all**, and both must come back with nothing blocking.
 * Round B is the more important of the two — «a round with no notes is a correct round» is written
 * into §4.6 as a non-rule, and a rubric that quietly treated a bare round as a defect would fail
 * exactly the question about a refusal policy that this register exists to ask.
 *
 * After them, one corrupted copy per rule, with the finding ids compared exactly, in the manner of
 * `lint-spec.test.ts`. Every assertion here is about a *measurement*: the same bytes give the same
 * findings, and there is nothing in this file that could reach a model.
 */

const SEED =
  'An internal tool that turns incoming customer email into draft replies our support team edits and sends';

interface RoundOption {
  id: string;
  label: string;
  description?: string;
  recommended?: boolean;
  tags?: string[];
  note?: unknown;
  href?: unknown;
  logo?: unknown;
}

interface RoundQuestion {
  id: string;
  text: string;
  type: string;
  options: RoundOption[];
  allowOther: boolean;
  informationNeeds: string[];
}

interface Round {
  stage: string;
  questions: RoundQuestion[];
}

/** §5.1 — stage `solution`, round 2: 4 questions, 18 options, 9 of them with a reference note. */
const ROUND_SOLUTION: Round = {
  stage: 'solution',
  questions: [
    {
      id: 'q-provider',
      text: 'Which provider should the drafting run through when you first switch it on?',
      type: 'single',
      options: [
        {
          id: 'anthropic',
          label: 'Anthropic Claude',
          description:
            'One vendor, called directly: one key to hold, one SDK to keep current, one place to look when a draft comes back wrong.',
          note: 'Anthropic makes the Claude family of models and sells access to them directly through its own API. Choosing it means a single vendor, a single key, and a model line-up you follow rather than choose from.',
          href: 'https://www.anthropic.com',
          logo: 'anthropic',
          tags: ['llm provider', 'direct api', 'one key'],
        },
        {
          id: 'openai',
          label: 'OpenAI',
          description:
            'The same shape of integration, against the vendor most of the surrounding tooling was written for.',
          note: 'OpenAI makes the GPT family and sells access through its own API. Choosing it means the widest set of libraries and examples to borrow from, and the same single-vendor dependency any direct integration carries.',
          href: 'https://openai.com',
          logo: 'openai',
          tags: ['llm provider', 'direct api', 'broad tooling'],
        },
        {
          id: 'openrouter',
          label: 'OpenRouter',
          description:
            'One key reaches many vendors: you can change model later without touching the app, and a third party sits in the path.',
          recommended: true,
          note: "OpenRouter is a paid gateway that puts many vendors' models behind one key and one API shape. Choosing it means changing model is a config edit, and that someone else sits between you and whoever serves the request.",
          href: 'https://openrouter.ai',
          logo: 'openrouter',
          tags: ['gateway', 'many vendors', 'one key'],
        },
        {
          id: 'byo-key',
          label: 'Bring your own key',
          description:
            'Each person pastes the key for whatever account they already have; nothing is billed centrally and no key is stored for the team.',
        },
        {
          id: 'no-preference',
          label: 'No preference — recommend the best fit',
          description:
            'The default is chosen for you and written down with the reason; it stays changeable later.',
        },
      ],
      allowOther: true,
      informationNeeds: ['model-provider', 'vendor-lock-in'],
    },
    {
      id: 'q-store',
      text: "Where should your team's drafts and their history live?",
      type: 'single',
      options: [
        {
          id: 'sqlite',
          label: 'A SQLite file on the machine that runs it',
          description:
            'Nothing else to install or pay for; a backup is a file copy, and only that one machine can read it.',
          note: 'SQLite is a SQL database that lives in a single file on disk, with no server to install or keep running. Choosing it means backups are a file copy, and everything reading the data sits on the machine holding that file.',
          href: 'https://sqlite.org',
          logo: 'sqlite',
          tags: ['embedded', 'single file', 'sql'],
        },
        {
          id: 'neon',
          label: 'Neon, a hosted Postgres',
          description:
            "Ordinary SQL that several machines can reach at once, on someone else's hardware and someone else's bill.",
          recommended: true,
          note: 'Neon runs PostgreSQL as a managed service, with storage separated from compute so an idle database costs little. Choosing it means ordinary SQL, and a third party holding the mail your team drafts against.',
          href: 'https://neon.com',
          logo: 'neon',
          tags: ['managed postgres', 'sql', 'hosted'],
        },
        {
          id: 'mongodb',
          label: 'MongoDB',
          description:
            'Each draft stored whole, with whatever fields it happens to have; reporting across drafts gets harder later.',
          note: 'MongoDB stores records as documents rather than rows, and Atlas is the hosted version its makers run. Choosing it means no schema to agree on up front, and no joins on the day you want them.',
          href: 'https://www.mongodb.com',
          logo: 'mongodb',
          tags: ['document store', 'flexible schema', 'hosted'],
        },
        {
          id: 'self-run-postgres',
          label: 'PostgreSQL on a server you already run',
          description:
            'The customer mail never leaves your own hardware, and the upgrades and backups are yours to do.',
          note: 'PostgreSQL is the open-source SQL database most of this list runs or imitates. Choosing it on your own server means nobody else holds the data, and that upgrades, backups and uptime become your work.',
          href: 'https://www.postgresql.org',
          tags: ['self-hosted', 'sql', 'your backups'],
        },
        {
          id: 'no-preference',
          label: 'No preference — recommend the best fit',
          description:
            'The default is chosen for you and written down with the reason; it stays changeable later.',
        },
      ],
      allowOther: true,
      informationNeeds: ['persistence-layer', 'data-residency'],
    },
    {
      id: 'q-key-handling',
      text: 'How should it get hold of the provider key on the machine you run it on?',
      type: 'single',
      options: [
        {
          id: 'env-var',
          label: 'From an environment variable set by whoever deploys it',
          description:
            'Nothing to type after the first setup, and the key is readable by anything else running as that user.',
        },
        {
          id: 'os-keychain',
          label: "From the operating system's keychain, unlocked at login",
          description:
            'The key never sits in a file you could accidentally copy; a machine nobody logs into cannot unlock it.',
        },
        {
          id: 'first-run-prompt',
          label: 'Typed once on first run and kept in a file only that user can read',
          description:
            'One prompt and then never again, at the cost of a key in plain text on disk.',
        },
        {
          id: 'every-start',
          label: 'Asked for every time it starts',
          description: 'Nothing is stored anywhere, and it cannot start on its own after a reboot.',
        },
      ],
      allowOther: true,
      informationNeeds: ['credential-storage'],
    },
    {
      id: 'q-surface',
      text: 'How should your team open the queue of drafts?',
      type: 'single',
      options: [
        {
          id: 'nextjs-app',
          label: 'A page in the browser, served by Next.js',
          description:
            'One address anyone on the team opens; you host a server, and the screen and its API ship together.',
          recommended: true,
          note: 'Next.js is a React framework that renders pages on the server and brings its own routing and build. Choosing it means one codebase for the screen and its API, and a deployment target that expects a Node process.',
          href: 'https://nextjs.org',
          logo: 'nextjs',
          tags: ['react framework', 'server rendered', 'web'],
        },
        {
          id: 'react-spa',
          label: 'A React app talking to a small API',
          description:
            'The screen can be hosted as plain files anywhere, and the API behind it becomes a second thing to build and run.',
          note: 'React is the library the interface itself would be written in; on its own it draws the screen and nothing else. Choosing it alone means a separate API to build, and a page that is blank until its script loads.',
          href: 'https://react.dev',
          logo: 'react',
          tags: ['frontend', 'single page', 'javascript'],
        },
        {
          id: 'mail-client-plugin',
          label: 'Inside the mail client they already have open',
          description:
            "Nobody learns a new screen; you are then bound to what that client's plugins are allowed to do.",
        },
        {
          id: 'cli',
          label: 'A command on one machine, run when someone wants a batch',
          description:
            'Least to build and nothing to host; only the person at that machine can work the queue.',
        },
      ],
      allowOther: true,
      informationNeeds: ['primary-surface', 'team-access'],
    },
  ],
};

/** §5.2 — stage `tasks`, round 1: 4 questions, 16 options, and not one reference note. */
const ROUND_TASKS: Round = {
  stage: 'tasks',
  questions: [
    {
      id: 'q-first-slice',
      text: 'Which piece do you want working end to end first?',
      type: 'single',
      options: [
        {
          id: 'one-mailbox',
          label: 'Mail in, draft out, for one mailbox and one person',
          description:
            'The whole path proves itself on day one; nobody else can use it until the second piece lands.',
          recommended: true,
          tags: ['thinnest slice', 'proves the path'],
        },
        {
          id: 'queue-screen',
          label: 'The queue screen, against drafts you paste in by hand',
          description: 'Your team can react to the shape of the work before any model is wired in.',
          tags: ['feedback first'],
        },
        {
          id: 'provider-plumbing',
          label: 'The provider plumbing — keys, retries, fallbacks — before any screen',
          description:
            'The part most likely to be rebuilt is settled first, and there is nothing to look at for a while.',
        },
        {
          id: 'history-import',
          label: 'Import of the mail your team has already answered',
          description:
            'The first drafts sound like your team rather than like a model, and no draft appears until the import works.',
        },
      ],
      allowOther: true,
      informationNeeds: ['build-order', 'first-usable-slice'],
    },
    {
      id: 'q-first-run',
      text: 'When you first point it at a mailbox that already holds ten thousand messages, what should happen?',
      type: 'single',
      options: [
        {
          id: 'new-only',
          label: 'Nothing to the backlog — draft only for mail that arrives after it starts',
          description:
            'The first run costs nothing and finishes at once; the ten thousand stay untouched for good.',
          recommended: true,
        },
        {
          id: 'backfill-all',
          label: 'Work through everything still unanswered, oldest first, in the background',
          description:
            "The backlog clears on its own, and the first day's provider bill is the largest one you will see.",
        },
        {
          id: 'recent-window',
          label: 'Draft for the last thirty days and leave the rest alone',
          description:
            'The mail anyone still cares about gets covered, and something older will be missed.',
        },
        {
          id: 'ask-once',
          label: 'Ask once, then remember the answer for every mailbox after it',
          description:
            'You decide with the mailbox in front of you; there is one more question in the way of starting.',
        },
      ],
      allowOther: true,
      informationNeeds: ['first-run-backfill'],
    },
    {
      id: 'q-operator',
      text: 'Once it exists, who runs it day to day — you, your team, or a machine nobody logs into?',
      type: 'single',
      options: [
        {
          id: 'you-by-hand',
          label: 'You, on your own laptop, started by hand',
          description:
            'Nothing to set up beyond your own machine; drafts stop the moment you close the lid.',
        },
        {
          id: 'each-person',
          label: 'Everyone on the support team, each signed in as themselves',
          description:
            'Who drafted what is on the record, and every person needs their own access to set up.',
        },
        {
          id: 'shared-account',
          label: 'Whoever is on shift, from one shared login',
          description:
            'One setup for the whole team, and no way to tell afterwards which of them did what.',
        },
        {
          id: 'unattended',
          label: 'A machine nobody logs into, watched by whoever is on duty',
          description:
            'Drafts appear overnight without anyone present; a failure is silent until someone looks.',
        },
      ],
      allowOther: true,
      informationNeeds: ['operator', 'runtime-ownership'],
    },
    {
      id: 'q-bad-drafts',
      text: 'A draft has come back wrong three times running on the same thread. What do you want to happen next?',
      type: 'single',
      options: [
        {
          id: 'hand-over',
          label: 'Stop drafting that thread and hand it to a person',
          description:
            'The customer gets a human answer sooner, and someone has to notice the handover.',
        },
        {
          id: 'flag-and-continue',
          label: 'Keep drafting, but mark the thread so it is checked before sending',
          description:
            'Nothing stalls; the marking is only worth as much as the checking behind it.',
        },
        {
          id: 'retry-with-context',
          label: 'Try once more with the earlier conversation attached',
          description:
            'Most of these come right with more to read, at one more paid call per attempt.',
        },
        {
          id: 'do-nothing',
          label: 'Nothing special — whoever is answering will see it is wrong',
          description: 'Least to build, and the same bad draft can be sent by someone in a hurry.',
        },
      ],
      allowOther: true,
      informationNeeds: ['failure-behaviour', 'human-handoff'],
    },
  ],
};

function score(
  draft: unknown,
  over: Omit<Partial<ConcreteRubricInput>, 'draft'> = {},
): ConcreteFinding[] {
  return checkConcreteRound({ draft, set: null, language: 'en', initialPrompt: SEED, ...over });
}

const ids = (findings: readonly ConcreteFinding[]): string[] =>
  findings.map((finding) => finding.id);

const blocking = (findings: readonly ConcreteFinding[]): ConcreteFinding[] =>
  findings.filter((finding) => finding.severity === 'blocking');

/** A copy of a worked round with one thing wrong with it; the fixtures themselves stay pristine. */
function amend(round: Round, edit: (copy: Round) => void): Round {
  const copy = structuredClone(round);
  edit(copy);

  return copy;
}

function question(round: Round, id: string): RoundQuestion {
  const found = round.questions.find((candidate) => candidate.id === id);
  if (found === undefined) throw new Error(`the fixture has no question ${id}`);

  return found;
}

function option(round: Round, questionId: string, optionId: string): RoundOption {
  const found = question(round, questionId).options.find((candidate) => candidate.id === optionId);
  if (found === undefined) throw new Error(`the fixture has no option ${questionId}/${optionId}`);

  return found;
}

describe('the worked rounds of §5 (AC: a live round is judged by this rubric)', () => {
  it('finds nothing blocking in the dense round', () => {
    expect(blocking(score(ROUND_SOLUTION))).toEqual([]);
  });

  it('finds nothing blocking in the round that carries no reference note at all', () => {
    expect(blocking(score(ROUND_TASKS))).toEqual([]);
  });

  it('says nothing whatever about the asymmetry of a round with no notes', () => {
    const findings = score(ROUND_TASKS).filter((finding) => finding.check === 'spravka-asymmetry');

    expect(findings).toEqual([]);
  });

  /*
   * The advisories the two rounds do raise, pinned rather than tolerated.
   *
   * §5 claims both rounds pass every rule of §4; implemented literally, two advisory rules disagree,
   * and the disagreement is the design's own. `second-person-coverage` asks that half the option
   * descriptions address the reader, and the reference style writes them as bare trade-offs («Least
   * to build and nothing to host») — 7 of 18 here and 5 of 16 in round B. `decision-opener` is
   * declared in §4.5 to be a proxy that legitimate rewordings fail, and «Once it exists, who runs it
   * day to day?» is exactly such a rewording. Both are advisory, both are therefore read and not
   * obeyed (§4.7), and both are pinned here so that a change to either is visible rather than quiet.
   */
  it('raises the coverage advisory on the dense round, and nothing else', () => {
    expect(ids(score(ROUND_SOLUTION))).toEqual(['rubric-second-person-coverage']);
  });

  it('raises the coverage and opener advisories on the bare round, and nothing else', () => {
    expect(ids(score(ROUND_TASKS))).toEqual([
      'rubric-second-person-coverage',
      'rubric-decision-opener-q-bad-drafts-text',
      'rubric-decision-opener-q-operator-text',
    ]);
  });

  it('gives the same board twice over the same bytes', () => {
    expect(score(ROUND_SOLUTION)).toEqual(score(ROUND_SOLUTION));
  });

  it('orders findings by check and then by id', () => {
    const findings = score(
      amend(ROUND_SOLUTION, (round) => {
        question(round, 'q-store').text = 'Where should the drafts and their history live';
        option(round, 'q-provider', 'byo-key').label = 'Either';
        option(round, 'q-surface', 'cli').logo = 'postgresql';
      }),
    );

    expect(findings.map((finding) => finding.check)).toEqual([
      ...findings.map((finding) => finding.check).filter((check) => check === 'second-person'),
      ...findings
        .map((finding) => finding.check)
        .filter((check) => check === 'forbidden-vocabulary'),
      ...findings.map((finding) => finding.check).filter((check) => check === 'question-shape'),
      ...findings.map((finding) => finding.check).filter((check) => check === 'spravka-asymmetry'),
    ]);
  });
});

describe('second-person (§4.3): the round is spoken to the person, never by them', () => {
  it('names the question whose voice drifts, and only that one', () => {
    const drifted = amend(ROUND_SOLUTION, (round) => {
      question(round, 'q-store').text =
        'Where should the drafts and their history live once it runs?';
    });

    const findings = blocking(score(drifted));

    expect(ids(findings)).toEqual(['rubric-second-person-question-q-store-text']);
    expect(findings[0]?.questionId).toBe('q-store');
  });

  it('catches the first person in an option label', () => {
    const draft = amend(ROUND_SOLUTION, (round) => {
      option(round, 'q-key-handling', 'env-var').label =
        'No default — I pass an endpoint every run';
    });

    const findings = blocking(score(draft));

    expect(ids(findings)).toEqual(['rubric-first-person-voice-q-key-handling-env-var-label']);
    expect(findings[0]?.optionId).toBe('env-var');
    expect(findings[0]?.message).toContain('“i”');
  });

  it('catches the first person in a reference note as readily as in a label', () => {
    const draft = amend(ROUND_SOLUTION, (round) => {
      option(round, 'q-store', 'neon').note =
        'Neon runs PostgreSQL as a managed service. We would hold the mail your team drafts against, and the bill arrives monthly.';
    });

    expect(ids(blocking(score(draft)))).toEqual(['rubric-first-person-voice-q-store-neon-note']);
  });

  it('stays silent when most descriptions address the reader', () => {
    const round = {
      stage: 'solution',
      questions: [
        {
          id: 'q-one',
          text: 'Which store should your drafts live in?',
          type: 'single',
          options: [
            {
              id: 'a',
              label: 'A file on the machine',
              description: 'You back it up by copying it.',
            },
            {
              id: 'b',
              label: 'A hosted database',
              description: 'Your backups become someone else’s.',
            },
          ],
          allowOther: true,
          informationNeeds: ['persistence-layer'],
        },
      ],
    };

    expect(score(round)).toEqual([]);
  });

  it('reports the coverage when they do not', () => {
    const round = {
      stage: 'solution',
      questions: [
        {
          id: 'q-one',
          text: 'Which store should your drafts live in?',
          type: 'single',
          options: [
            { id: 'a', label: 'A file on the machine', description: 'A backup is a file copy.' },
            { id: 'b', label: 'A hosted database', description: 'The backups belong to a vendor.' },
          ],
          allowOther: true,
          informationNeeds: ['persistence-layer'],
        },
      ],
    };

    const findings = score(round);

    expect(ids(findings)).toEqual(['rubric-second-person-coverage']);
    expect(findings[0]?.evidence).toBe('0 of 2 descriptions');
  });
});

describe('forbidden-vocabulary (§4.4): the words this register may not use', () => {
  it('catches a question asked through an invented character', () => {
    const draft = amend(ROUND_SOLUTION, (round) => {
      question(round, 'q-surface').text =
        'Imagine how your support team feels opening the queue — which surface should you give them?';
    });

    expect(ids(blocking(score(draft)))).toEqual(['rubric-persona-and-feeling-q-surface-text']);
  });

  it('catches a question about our own documents', () => {
    const draft = amend(ROUND_SOLUTION, (round) => {
      question(round, 'q-provider').text =
        'Which provider should this document name as the one you start on?';
    });

    const findings = blocking(score(draft));

    expect(ids(findings)).toEqual(['rubric-our-artifacts-q-provider-text']);
    expect(findings[0]?.message).toContain('“this document”');
  });

  it('leaves a legitimate product word alone', () => {
    const draft = amend(ROUND_SOLUTION, (round) => {
      option(round, 'q-provider', 'byo-key').description =
        'Each person pastes their own key, on whatever plan and in whatever format their account already uses.';
    });

    expect(blocking(score(draft))).toEqual([]);
  });

  it('catches an option that declines to be a choice', () => {
    const draft = amend(ROUND_SOLUTION, (round) => {
      option(round, 'q-store', 'mongodb').label = 'A balance of both';
    });

    expect(ids(blocking(score(draft)))).toEqual(['rubric-hedge-option-q-store-mongodb-label']);
  });

  it('does not mistake the sanctioned refusal for a hedge', () => {
    expect(
      score(ROUND_SOLUTION).filter((finding) => finding.id.startsWith('rubric-hedge-option')),
    ).toEqual([]);
  });

  it('catches an authored option competing with the free-text escape', () => {
    const draft = amend(ROUND_SOLUTION, (round) => {
      option(round, 'q-key-handling', 'every-start').label = 'Other (please specify)';
    });

    expect(ids(blocking(score(draft)))).toEqual([
      'rubric-duplicate-escape-q-key-handling-every-start-label',
    ]);
  });
});

describe('question-shape (§4.5): a question that settles something', () => {
  it('catches a question that is not written as one', () => {
    const draft = amend(ROUND_SOLUTION, (round) => {
      question(round, 'q-surface').text = 'State how your team should open the queue of drafts.';
    });

    expect(ids(blocking(score(draft)))).toEqual(['rubric-question-mark-q-surface-text']);
  });

  it('catches an option with no description', () => {
    const draft = amend(ROUND_SOLUTION, (round) => {
      delete option(round, 'q-store', 'sqlite').description;
    });

    expect(ids(blocking(score(draft)))).toEqual([
      'rubric-option-description-q-store-sqlite-description',
    ]);
  });

  it('catches two questions settling the same thing', () => {
    const draft = amend(ROUND_SOLUTION, (round) => {
      question(round, 'q-store').informationNeeds = ['model-provider', 'data-residency'];
    });

    const findings = blocking(score(draft));

    expect(ids(findings)).toEqual(['rubric-duplicate-decision-q-store-model-provider']);
    expect(findings[0]?.message).toContain('q-provider');
  });

  it('catches a question asking for a number the person would have to measure', () => {
    const draft = amend(ROUND_SOLUTION, (round) => {
      const asked = question(round, 'q-key-handling');
      asked.text = 'How many drafts should you queue before it pauses?';
      asked.options = [
        { id: 'a', label: '10 drafts', description: 'It pauses early and often.' },
        { id: 'b', label: '50 drafts', description: 'A middle setting you rarely notice.' },
        { id: 'c', label: '100 drafts', description: 'It runs a long way before you are asked.' },
        { id: 'd', label: '500 drafts', description: 'It effectively never pauses on your work.' },
      ];
    });

    expect(ids(blocking(score(draft)))).toEqual(['rubric-measured-number-q-key-handling-text']);
  });

  it('leaves a behavioural "how often" question alone', () => {
    const draft = amend(ROUND_SOLUTION, (round) => {
      const asked = question(round, 'q-key-handling');
      asked.text = 'How much of the backlog should you see when you come back the next morning?';
      asked.options = [
        {
          id: 'a',
          label: 'Only what arrived overnight',
          description: 'You start from the new mail.',
        },
        { id: 'b', label: 'Everything still unanswered', description: 'You see the whole queue.' },
        {
          id: 'c',
          label: 'Only what it drafted for you',
          description: 'You review its work alone.',
        },
        { id: 'd', label: 'Whatever you left open', description: 'You resume where you stopped.' },
      ];
    });

    expect(blocking(score(draft))).toEqual([]);
  });

  it('reports a question long enough to hide its decision', () => {
    const draft = amend(ROUND_SOLUTION, (round) => {
      question(round, 'q-surface').text =
        'How should your team open the queue of drafts, given that some of them work from the mail client all day, some of them only ever open a browser, and one of them runs everything from a terminal?';
    });

    expect(ids(score(draft))).toContain('rubric-question-length-q-surface-text');
  });

  it('reports an information need written as prose', () => {
    const draft = amend(ROUND_SOLUTION, (round) => {
      question(round, 'q-store').informationNeeds = ['Where the drafts live', 'data-residency'];
    });

    const findings = score(draft);

    expect(ids(findings)).toContain('rubric-need-shape-q-store-1');
    expect(blocking(findings)).toEqual([]);
  });

  it('reports a round that recommends an answer to every question', () => {
    const draft = amend(ROUND_SOLUTION, (round) => {
      option(round, 'q-key-handling', 'os-keychain').recommended = true;
    });

    expect(ids(score(draft))).toContain('rubric-recommended-everywhere');
  });
});

describe('spravka-asymmetry (§4.6): the note belongs to the option', () => {
  it('catches a link with no note behind it', () => {
    const draft = amend(ROUND_SOLUTION, (round) => {
      delete option(round, 'q-provider', 'anthropic').note;
    });

    expect(ids(blocking(score(draft)))).toEqual([
      'rubric-note-required-for-link-q-provider-anthropic-note',
    ]);
  });

  it('catches an extra field present but empty', () => {
    const draft = amend(ROUND_SOLUTION, (round) => {
      option(round, 'q-store', 'neon').href = '';
      option(round, 'q-store', 'mongodb').logo = null;
    });

    expect(ids(blocking(score(draft)))).toEqual([
      'rubric-empty-extras-q-store-mongodb-logo',
      'rubric-empty-extras-q-store-neon-href',
    ]);
  });

  it('catches a logo outside the closed set', () => {
    const draft = amend(ROUND_SOLUTION, (round) => {
      option(round, 'q-store', 'self-run-postgres').logo = 'postgresql';
    });

    const findings = blocking(score(draft));

    expect(ids(findings)).toEqual(['rubric-unknown-logo-q-store-self-run-postgres-logo']);
    expect(findings[0]?.evidence).toBe('postgresql');
  });

  it('catches a link on a host the slug does not own', () => {
    const draft = amend(ROUND_SOLUTION, (round) => {
      option(round, 'q-store', 'neon').href = 'https://neon-hosting.example.com';
    });

    expect(ids(blocking(score(draft)))).toEqual(['rubric-foreign-host-q-store-neon-href']);
  });

  it('catches a link that is not a vendor home page', () => {
    const draft = amend(ROUND_SOLUTION, (round) => {
      option(round, 'q-store', 'sqlite').href = 'http://sqlite.org/docs/lang_select.html';
    });

    expect(ids(blocking(score(draft)))).toEqual(['rubric-href-shape-q-store-sqlite-href']);
  });

  it('catches an address lifted out of what the person wrote', () => {
    const draft = amend(ROUND_SOLUTION, (round) => {
      const borrowed = option(round, 'q-surface', 'mail-client-plugin');
      borrowed.note =
        'Your mail client exposes a plugin API of its own, and a plugin runs inside whatever the client already allows.';
      borrowed.href = 'https://helpdesk.example.com';
    });

    const findings = blocking(
      score(draft, {
        initialPrompt: `${SEED}, today handled at helpdesk.example.com`,
      }),
    );

    expect(ids(findings)).toEqual(['rubric-seed-borrowed-href-q-surface-mail-client-plugin-href']);
    expect(findings[0]?.evidence).toBe('helpdesk.example.com');
  });

  it('catches a decorated escape option — the one that must stay bare', () => {
    const draft = amend(ROUND_SOLUTION, (round) => {
      const refusal = option(round, 'q-provider', 'no-preference');
      refusal.note =
        'The default is whichever provider the team already holds a key for, written down with the reason it was chosen.';
      refusal.href = 'https://openrouter.ai';
      refusal.logo = 'openrouter';
    });

    expect(ids(blocking(score(draft)))).toEqual([
      'rubric-decorated-escape-q-provider-no-preference',
    ]);
  });

  it('catches a question where every option has been decorated', () => {
    const draft = amend(ROUND_SOLUTION, (round) => {
      const decorated = question(round, 'q-surface');
      decorated.options = decorated.options.map((entry) => ({
        ...entry,
        note:
          entry.note ??
          'A named way of putting the queue in front of the team, with its own home page and its own way of being deployed.',
      }));
    });

    expect(ids(blocking(score(draft)))).toContain('rubric-uniform-decoration-q-surface');
  });

  it('catches a note carrying an address or markup', () => {
    const draft = amend(ROUND_SOLUTION, (round) => {
      option(round, 'q-store', 'sqlite').note =
        'SQLite is a SQL database in a single file on disk — see https://sqlite.org for what that costs you in concurrency.';
    });

    expect(ids(blocking(score(draft)))).toEqual(['rubric-note-markup-q-store-sqlite-note']);
  });

  it('reports a note that only repeats the description', () => {
    const draft = amend(ROUND_SOLUTION, (round) => {
      const repeated = option(round, 'q-store', 'sqlite');
      repeated.note = `${String(repeated.description)} There is nothing else to say about it here.`;
    });

    const findings = score(draft);

    expect(ids(findings)).toContain('rubric-note-repeats-description-q-store-sqlite-note');
    expect(blocking(findings)).toEqual([]);
  });

  it('reports a note too short to say anything the label did not', () => {
    const draft = amend(ROUND_SOLUTION, (round) => {
      option(round, 'q-store', 'neon').note = 'A hosted Postgres.';
    });

    expect(ids(score(draft))).toContain('rubric-note-too-short-q-store-neon-note');
  });
});

describe('the raw draft, not the repaired one (§4.6)', () => {
  it('reports a value the schema dropped in silence', () => {
    const draft = amend(ROUND_SOLUTION, (round) => {
      option(round, 'q-store', 'sqlite').href = 'http://sqlite.org/docs/lang_select.html';
    });

    const validation = validateQuestionSetDraft(draft);
    expect(validation.ok).toBe(true);

    const validated = validation.ok ? validation.set : null;
    const survived = validated?.questions
      .find((entry) => entry.id === 'q-store')
      ?.options.find((entry) => entry.id === 'sqlite');

    // The schema threw the address away rather than the round — and said nothing about it.
    expect(survived).not.toHaveProperty('href');
    expect(
      ids(
        blocking(
          checkConcreteRound({ draft, set: validated, language: 'en', initialPrompt: SEED }),
        ),
      ),
    ).toEqual(['rubric-href-shape-q-store-sqlite-href']);
  });

  it('falls back to the validated set when the draft is no longer in hand', () => {
    const validation = validateQuestionSetDraft(ROUND_SOLUTION);
    const validated = validation.ok ? validation.set : null;

    expect(blocking(score(null, { set: validated }))).toEqual([]);
  });

  it('says so when there is nothing to measure at all', () => {
    expect(ids(score({ stage: 'solution', questions: [] }))).toEqual(['rubric-round-unreadable']);
  });
});

describe('language (§4.2)', () => {
  const RU_ROUND = {
    stage: 'solution',
    questions: [
      {
        id: 'q-хранилище',
        text: 'Какое хранилище черновиков вы хотите на первом запуске?',
        type: 'single',
        options: [
          {
            id: 'file',
            label: 'Файл на той же машине',
            description: 'Резервная копия — это копия файла, и читает её только эта машина.',
          },
          {
            id: 'hosted',
            label: 'Управляемая база у поставщика',
            description: 'Вы получаете обычный SQL, а почту клиентов хранит третья сторона.',
          },
        ],
        allowOther: true,
        informationNeeds: ['persistence-layer'],
      },
      {
        id: 'q-порядок',
        text: 'В каком порядке соберёте первый работающий кусок?',
        type: 'single',
        options: [
          {
            id: 'slice',
            label: 'Почта на входе, черновик на выходе',
            description: 'Весь путь доказывает себя в первый день, пока им не пользуется никто.',
          },
          {
            id: 'screen',
            label: 'Экран очереди на черновиках, вставленных руками',
            description: 'Вы увидите форму работы раньше, чем будет подключена модель.',
          },
        ],
        allowOther: true,
        informationNeeds: ['build-order'],
      },
    ],
  };

  it('accepts a Russian round addressed with a pronoun and with a verb alone', () => {
    expect(blocking(score(RU_ROUND, { language: 'ru' }))).toEqual([]);
  });

  it('does not read a prepositional-case noun as a second-person verb', () => {
    const draft = amend(structuredClone(RU_ROUND), (round) => {
      question(round, 'q-порядок').text = 'Что должно стоять в отчёте о первом запуске?';
    });

    expect(ids(blocking(score(draft, { language: 'ru' })))).toEqual([
      'rubric-second-person-question-q-порядок-text',
    ]);
  });

  it('catches the Russian first person', () => {
    const draft = amend(structuredClone(RU_ROUND), (round) => {
      option(round, 'q-хранилище', 'file').description =
        'Резервная копия — это копия файла, и мы разберёмся с ней за вас.';
    });

    expect(ids(blocking(score(draft, { language: 'ru' })))).toEqual([
      'rubric-first-person-voice-q-хранилище-file-description',
    ]);
  });

  it('says a language it has no lexicon for went unmeasured, rather than passing it', () => {
    const draft = amend(ROUND_SOLUTION, (round) => {
      option(round, 'q-key-handling', 'env-var').label = 'I pass an endpoint every run';
    });

    const findings = score(draft, { language: 'de' });

    expect(ids(findings)).toContain('rubric-language-unsupported');
    // The voice went unread, and the reference-note rules still ran over every option.
    expect(ids(findings)).not.toContain('rubric-first-person-voice-q-key-handling-env-var-label');
    expect(blocking(findings)).toEqual([]);
  });

  it('still measures shape in a language it has no lexicon for', () => {
    const draft = amend(ROUND_SOLUTION, (round) => {
      delete option(round, 'q-store', 'sqlite').description;
    });

    expect(ids(blocking(score(draft, { language: 'de' })))).toEqual([
      'rubric-option-description-q-store-sqlite-description',
    ]);
  });
});

describe('what the rubric does not decide (§4.5)', () => {
  it('names the cardinality of a question rather than leaving a green board to imply it', () => {
    expect(CONCRETE_UNDECIDED.map((entry) => entry.id)).toContain('option-cardinality');
  });
});
