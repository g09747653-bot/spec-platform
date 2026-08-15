import { describe, expect, it, vi } from 'vitest';

import type { GenerateResult, LlmAdapter } from '@/modules/adapters/llm';

import { createEditAgent, type EditDocument } from './edit-agent';

/**
 * Task 118 — the edit agent, and the three ways its answer can be wrong.
 *
 * Two of them are about what the model *says* and are enforced here rather than downstream: a file
 * name it invented, and a file it returned unchanged. The third is an unusable draft, which the M9п
 * gate walk met on a small local model — and which is resampled exactly once, the rule D-94 wrote
 * for interview drafts.
 */
const DOCUMENTS: EditDocument[] = [
  { fileName: 'constitution.md', content: '# Constitution\n\n## Principles\n\nBe careful.\n' },
  { fileName: 'requirements.md', content: '# Requirements\n\n## FR-001\n\nDo the thing.\n' },
];

function adapterAnswering(...replies: string[]): { adapter: LlmAdapter; calls: () => number } {
  let call = 0;

  const adapter = {
    generateStreaming: vi.fn(async (): Promise<GenerateResult> => {
      const text = replies[Math.min(call, replies.length - 1)] ?? '';
      call += 1;

      return Promise.resolve({ text, providerUsed: 'stub', attempts: 1 });
    }),
  } as unknown as LlmAdapter;

  return { adapter, calls: () => call };
}

const propose = (adapter: LlmAdapter) =>
  createEditAgent(adapter).propose({
    documents: DOCUMENTS,
    instruction: 'Add a rate limit.',
    runId: 'run-1',
  });

describe('the edit agent (task 118)', () => {
  it('keeps the files the model rewrote, with their rationale', async () => {
    const { adapter } = adapterAnswering(
      JSON.stringify({
        summary: 'Added a rate limit.',
        files: [
          {
            fileName: 'requirements.md',
            content: '# Requirements\n\n## FR-001\n\nDo the thing, at most ten times a minute.\n',
            rationale: 'The limit is a requirement.',
          },
        ],
      }),
    );

    const outcome = await propose(adapter);

    expect(outcome.kind).toBe('edits');
    if (outcome.kind !== 'edits') return;
    expect(outcome.files.map((file) => file.fileName)).toEqual(['requirements.md']);
    expect(outcome.summary).toBe('Added a rate limit.');
  });

  it('drops a file name we never supplied, rather than resolving it', async () => {
    const { adapter } = adapterAnswering(
      JSON.stringify({
        summary: 'Touched something else.',
        files: [{ fileName: 'solution.md', content: '# Solution\n', rationale: 'invented' }],
      }),
    );

    const outcome = await propose(adapter);

    expect(outcome.kind).toBe('edits');
    if (outcome.kind !== 'edits') return;
    // A proposal has to point at a row that exists; guessing which one was meant would be worse.
    expect(outcome.files).toEqual([]);
  });

  it('drops a file returned byte-identical — that is not a change', async () => {
    const { adapter } = adapterAnswering(
      JSON.stringify({
        summary: 'Returned everything.',
        files: DOCUMENTS.map((document) => ({ ...document, rationale: 'unchanged' })),
      }),
    );

    const outcome = await propose(adapter);

    expect(outcome.kind).toBe('edits');
    if (outcome.kind !== 'edits') return;
    expect(outcome.files).toEqual([]);
  });

  /*
   * The M9п walk's finding: one unusable sample cost a whole edit. Resampling invents nothing —
   * the answer is a set of whole documents, so there is no half of it worth salvaging.
   */
  it('resamples once when the draft is unusable, and succeeds on the second', async () => {
    const { adapter, calls } = adapterAnswering(
      'Sure! Here are the changes you asked for:',
      JSON.stringify({
        summary: 'Added a rate limit.',
        files: [
          { fileName: 'requirements.md', content: '# Requirements\n\nrewritten\n', rationale: 'x' },
        ],
      }),
    );

    const outcome = await propose(adapter);

    expect(calls()).toBe(2);
    expect(outcome.kind).toBe('edits');
  });

  it('gives up after the second unusable draft, rather than sampling a third time', async () => {
    const { adapter, calls } = adapterAnswering('not json', 'still not json');

    const outcome = await propose(adapter);

    expect(calls()).toBe(2);
    expect(outcome.kind).toBe('draft-invalid');
  });
});
