import { describe, expect, it } from 'vitest';

import {
  createTestDoubleAdapter,
  stubInterviewRoundDocument,
  stubReplyAssessmentDocument,
  stubSessionSummaryDocument,
} from '@/modules/adapters/llm';

import { createInterviewAgent, parseJsonDocument, repairQuestionSetDraft } from './interview-agent';
import { createReplyAssessor } from './reply-assessment';
import { createSummaryAgent } from './summary-agent';

/**
 * Task 33 (and the reply/summary agents of tasks 36/38) against the deterministic stub —
 * no model, no network (NFR-012 AC-5).
 */
const baseInput = {
  stage: 'interview' as const,
  initialPrompt: 'A spec platform for AI coding agents',
  summary: null,
  satisfiedNeeds: [] as string[],
  unmetNeeds: [] as string[],
  runId: 'run-1',
};

describe('InterviewAgent (task 33)', () => {
  it('drafts a validated round declaring its information needs (AC-1)', async () => {
    const agent = createInterviewAgent(
      createTestDoubleAdapter({ document: stubInterviewRoundDocument('interview', 1) }),
    );

    const outcome = await agent.draftRound(baseInput);

    expect(outcome.kind).toBe('round');
    if (outcome.kind === 'round') {
      expect(outcome.set.stage).toBe('interview');
      expect(outcome.set.questions.length).toBeGreaterThanOrEqual(1);
      expect(outcome.declaredNeeds).toEqual(['target-users', 'core-problem']);
      expect(outcome.repaired).toBe(false);

      // Every question keeps the mandatory escape hatch (FR-005 AC-3).
      for (const question of outcome.set.questions) {
        expect(question.allowOther).toBe(true);
        expect(question.options.length).toBeGreaterThanOrEqual(2);
        expect(question.options.length).toBeLessThanOrEqual(8);
      }
    }
  });

  it('never re-declares a satisfied need (AC-2; FR-005 AC-9)', async () => {
    const agent = createInterviewAgent(
      createTestDoubleAdapter({ document: stubInterviewRoundDocument('interview', 1) }),
    );

    const outcome = await agent.draftRound({
      ...baseInput,
      satisfiedNeeds: ['target-users'],
    });

    expect(outcome.kind).toBe('round');
    if (outcome.kind === 'round') {
      expect(outcome.declaredNeeds).toEqual(['core-problem']);
      // The question that existed solely for the satisfied need is gone with it.
      expect(outcome.set.questions.map((question) => question.id)).toEqual(['q-problem']);
    }
  });

  it('reports nothing-to-ask when every proposed need is already satisfied', async () => {
    const agent = createInterviewAgent(
      createTestDoubleAdapter({ document: stubInterviewRoundDocument('interview', 1) }),
    );

    const outcome = await agent.draftRound({
      ...baseInput,
      satisfiedNeeds: ['target-users', 'core-problem'],
    });

    expect(outcome.kind).toBe('nothing-to-ask');
  });

  it('reports nothing-to-ask on an explicitly empty draft (FR-005 AC-10 proceed branch)', async () => {
    const agent = createInterviewAgent(
      createTestDoubleAdapter({ document: stubInterviewRoundDocument('interview', 4) }),
    );

    expect((await agent.draftRound(baseInput)).kind).toBe('nothing-to-ask');
  });

  it('repairs a repairable draft once — a wrong stage echo and a missing allowOther', async () => {
    const crooked = JSON.stringify({
      stage: 'constitution', // wrong echo; the agent asked for `interview`
      questions: [
        {
          id: 'q1',
          text: 'Who is this for?',
          type: 'single',
          options: [
            { id: 'a', label: 'A' },
            { id: 'b', label: 'B' },
          ],
          allowOther: false,
          informationNeeds: ['target-users'],
        },
      ],
    });

    const agent = createInterviewAgent(createTestDoubleAdapter({ document: crooked }));
    const outcome = await agent.draftRound(baseInput);

    expect(outcome.kind).toBe('round');
    if (outcome.kind === 'round') {
      expect(outcome.repaired).toBe(true);
      expect(outcome.set.stage).toBe('interview');
      expect(outcome.set.questions[0]?.allowOther).toBe(true);
    }
  });

  it('discards an unusable draft with DRAFT_INVALID — nothing to persist (task 32 AC)', async () => {
    const agent = createInterviewAgent(
      createTestDoubleAdapter({ document: '{"stage": "interview", "questions": "nope"}' }),
    );

    const outcome = await agent.draftRound(baseInput);

    expect(outcome.kind).toBe('draft-invalid');
    if (outcome.kind === 'draft-invalid') expect(outcome.issues.length).toBeGreaterThan(0);
  });

  it('treats non-JSON output as an invalid draft', async () => {
    const agent = createInterviewAgent(
      createTestDoubleAdapter({ document: 'Sorry, here are some thoughts in prose…' }),
    );

    expect((await agent.draftRound(baseInput)).kind).toBe('draft-invalid');
  });

  it('strips a markdown fence before parsing', () => {
    expect(parseJsonDocument('```json\n{"a": 1}\n```')).toEqual({ a: 1 });
    expect(parseJsonDocument('{"a": 1}')).toEqual({ a: 1 });
    expect(parseJsonDocument('not json')).toBeNull();
  });

  it('repair drops what it cannot fix and invents nothing', () => {
    const repair = repairQuestionSetDraft('interview');

    const repaired = repair(
      {
        stage: 'interview',
        questions: [
          'not-an-object',
          {
            id: 'too-few',
            text: 'x',
            type: 'single',
            options: [{ id: 'a', label: 'A' }],
            informationNeeds: ['n1'],
          },
          {
            id: 'ok',
            text: 'x',
            type: 'single',
            options: [
              { id: 'a', label: 'A' },
              { id: 'b', label: 'B' },
            ],
            informationNeeds: ['n2'],
          },
        ],
      },
      [],
    ) as { questions: { id: string }[] };

    expect(repaired.questions.map((question) => question.id)).toEqual(['ok']);
  });
});

describe('reply assessment (task 36)', () => {
  it('accepts only declared needs, deduplicated', async () => {
    const assessor = createReplyAssessor(
      createTestDoubleAdapter({
        document: JSON.stringify({
          satisfiedNeeds: ['constraints', 'constraints', 'invented-need'],
        }),
      }),
    );

    const satisfied = await assessor.assess({
      reply: 'We must ship on the mandated stack.',
      declaredNeeds: ['constraints', 'success-criteria'],
      runId: 'run-2',
    });

    expect(satisfied).toEqual(['constraints']);
  });

  it('degrades to "nothing satisfied" on unusable output — conservative by design', async () => {
    const assessor = createReplyAssessor(createTestDoubleAdapter({ document: 'not json at all' }));

    expect(
      await assessor.assess({ reply: 'anything', declaredNeeds: ['a'], runId: 'run-3' }),
    ).toEqual([]);
  });

  it('the stub assessment is deliberately conservative', async () => {
    const assessor = createReplyAssessor(
      createTestDoubleAdapter({ document: stubReplyAssessmentDocument() }),
    );

    expect(
      await assessor.assess({ reply: 'anything', declaredNeeds: ['a', 'b'], runId: 'run-4' }),
    ).toEqual([]);
  });
});

describe('summary agent (task 38)', () => {
  it('returns a non-blank summary from the stub', async () => {
    const agent = createSummaryAgent(
      createTestDoubleAdapter({ document: stubSessionSummaryDocument('A spec platform\nmore') }),
    );

    const summary = await agent.summarise({
      initialPrompt: 'A spec platform',
      answeredHighlights: ['Who is this for? — Solo developers'],
      runId: 'run-5',
    });

    expect(summary).toContain('A spec platform');
  });

  it('returns null for blank output — the gate condition must stay unmet', async () => {
    const agent = createSummaryAgent(createTestDoubleAdapter({ document: '   \n ' }));

    expect(
      await agent.summarise({ initialPrompt: 'x', answeredHighlights: [], runId: 'run-6' }),
    ).toBeNull();
  });
});
