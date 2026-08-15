import { describe, expect, it, vi } from 'vitest';

import {
  createTestDoubleAdapter,
  stubReviewDocument,
  type LlmAdapter,
} from '@/modules/adapters/llm';

import {
  flattenReviewItems,
  repairReviewDraft,
  splitPersistedItems,
  validateReviewDraft,
  ReviewArtifact,
} from '../schemas/review-artifact';

import { createReviewAgent } from './review-agent';

/**
 * Task 54 — the review contract; task 111 — review.v2 and the Р-1 retry.
 *
 * The acceptance criteria are about what may reach storage, so the assertions are about the
 * *boundary*: what `validateReviewDraft` lets through, and what the agent returns when it does not.
 * There is no test that a well-formed review is useful — semantic quality of model prose is
 * explicitly out of scope (constitution — Testing Approaches, "Not required in v1").
 */
const item = (overrides: Record<string, unknown> = {}) => ({
  id: 'mf-1',
  sectionPath: 'Core Principles — P2',
  title: 'A principle with no gate behind it',
  body: 'P2 is stated but never gated.',
  suggestion: 'Name the gate that enforces it.',
  confidence: 8,
  ...overrides,
});

const artifact = (overrides: Record<string, unknown> = {}) => ({
  verdict: 'needs_revision',
  summary: 'The document is close, but one principle is unenforceable as written.',
  mustFix: [item()],
  recommendations: [],
  ...overrides,
});

describe('ReviewArtifact validation (tasks 54, 111)', () => {
  describe('AC-1 — output is Zod-validated before persistence', () => {
    it('accepts a well-formed review unchanged', () => {
      const result = validateReviewDraft(artifact());

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.repaired).toBe(false);
      expect(result.artifact.mustFix[0]?.id).toBe('mf-1');
      expect(result.artifact.summary).toMatch(/unenforceable/);
    });

    it('rejects a draft that is not an object at all', () => {
      expect(validateReviewDraft('needs revision, probably').ok).toBe(false);
      expect(validateReviewDraft([artifact()]).ok).toBe(false);
      expect(validateReviewDraft(null).ok).toBe(false);
    });

    it('rejects a draft with no repair pass rather than guessing', () => {
      const result = validateReviewDraft({ verdict: 'pass' });

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.code).toBe('DRAFT_INVALID');
      expect(result.issues.join('\n')).toMatch(/mustFix/);
    });

    it('reports the path of each rejection, so a systematic defect is diagnosable', () => {
      const result = validateReviewDraft(artifact({ mustFix: [item({ confidence: 0 })] }));

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.issues.join('\n')).toMatch(/mustFix\.0\.confidence/);
    });
  });

  describe('AC-2 — every item classifies as blocking or advisory and names a section', () => {
    it('carries the classification into storage as an explicit severity and source', () => {
      const items = flattenReviewItems(
        ReviewArtifact.parse(
          artifact({
            mustFix: [item({ id: 'mf-1' })],
            recommendations: [item({ id: 'rec-1' })],
          }),
        ),
      );

      expect(items.map((entry) => [entry.id, entry.severity, entry.source])).toEqual([
        ['mf-1', 'blocking', 'model'],
        ['rec-1', 'advisory', 'model'],
      ]);
    });

    it('round-trips through storage: split(flatten(x)) restores both lists', () => {
      const parsed = ReviewArtifact.parse(
        artifact({
          mustFix: [item({ id: 'mf-1' }), item({ id: 'mf-2' })],
          recommendations: [item({ id: 'rec-1' })],
        }),
      );

      const split = splitPersistedItems(flattenReviewItems(parsed));

      expect(split.mustFix.map((entry) => entry.id)).toEqual(['mf-1', 'mf-2']);
      expect(split.recommendations.map((entry) => entry.id)).toEqual(['rec-1']);
    });

    it('stores blocking items first, so storage order is render order', () => {
      const items = flattenReviewItems(
        ReviewArtifact.parse(
          artifact({
            mustFix: [item({ id: 'mf-1' })],
            recommendations: [item({ id: 'rec-1' }), item({ id: 'rec-2' })],
          }),
        ),
      );

      expect(items.map((entry) => entry.id)).toEqual(['mf-1', 'rec-1', 'rec-2']);
    });

    it('rejects an item missing any part of the finding itself', () => {
      for (const broken of [
        item({ sectionPath: undefined }),
        item({ sectionPath: '' }),
        item({ title: '' }),
        item({ suggestion: '' }),
        item({ body: '' }),
      ]) {
        expect(validateReviewDraft(artifact({ mustFix: [broken] })).ok).toBe(false);
      }
    });

    it('rejects a confidence outside the declared 1..10 band, and accepts its edges', () => {
      for (const confidence of [0, 11, 7.5]) {
        expect(validateReviewDraft(artifact({ mustFix: [item({ confidence })] })).ok).toBe(false);
      }

      // 1..10, not 5..10: a reviewer with a hunch it still thinks worth raising can say so (task 111).
      for (const confidence of [1, 4, 10]) {
        expect(validateReviewDraft(artifact({ mustFix: [item({ confidence })] })).ok).toBe(true);
      }
    });

    it('requires a summary — the paragraph that opens the card (Эталон §1.3)', () => {
      expect(validateReviewDraft(artifact({ summary: undefined })).ok).toBe(false);
      expect(validateReviewDraft(artifact({ summary: '' })).ok).toBe(false);
    });
  });

  describe('AC-3 — the verdict is exactly pass or needs_revision', () => {
    it('accepts both declared verdicts', () => {
      expect(validateReviewDraft(artifact({ verdict: 'needs_revision' })).ok).toBe(true);
      expect(
        validateReviewDraft(artifact({ verdict: 'pass', mustFix: [], recommendations: [] })).ok,
      ).toBe(true);
    });

    it('rejects a user decision offered as a verdict (constitution P2)', () => {
      for (const verdict of ['accept', 'ignore', 'request_changes', 'approve']) {
        expect(validateReviewDraft(artifact({ verdict })).ok).toBe(false);
      }
    });

    it('rejects a pass that contradicts its own blocking items', () => {
      const result = validateReviewDraft(artifact({ verdict: 'pass', mustFix: [item()] }));

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.issues.join('\n')).toMatch(/contradicts/);
    });

    it('accepts a pass with advisory items — advisory is not blocking', () => {
      expect(
        validateReviewDraft(
          artifact({ verdict: 'pass', mustFix: [], recommendations: [item({ id: 'rec-1' })] }),
        ).ok,
      ).toBe(true);
    });
  });

  describe('ids are unique across both lists (FR-010 AC-7 depends on it)', () => {
    it('rejects the same id used in mustFix and recommendations', () => {
      const result = validateReviewDraft(
        artifact({ mustFix: [item({ id: 'dup' })], recommendations: [item({ id: 'dup' })] }),
      );

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.issues.join('\n')).toMatch(/unique/);
    });

    it('rejects a duplicate within one list', () => {
      expect(
        validateReviewDraft(artifact({ mustFix: [item({ id: 'dup' }), item({ id: 'dup' })] })).ok,
      ).toBe(false);
    });
  });

  describe('the repair pass fixes handles, never content', () => {
    const repair = repairReviewDraft();

    it('assigns a positional id where the model left none', () => {
      const result = validateReviewDraft(
        artifact({ mustFix: [item({ id: undefined }), item({ id: undefined })] }),
        repair,
      );

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.repaired).toBe(true);
      expect(result.artifact.mustFix.map((entry) => entry.id)).toEqual(['mustfix-1', 'mustfix-2']);
    });

    it('disambiguates a duplicated id instead of dropping the item', () => {
      const result = validateReviewDraft(
        artifact({ mustFix: [item({ id: 'dup' })], recommendations: [item({ id: 'dup' })] }),
        repair,
      );

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const ids = [
        ...result.artifact.mustFix.map((entry) => entry.id),
        ...result.artifact.recommendations.map((entry) => entry.id),
      ];
      expect(new Set(ids).size).toBe(2);
      expect(ids).toContain('dup');
    });

    it('clamps a confidence into the band', () => {
      const high = validateReviewDraft(artifact({ mustFix: [item({ confidence: 99 })] }), repair);
      const low = validateReviewDraft(artifact({ mustFix: [item({ confidence: -4 })] }), repair);

      expect(high.ok && high.artifact.mustFix[0]?.confidence).toBe(10);
      expect(low.ok && low.artifact.mustFix[0]?.confidence).toBe(1);
    });

    it('accepts the v1 field names as aliases, so a model that writes them keeps its findings', () => {
      const result = validateReviewDraft(
        {
          outcome: 'needs_revision',
          summary: 'One point.',
          mustfix: [
            {
              id: 'mf-1',
              section: 'Purpose',
              description: 'Stated with no way to test it.',
              suggestion: 'Restate it as a criterion.',
              confidenceScore: 7,
            },
          ],
          recommendations: [],
        },
        repair,
      );

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.artifact.mustFix[0]).toMatchObject({
        sectionPath: 'Purpose',
        // No separate heading was given, so the section path is the handle — not invented text.
        title: 'Purpose',
        body: 'Stated with no way to test it.',
        confidence: 7,
      });
    });

    it('derives the verdict from the repaired arrays, rather than trusting a contradiction', () => {
      const result = validateReviewDraft(artifact({ verdict: 'pass', mustFix: [item()] }), repair);

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.artifact.verdict).toBe('needs_revision');
    });

    it('states a missing summary as a count, and claims nothing else', () => {
      const result = validateReviewDraft(
        artifact({ summary: undefined, mustFix: [item()], recommendations: [item({ id: 'r' })] }),
        repair,
      );

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.artifact.summary).toBe(
        'The reviewer raised 1 blocking point and 1 recommendation and left no summary of its own.',
      );
    });

    it('normalises a near-miss verdict, and treats anything unrecognised as needing revision', () => {
      for (const [verdict, expected] of [
        ['PASS', 'pass'],
        [' pass ', 'pass'],
        ['needs revision', 'needs_revision'],
        ['looks good to me', 'needs_revision'],
        [42, 'needs_revision'],
      ] as const) {
        const result = validateReviewDraft(
          artifact({ verdict, mustFix: [], recommendations: [] }),
          repair,
        );

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.artifact.verdict).toBe(expected);
      }
    });

    it('drops an item whose finding is missing, rather than inventing one', () => {
      const result = validateReviewDraft(
        artifact({ mustFix: [item({ id: 'mf-1' }), item({ id: 'mf-2', suggestion: '' })] }),
        repair,
      );

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.artifact.mustFix.map((entry) => entry.id)).toEqual(['mf-1']);
    });

    it('adds no item that the model did not propose', () => {
      const result = validateReviewDraft(
        { verdict: 'pass', summary: 'Nothing to raise.', mustFix: [], recommendations: [] },
        repair,
      );

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.artifact.mustFix).toEqual([]);
      expect(result.artifact.recommendations).toEqual([]);
    });

    it('reads a missing or malformed list as an empty one', () => {
      const result = validateReviewDraft(
        { verdict: 'pass', summary: 'Fine.', mustFix: 'not a list' },
        repair,
      );

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.artifact.mustFix).toEqual([]);
      expect(result.artifact.recommendations).toEqual([]);
    });

    it('gives up after one repair, rather than looping', () => {
      // Nothing here is an object, so the repair returns it untouched and the second parse fails.
      const result = validateReviewDraft('the spec looks fine', repair);

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.code).toBe('DRAFT_INVALID');
    });
  });
});

describe('createReviewAgent (tasks 54, 111)', () => {
  const adapter = (document: string) => createTestDoubleAdapter({ document });

  /** An adapter that answers with a valid review and records the prompt it was handed. */
  const recordingAdapter = (seen: string[]): LlmAdapter => ({
    generateStreaming: (options) => {
      seen.push(options.messages.map((message) => message.content).join('\n'));
      return Promise.resolve({ text: stubReviewDocument(), providerUsed: 'stub', attempts: 1 });
    },
  });

  /** An adapter that answers with each document in turn, so a retry can be observed. */
  const sequenceAdapter = (
    documents: readonly string[],
  ): { adapter: LlmAdapter; calls: number } => {
    const state = { calls: 0 };
    const adapterImpl: LlmAdapter = {
      generateStreaming: () => {
        const text = documents[Math.min(state.calls, documents.length - 1)] ?? '';
        state.calls += 1;
        return Promise.resolve({ text, providerUsed: 'stub', attempts: 1 });
      },
    };

    return {
      adapter: adapterImpl,
      get calls() {
        return state.calls;
      },
    };
  };

  it('returns a validated artifact and its flattened items', async () => {
    const agent = createReviewAgent(adapter(stubReviewDocument('constitution')));

    const outcome = await agent.review({
      specType: 'constitution',
      specContent: '# Constitution\n\n## Purpose\n\nText.',
      runId: 'run-1',
    });

    expect(outcome.kind).toBe('review');
    if (outcome.kind !== 'review') return;
    expect(outcome.promptId).toBe('review.board.v2');
    expect(outcome.artifact.verdict).toBe('needs_revision');
    expect(outcome.artifact.summary).not.toBe('');
    expect(outcome.items).toHaveLength(3);
    expect(outcome.items.filter((entry) => entry.severity === 'blocking')).toHaveLength(2);
    expect(outcome.items.filter((entry) => entry.severity === 'advisory')).toHaveLength(1);
  });

  it('reports draft-invalid rather than throwing when the model returns prose', async () => {
    const agent = createReviewAgent(adapter('The document looks fine to me.'));

    const outcome = await agent.review({
      specType: 'constitution',
      specContent: '# Constitution',
      runId: 'run-2',
    });

    expect(outcome.kind).toBe('draft-invalid');
    if (outcome.kind !== 'draft-invalid') return;
    expect(outcome.issues.join('\n')).toMatch(/not parseable JSON/);
  });

  it('accepts a review the model wrapped in a markdown fence', async () => {
    const agent = createReviewAgent(adapter(`\`\`\`json\n${stubReviewDocument()}\n\`\`\``));

    const outcome = await agent.review({
      specType: 'requirements',
      specContent: '# Requirements',
      runId: 'run-3',
    });

    expect(outcome.kind).toBe('review');
  });

  it('accepts a review with one stray character after it (Р-1, the parser layer)', async () => {
    const agent = createReviewAgent(adapter(`${stubReviewDocument()}.`));

    const outcome = await agent.review({
      specType: 'requirements',
      specContent: '# Requirements',
      runId: 'run-3b',
    });

    expect(outcome.kind).toBe('review');
  });

  it('repairs a salvageable draft and says that it did', async () => {
    const draft = JSON.stringify({
      verdict: 'pass',
      summary: 'Looks good.',
      mustFix: [
        { sectionPath: 'Purpose', title: 'Vague', body: 'a', suggestion: 'b', confidence: 20 },
      ],
      recommendations: [],
    });
    const agent = createReviewAgent(adapter(draft));

    const outcome = await agent.review({
      specType: 'solution',
      specContent: '# Solution',
      runId: 'run-4',
    });

    expect(outcome.kind).toBe('review');
    if (outcome.kind !== 'review') return;
    expect(outcome.repaired).toBe(true);
    expect(outcome.artifact.verdict).toBe('needs_revision');
    expect(outcome.items[0]?.id).toBe('mustfix-1');
    expect(outcome.items[0]?.confidence).toBe(10);
  });

  describe('Р-1 — exactly one retry on an unusable draft (task 111)', () => {
    it('draws a second sample when the first is unusable, and keeps it', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      const sequence = sequenceAdapter(['not JSON at all', stubReviewDocument('constitution')]);
      const agent = createReviewAgent(sequence.adapter);

      const outcome = await agent.review({
        specType: 'constitution',
        specContent: '# Constitution',
        runId: 'run-7',
      });

      expect(outcome.kind).toBe('review');
      expect(sequence.calls).toBe(2);
      expect(warn).toHaveBeenCalledOnce();
      warn.mockRestore();
    });

    it('stops at two: a second failure is an error the user is shown, not a third sample', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      const sequence = sequenceAdapter(['not JSON', 'still not JSON', stubReviewDocument()]);
      const agent = createReviewAgent(sequence.adapter);

      const outcome = await agent.review({
        specType: 'constitution',
        specContent: '# Constitution',
        runId: 'run-8',
      });

      expect(outcome.kind).toBe('draft-invalid');
      expect(sequence.calls).toBe(2);
      warn.mockRestore();
    });

    it('does not retry a draft that was merely repaired — repair is not failure', async () => {
      const sequence = sequenceAdapter([
        JSON.stringify({
          verdict: 'pass',
          summary: 'Fine.',
          mustFix: [{ sectionPath: 'P', title: 't', body: 'b', suggestion: 's', confidence: 99 }],
          recommendations: [],
        }),
      ]);
      const agent = createReviewAgent(sequence.adapter);

      const outcome = await agent.review({
        specType: 'constitution',
        specContent: '# Constitution',
        runId: 'run-9',
      });

      expect(outcome.kind).toBe('review');
      expect(sequence.calls).toBe(1);
    });
  });

  it('reviews the exact bytes it was given — the content reaches the prompt verbatim', async () => {
    const seen: string[] = [];
    const agent = createReviewAgent(recordingAdapter(seen));

    await agent.review({
      specType: 'tasks',
      specContent: '# Tasks\n\n- [ ] 1\\. Do the thing',
      runId: 'run-5',
    });

    expect(seen[0]).toContain('# Tasks\n\n- [ ] 1\\. Do the thing');
    expect(seen[0]).toContain('Review the tasks document');
  });

  /**
   * Task 113 — the re-review verifies what was ticked, and never re-litigates what was not.
   *
   * The negative half is the one that matters, so the fixture carries five points and ticks two:
   * the other three must appear nowhere in the prompt — not by title, not by suggestion, not under
   * a heading saying the user declined them. Absence is the mechanism (task 57's reasoning), so
   * absence is what is asserted.
   */
  describe('a re-review is handed the selected points, and only those (task 113)', () => {
    const FIVE = [
      { sectionPath: 'Scope', title: 'No non-goals', suggestion: 'Name a non-goal' },
      { sectionPath: 'Gates', title: 'Ownerless gate', suggestion: 'Name the module' },
      { sectionPath: 'API', title: 'No example', suggestion: 'Show one request' },
      { sectionPath: 'Risks', title: 'Order of risks', suggestion: 'Put likelihood first' },
      { sectionPath: 'Glossary', title: 'Unexpanded acronym', suggestion: 'Expand on first use' },
    ];

    it('states the ticked points and asks whether the revision applies them', async () => {
      const seen: string[] = [];
      const agent = createReviewAgent(recordingAdapter(seen));

      await agent.review({
        specType: 'constitution',
        specContent: '# Constitution',
        verifying: [FIVE[0], FIVE[3]].filter((point) => point !== undefined),
        runId: 'run-10',
      });

      const prompt = seen[0] ?? '';

      expect(prompt).toContain('This document has been revised');
      expect(prompt).toContain('exactly the 2 points');
      expect(prompt).toContain('Scope — No non-goals: Name a non-goal');
      expect(prompt).toContain('Risks — Order of risks: Put likelihood first');
    });

    it('carries no trace of the points the user did not tick', async () => {
      const seen: string[] = [];
      const agent = createReviewAgent(recordingAdapter(seen));

      await agent.review({
        specType: 'constitution',
        specContent: '# Constitution',
        verifying: [FIVE[0], FIVE[3]].filter((point) => point !== undefined),
        runId: 'run-11',
      });

      const prompt = seen[0] ?? '';

      for (const absent of [
        'Ownerless gate',
        'Name the module',
        'No example',
        'Show one request',
        'Unexpanded acronym',
        'Expand on first use',
      ]) {
        expect(prompt).not.toContain(absent);
      }

      // Not "declined", not "do not raise", not "the user chose not to" — absent.
      expect(prompt).not.toMatch(/declined|did not select|not chosen|do not raise/i);
    });

    it('says nothing about verification on a first review', async () => {
      const seen: string[] = [];
      const agent = createReviewAgent(recordingAdapter(seen));

      await agent.review({ specType: 'constitution', specContent: '# C', runId: 'run-12' });

      expect(seen[0] ?? '').not.toContain('has been revised');
    });
  });

  it('never offers the model the user decision vocabulary (constitution P2)', async () => {
    const seen: string[] = [];
    const agent = createReviewAgent(recordingAdapter(seen));

    await agent.review({ specType: 'constitution', specContent: '# C', runId: 'run-6' });

    for (const word of ['request_changes', 'accept the review', 'ignore the review']) {
      expect(seen[0]).not.toContain(word);
    }
  });
});
