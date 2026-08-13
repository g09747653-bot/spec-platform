import { describe, expect, it } from 'vitest';

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
 * Task 54 — the review contract.
 *
 * The acceptance criteria are about what may reach storage, so the assertions are about the
 * *boundary*: what `validateReviewDraft` lets through, and what the agent returns when it does not.
 * There is no test that a well-formed review is useful — semantic quality of model prose is
 * explicitly out of scope (constitution — Testing Approaches, "Not required in v1").
 */
const item = (overrides: Record<string, unknown> = {}) => ({
  id: 'mf-1',
  section: 'Core Principles',
  line: 12,
  confidenceScore: 8,
  description: 'P2 is stated but never gated.',
  suggestion: 'Name the gate that enforces it.',
  ...overrides,
});

const artifact = (overrides: Record<string, unknown> = {}) => ({
  outcome: 'needs_revision',
  mustfix: [item()],
  recommendations: [],
  ...overrides,
});

describe('ReviewArtifact validation (task 54)', () => {
  describe('AC-1 — output is Zod-validated before persistence', () => {
    it('accepts a well-formed review unchanged', () => {
      const result = validateReviewDraft(artifact());

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.repaired).toBe(false);
      expect(result.artifact.mustfix[0]?.id).toBe('mf-1');
    });

    it('rejects a draft that is not an object at all', () => {
      expect(validateReviewDraft('needs revision, probably').ok).toBe(false);
      expect(validateReviewDraft([artifact()]).ok).toBe(false);
      expect(validateReviewDraft(null).ok).toBe(false);
    });

    it('rejects a draft with no repair pass rather than guessing', () => {
      const result = validateReviewDraft({ outcome: 'pass' });

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.code).toBe('DRAFT_INVALID');
      expect(result.issues.join('\n')).toMatch(/mustfix/);
    });

    it('reports the path of each rejection, so a systematic defect is diagnosable', () => {
      const result = validateReviewDraft(artifact({ mustfix: [item({ confidenceScore: 2 })] }));

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.issues.join('\n')).toMatch(/mustfix\.0\.confidenceScore/);
    });
  });

  describe('AC-2 — every item classifies as blocking or advisory and names a section', () => {
    it('carries the classification into storage as an explicit severity', () => {
      const items = flattenReviewItems(
        ReviewArtifact.parse(
          artifact({
            mustfix: [item({ id: 'mf-1' })],
            recommendations: [item({ id: 'rec-1' })],
          }),
        ),
      );

      expect(items.map((entry) => [entry.id, entry.severity])).toEqual([
        ['mf-1', 'blocking'],
        ['rec-1', 'advisory'],
      ]);
    });

    it('round-trips through storage: split(flatten(x)) restores both lists', () => {
      const parsed = ReviewArtifact.parse(
        artifact({
          mustfix: [item({ id: 'mf-1' }), item({ id: 'mf-2' })],
          recommendations: [item({ id: 'rec-1' })],
        }),
      );

      const split = splitPersistedItems(flattenReviewItems(parsed));

      expect(split.mustfix.map((entry) => entry.id)).toEqual(['mf-1', 'mf-2']);
      expect(split.recommendations.map((entry) => entry.id)).toEqual(['rec-1']);
    });

    it('stores blocking items first, so storage order is render order', () => {
      const items = flattenReviewItems(
        ReviewArtifact.parse(
          artifact({
            mustfix: [item({ id: 'mf-1' })],
            recommendations: [item({ id: 'rec-1' }), item({ id: 'rec-2' })],
          }),
        ),
      );

      expect(items.map((entry) => entry.id)).toEqual(['mf-1', 'rec-1', 'rec-2']);
    });

    it('rejects an item with no section, an empty section, or no suggestion', () => {
      for (const broken of [
        item({ section: undefined }),
        item({ section: '' }),
        item({ suggestion: '' }),
        item({ description: '' }),
      ]) {
        expect(validateReviewDraft(artifact({ mustfix: [broken] })).ok).toBe(false);
      }
    });

    it('rejects a line number that is zero, negative or fractional', () => {
      for (const line of [0, -3, 2.5]) {
        expect(validateReviewDraft(artifact({ mustfix: [item({ line })] })).ok).toBe(false);
      }
    });

    it('rejects a confidence score outside the declared 5..10 band', () => {
      for (const confidenceScore of [4, 11, 7.5]) {
        expect(validateReviewDraft(artifact({ mustfix: [item({ confidenceScore })] })).ok).toBe(
          false,
        );
      }
    });
  });

  describe('AC-3 — the outcome is exactly pass or needs_revision', () => {
    it('accepts both declared outcomes', () => {
      expect(validateReviewDraft(artifact({ outcome: 'needs_revision' })).ok).toBe(true);
      expect(
        validateReviewDraft(artifact({ outcome: 'pass', mustfix: [], recommendations: [] })).ok,
      ).toBe(true);
    });

    it('rejects a user decision offered as an outcome (constitution P2)', () => {
      for (const outcome of ['accept', 'ignore', 'request_changes', 'approve']) {
        expect(validateReviewDraft(artifact({ outcome })).ok).toBe(false);
      }
    });

    it('rejects a pass that contradicts its own blocking items', () => {
      const result = validateReviewDraft(artifact({ outcome: 'pass', mustfix: [item()] }));

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.issues.join('\n')).toMatch(/contradicts/);
    });

    it('accepts a pass with advisory items — advisory is not blocking', () => {
      expect(
        validateReviewDraft(
          artifact({ outcome: 'pass', mustfix: [], recommendations: [item({ id: 'rec-1' })] }),
        ).ok,
      ).toBe(true);
    });
  });

  describe('ids are unique across both lists (FR-010 AC-7 depends on it)', () => {
    it('rejects the same id used in mustfix and recommendations', () => {
      const result = validateReviewDraft(
        artifact({ mustfix: [item({ id: 'dup' })], recommendations: [item({ id: 'dup' })] }),
      );

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.issues.join('\n')).toMatch(/unique/);
    });

    it('rejects a duplicate within one list', () => {
      expect(
        validateReviewDraft(artifact({ mustfix: [item({ id: 'dup' }), item({ id: 'dup' })] })).ok,
      ).toBe(false);
    });
  });

  describe('the repair pass fixes handles, never content', () => {
    const repair = repairReviewDraft();

    it('assigns a positional id where the model left none', () => {
      const result = validateReviewDraft(
        artifact({ mustfix: [item({ id: undefined }), item({ id: undefined })] }),
        repair,
      );

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.repaired).toBe(true);
      expect(result.artifact.mustfix.map((entry) => entry.id)).toEqual(['mustfix-1', 'mustfix-2']);
    });

    it('disambiguates a duplicated id instead of dropping the item', () => {
      const result = validateReviewDraft(
        artifact({ mustfix: [item({ id: 'dup' })], recommendations: [item({ id: 'dup' })] }),
        repair,
      );

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const ids = [
        ...result.artifact.mustfix.map((entry) => entry.id),
        ...result.artifact.recommendations.map((entry) => entry.id),
      ];
      expect(new Set(ids).size).toBe(2);
      expect(ids).toContain('dup');
    });

    it('clamps a confidence score into the band and floors a bad line number', () => {
      const result = validateReviewDraft(
        artifact({ mustfix: [item({ confidenceScore: 99, line: 0 })] }),
        repair,
      );

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.artifact.mustfix[0]?.confidenceScore).toBe(10);
      expect(result.artifact.mustfix[0]?.line).toBe(1);
    });

    it('derives the outcome from the repaired arrays, rather than trusting a contradiction', () => {
      const result = validateReviewDraft(artifact({ outcome: 'pass', mustfix: [item()] }), repair);

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.artifact.outcome).toBe('needs_revision');
    });

    it('normalises a near-miss verdict, and treats anything unrecognised as needing revision', () => {
      for (const [outcome, expected] of [
        ['PASS', 'pass'],
        [' pass ', 'pass'],
        ['needs revision', 'needs_revision'],
        ['looks good to me', 'needs_revision'],
        [42, 'needs_revision'],
      ] as const) {
        const result = validateReviewDraft(
          artifact({ outcome, mustfix: [], recommendations: [] }),
          repair,
        );

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.artifact.outcome).toBe(expected);
      }
    });

    it('drops an item whose finding is missing, rather than inventing one', () => {
      const result = validateReviewDraft(
        artifact({ mustfix: [item({ id: 'mf-1' }), item({ id: 'mf-2', suggestion: '' })] }),
        repair,
      );

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.artifact.mustfix.map((entry) => entry.id)).toEqual(['mf-1']);
    });

    it('adds no item that the model did not propose', () => {
      const result = validateReviewDraft(
        { outcome: 'pass', mustfix: [], recommendations: [] },
        repair,
      );

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.artifact.mustfix).toEqual([]);
      expect(result.artifact.recommendations).toEqual([]);
    });

    it('reads a missing or malformed list as an empty one', () => {
      const result = validateReviewDraft({ outcome: 'pass', mustfix: 'not a list' }, repair);

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.artifact.mustfix).toEqual([]);
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

describe('createReviewAgent (task 54)', () => {
  const adapter = (document: string) => createTestDoubleAdapter({ document });

  /** An adapter that answers with a valid review and records the prompt it was handed. */
  const recordingAdapter = (seen: string[]): LlmAdapter => ({
    generateStreaming: (options) => {
      seen.push(options.messages.map((message) => message.content).join('\n'));
      return Promise.resolve({ text: stubReviewDocument(), providerUsed: 'stub', attempts: 1 });
    },
  });

  it('returns a validated artifact and its flattened items', async () => {
    const agent = createReviewAgent(adapter(stubReviewDocument('constitution')));

    const outcome = await agent.review({
      specType: 'constitution',
      specContent: '# Constitution\n\n## Purpose\n\nText.',
      runId: 'run-1',
    });

    expect(outcome.kind).toBe('review');
    if (outcome.kind !== 'review') return;
    expect(outcome.promptId).toBe('review.board.v1');
    expect(outcome.artifact.outcome).toBe('needs_revision');
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

  it('repairs a salvageable draft and says that it did', async () => {
    const draft = JSON.stringify({
      outcome: 'pass',
      mustfix: [
        { section: 'Purpose', line: 3, confidenceScore: 20, description: 'a', suggestion: 'b' },
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
    expect(outcome.artifact.outcome).toBe('needs_revision');
    expect(outcome.items[0]?.id).toBe('mustfix-1');
    expect(outcome.items[0]?.confidenceScore).toBe(10);
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

  it('never offers the model the user decision vocabulary (constitution P2)', async () => {
    const seen: string[] = [];
    const agent = createReviewAgent(recordingAdapter(seen));

    await agent.review({ specType: 'constitution', specContent: '# C', runId: 'run-6' });

    for (const word of ['request_changes', 'accept the review', 'ignore the review']) {
      expect(seen[0]).not.toContain(word);
    }
  });
});
