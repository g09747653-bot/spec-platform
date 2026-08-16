import { describe, expect, it } from 'vitest';

import {
  capacityFor,
  estimatePromptTokens,
  PromptOverCapacityError,
  type PromptTarget,
} from '@/modules/adapters/llm';
import {
  documentAt,
  methodologyConfig,
  templateText,
  type StageDocument,
} from '@/modules/methodologies';
import { specGenerationPrompt } from '@/modules/prompts/assets/spec-generation';

import { assembleContext, type ContextSources } from './context-assembler';
import { describePacking, packPrompt } from './pack-prompt';
import { specPromptBuilder } from './spec/spec-agent';

/**
 * Packing a prompt to the target provider's window (task 130; амендмент А-8; D-146).
 *
 * The acceptance criteria this file carries are the four the task states, and each of them is a
 * guard against a failure that produced a *plausible document* rather than an error: a summary of
 * two web pages, written confidently, because the instruction that said what to write had been cut
 * off the front of the prompt by the runtime itself.
 */

/** The window the gate runs on: `OLLAMA_CONTEXT_LENGTH=16384`, minus the reserve, minus the margin. */
const LOCAL: PromptTarget = { provider: 'ollama', capacity: capacityFor('ollama', 16_384) };
const HOSTED: PromptTarget = { provider: 'google', capacity: capacityFor('google', 16_384) };

const filler = (size: number) =>
  'The charity tracks grant deadlines and drafts reminders. '
    .repeat(Math.ceil(size / 56))
    .slice(0, size);

/**
 * The state that reproduced run-2's failure: a context far past the local window, whose bulk is the
 * live research every generation performs (`WEB_FETCH_MAX_BYTES` × `PAGES_TO_READ`, D-146).
 */
const overflowing: ContextSources = {
  initialPrompt:
    'A tool that tracks a small charity’s grant applications and drafts the reminders.',
  answers: [
    {
      stage: 'interview',
      roundNumber: 1,
      questionId: 'q-audience',
      selectedOptions: ['charity-admins'],
      freeText: 'and the trustees who sign off',
    },
  ],
  attachments: [{ id: 'att-1', fileName: 'grants.pdf', text: filler(12_000) }],
  approvedSpecs: [{ specType: 'constitution', content: filler(18_000) }],
  research: [
    {
      url: 'https://example.test/a',
      title: 'Grant tooling',
      text: filler(42_000),
      truncated: true,
    },
    {
      url: 'https://example.test/b',
      title: 'Reminder apps',
      text: filler(42_000),
      truncated: true,
    },
  ],
};

const parityBuild = specPromptBuilder({
  specType: 'constitution',
  initialPrompt: overflowing.initialPrompt,
  contentLanguage: 'en',
});

/** The longest foreign graph's first document — a vendored template, which is the big fixed block. */
function speckitConstitution(): StageDocument {
  const document = documentAt(methodologyConfig('speckit-greenfield-v1'), 'constitution');

  if (document === null) throw new Error('the SpecKit constitution document moved');

  return document;
}

describe('the inviolable block (AC-1)', () => {
  it('is byte-identical whether or not the context had to be packed', () => {
    const packed = packPrompt({
      build: parityBuild,
      sources: overflowing,
      target: LOCAL,
      label: 'c',
    });
    const unpacked = packPrompt({
      build: parityBuild,
      sources: overflowing,
      target: HOSTED,
      label: 'c',
    });

    const system = (messages: readonly { role: string; content: string }[]) =>
      messages.find((message) => message.role === 'system')?.content;

    expect(system(packed.messages)).toBe(system(unpacked.messages));

    // And the head of the user turn — the instruction and the required-section list — is untouched.
    const head = (messages: readonly { role: string; content: string }[]) =>
      (messages.find((message) => message.role === 'user')?.content ?? '').split(
        'Context gathered so far:',
      )[0];

    expect(head(packed.messages)).toBe(head(unpacked.messages));
  });

  it('carries a vendored methodology template whole into the local window', () => {
    const document = speckitConstitution();
    const build = specPromptBuilder({
      specType: 'constitution',
      document,
      documentLabel: 'Constitution',
      initialPrompt: overflowing.initialPrompt,
    });

    const packed = packPrompt({
      build,
      sources: overflowing,
      target: LOCAL,
      label: 'constitution',
    });
    const user = packed.messages.find((message) => message.role === 'user')?.content ?? '';

    if (document.templateId !== null) expect(user).toContain(templateText(document.templateId));
  });

  it('drops the research first, and says so in the text', () => {
    const packed = packPrompt({
      build: parityBuild,
      sources: overflowing,
      target: LOCAL,
      label: 'c',
    });
    const research = packed.record.sections.find((entry) => entry.section === 'research');
    const specs = packed.record.sections.find((entry) => entry.section === 'approved-specs');

    expect(research?.omittedChars).toBeGreaterThan(0);
    expect(research?.omittedChars).toBeGreaterThan(specs?.omittedChars ?? 0);

    const user = packed.messages.find((message) => message.role === 'user')?.content ?? '';
    expect(user).toContain('## Pages read during live research');
    expect(user).toContain('context budget');
  });
});

describe('the hosted path is unchanged (AC-1)', () => {
  it('produces exactly the prompt it produced before А-8', () => {
    /*
     * The snapshot is not a stored file — it is the pre-А-8 code path, spelled out: assemble the
     * context at the default budget, hand the string to the prompt asset. If the packer ever starts
     * shortening a hosted prompt, these two stop matching.
     */
    const before = specGenerationPrompt({
      specType: 'constitution',
      initialPrompt: overflowing.initialPrompt,
      context: assembleContext(overflowing).text,
      contentLanguage: 'en',
    });

    const after = packPrompt({
      build: parityBuild,
      sources: overflowing,
      target: HOSTED,
      label: 'constitution',
    });

    expect(after.messages).toEqual([
      { role: 'system', content: before.system },
      { role: 'user', content: before.user },
    ]);
    expect(after.record.sections.every((entry) => entry.omittedChars === 0)).toBe(true);
  });
});

describe('the capacity is never exceeded (AC-2)', () => {
  const windows = [4_096, 8_192, 16_384, 32_768];

  const fixtures: readonly ContextSources[] = [
    overflowing,
    { ...overflowing, research: [] },
    { ...overflowing, attachments: [], approvedSpecs: [] },
    {
      ...overflowing,
      // Cyrillic, which the same tokeniser splits far more finely (У-1 writes in the seed's language).
      initialPrompt: 'Инструмент для НКО: сроки заявок на гранты и черновики напоминаний.',
      approvedSpecs: [{ specType: 'constitution', content: 'требование к системе. '.repeat(900) }],
    },
    {
      initialPrompt: 'A minimal idea.',
      answers: [],
      attachments: [],
      approvedSpecs: [],
    },
  ];

  for (const window of windows) {
    for (const [index, sources] of fixtures.entries()) {
      it(`fits window ${String(window)} for fixture ${String(index)}`, () => {
        const target: PromptTarget = {
          provider: 'ollama',
          capacity: capacityFor('ollama', window),
        };
        const packed = packPrompt({ build: parityBuild, sources, target, label: 'constitution' });

        expect(estimatePromptTokens(packed.messages)).toBeLessThanOrEqual(
          target.capacity.promptTokens,
        );
        expect(packed.record.estimatedTokens).toBeLessThanOrEqual(target.capacity.promptTokens);
      });
    }
  }
});

describe('when even the instruction does not fit', () => {
  it('refuses rather than shortening the block А-8 calls inviolable', () => {
    const document = speckitConstitution();
    const build = specPromptBuilder({
      specType: 'constitution',
      document,
      documentLabel: 'Constitution',
      initialPrompt: overflowing.initialPrompt,
    });

    // 1 024 tokens of window: a machine whose `OLLAMA_CONTEXT_LENGTH` was never raised.
    const target: PromptTarget = { provider: 'ollama', capacity: capacityFor('ollama', 1_024) };

    expect(() =>
      packPrompt({ build, sources: overflowing, target, label: 'constitution' }),
    ).toThrow(PromptOverCapacityError);
  });
});

describe('the packing record (AC-4 observability)', () => {
  it('names every section and what became of it, in one line', () => {
    const packed = packPrompt({
      build: parityBuild,
      sources: overflowing,
      target: LOCAL,
      label: 'c',
    });
    const line = describePacking(packed.record);

    expect(line).toContain('provider=ollama');
    expect(line).toContain('research=');
    expect(line).toContain(`/${String(LOCAL.capacity.promptTokens)}`);
    expect(line).not.toContain('\n');
  });

  it('is deterministic, so two identical runs are comparable in a log', () => {
    const once = packPrompt({
      build: parityBuild,
      sources: overflowing,
      target: LOCAL,
      label: 'c',
    });
    const twice = packPrompt({
      build: parityBuild,
      sources: overflowing,
      target: LOCAL,
      label: 'c',
    });

    expect(describePacking(once.record)).toBe(describePacking(twice.record));
    expect(once.messages).toEqual(twice.messages);
  });
});
