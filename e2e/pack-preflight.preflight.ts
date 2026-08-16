/* eslint-disable no-restricted-properties -- a hand-run measurement, not application code: it takes
   its server, its model and its output directory from the environment, because that is how a person
   points it at the machine being measured. */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { capacityFor, type ModelMessage, type PromptTarget } from '@/modules/adapters/llm';
import { createProviderStream, DEFAULT_MODELS } from '@/modules/adapters/llm/providers';
import { assembleContext, type ContextSources } from '@/modules/agents/context-assembler';
import { describePacking, packPrompt } from '@/modules/agents/pack-prompt';
import { documentStructureVerdict } from '@/modules/agents/spec/document-structure';
import { specPromptBuilder } from '@/modules/agents/spec/spec-agent';
import { documentAt, methodologyConfig } from '@/modules/methodologies';
import { describeViolations, parseHeadings } from '@/modules/specs/validate-structure';

/**
 * **The run-2 failure state, re-run against the packer** (task 130 AC-3; the D-91 pattern).
 *
 * Round 3 established what broke the M9п gate by measurement rather than by argument: the generation
 * context reaches the assembler's 120 000-character ceiling on *every* document, because live
 * research runs on every generation; the resulting prompt is ~22 000 tokens; and the local runtime
 * makes that fit by itself, keeping four tokens of the head and the tail. The head is the system
 * instruction and the required-section list. So the model was handed two web pages and no
 * instructions, wrote a summary of them, and the structural check rejected it — three times, because
 * truncation is deterministic (D-146).
 *
 * This asserts the inverse, on the same machine, with the same model, on the same document: the
 * state that produced `missing section "## Core Principles"` now produces a conformant document.
 * Both halves are measured, because "it works now" is worth nothing without the failure beside it.
 *
 * Not part of any suite and never run in CI — see `vitest.live.config.ts`.
 */

const OUT = process.env.PREFLIGHT_OUT ?? 'artifacts/gate-M9/run-4/preflight';
const OLLAMA_LOG = process.env.OLLAMA_LOG ?? 'artifacts/gate-M9/run-4/ollama-serve.err';
const BASE_URL = process.env.OLLAMA_BASE_URL ?? 'http://127.0.0.1:11434/v1';
const CONTEXT_LENGTH = Number(process.env.OLLAMA_CONTEXT_LENGTH ?? '16384');

/** The context size run-2 actually assembled, recorded in the BLOCKED entry and in D-146. */
const RUN_2_CONTEXT_CHARS = 114_389;

const LOCAL: PromptTarget = { provider: 'ollama', capacity: capacityFor('ollama', CONTEXT_LENGTH) };

const IDEA =
  'A tool that tracks which of a small charity’s grant applications are due, and drafts the reminder emails';

/** Filler with the texture of what actually fills the budget: fetched prose, not a repeated letter. */
function page(seed: string, size: number): string {
  const sentence = `${seed} teams compare tooling, pricing tiers, integrations and onboarding before they commit. `;

  return sentence.repeat(Math.ceil(size / sentence.length)).slice(0, size);
}

/**
 * The run-2 state, tuned so the default-budget context is **exactly** 114 389 characters.
 *
 * Tuned rather than approximated because the number is the claim: this is the context that produced
 * the BLOCKED entry's `missing section "## Core Principles"; missing section "## Governance"`.
 */
function runTwoSources(): ContextSources {
  const base = (researchChars: number): ContextSources => ({
    initialPrompt: IDEA,
    answers: [
      {
        stage: 'interview',
        roundNumber: 1,
        questionId: 'q-audience',
        selectedOptions: ['charity-administrators'],
        freeText: 'and the trustees who sign the applications off',
      },
      {
        stage: 'interview',
        roundNumber: 2,
        questionId: null,
        selectedOptions: [],
        freeText: 'Deadlines come from a spreadsheet today; nobody trusts it.',
      },
    ],
    attachments: [{ id: 'att-1', fileName: 'grant-calendar.xlsx', text: page('Attached', 9_000) }],
    approvedSpecs: [],
    research: [
      {
        url: 'https://example.test/grant-tools',
        title: 'Grant management tools compared',
        text: page('Nonprofit', Math.ceil(researchChars / 2)),
        truncated: true,
      },
      {
        url: 'https://example.test/reminder-apps',
        title: 'Reminder and deadline apps',
        text: page('Deadline', researchChars - Math.ceil(researchChars / 2)),
        truncated: true,
      },
    ],
  });

  // Two passes converge: the assembled length is affine in the research size.
  let research = 100_000;
  for (let round = 0; round < 8; round += 1) {
    const length = assembleContext(base(research)).text.length;
    if (length === RUN_2_CONTEXT_CHARS) break;
    research += RUN_2_CONTEXT_CHARS - length;
  }

  return base(research);
}

/** Records in the Ollama server log, so truncation is read from the runtime rather than inferred. */
function ollamaLog(): { truncations: number; promptTokens: number[] } {
  let text: string;

  try {
    text = readFileSync(OLLAMA_LOG, 'utf8');
  } catch {
    return { truncations: 0, promptTokens: [] };
  }

  return {
    truncations: (text.match(/truncating input prompt/g) ?? []).length,
    promptTokens: [...text.matchAll(/task\.n_tokens = (\d+)/g)].map((match) => Number(match[1])),
  };
}

function speckitConstitution() {
  const document = documentAt(methodologyConfig('speckit-greenfield-v1'), 'constitution');
  if (document === null) throw new Error('the SpecKit constitution document moved');

  return document;
}

interface Attempt {
  label: string;
  promptChars: number;
  estimatedTokens: number;
  readTokens: number | null;
  truncations: number;
  seconds: number;
  valid: boolean;
  violations: string;
  headings: string[];
  content: string;
}

const document = speckitConstitution();
const build = specPromptBuilder({
  specType: 'constitution',
  document,
  documentLabel: 'Constitution',
  initialPrompt: IDEA,
  contentLanguage: 'en',
});

const stream = createProviderStream(
  'ollama',
  { baseUrl: BASE_URL },
  process.env.PREFLIGHT_MODEL ?? DEFAULT_MODELS.ollama,
  LOCAL.capacity,
);

async function attempt(
  label: string,
  messages: readonly ModelMessage[],
  estimatedTokens: number,
): Promise<Attempt> {
  const before = ollamaLog();
  const startedAt = Date.now();
  const content = await stream({ messages, onDelta: () => undefined });
  const seconds = Math.round((Date.now() - startedAt) / 100) / 10;
  const after = ollamaLog();

  const verdict = documentStructureVerdict(document, 'constitution', content);
  const promptChars = messages.reduce((total, message) => total + message.content.length, 0);

  return {
    label,
    promptChars,
    estimatedTokens,
    readTokens: after.promptTokens.at(-1) ?? null,
    truncations: after.truncations - before.truncations,
    seconds,
    valid: verdict.valid,
    violations: describeViolations(verdict.violations),
    headings: parseHeadings(content)
      .slice(0, 8)
      .map((heading) => `${'#'.repeat(heading.level)} ${heading.text}`),
    content,
  };
}

describe('the run-2 context on the local model (AC-3)', () => {
  const sources = runTwoSources();
  const results: Attempt[] = [];

  it('reproduces the state that failed: 114 389 characters of context', () => {
    expect(assembleContext(sources).text.length).toBe(RUN_2_CONTEXT_CHARS);
  });

  it('is truncated and non-conformant when the prompt is not packed (the round-2 failure)', async () => {
    const unpacked = build(assembleContext(sources).text);
    const messages = [
      { role: 'system' as const, content: unpacked.system },
      { role: 'user' as const, content: unpacked.user },
    ];

    const result = await attempt('unpacked (pre-А-8)', messages, 0);
    results.push(result);

    expect(result.truncations).toBeGreaterThan(0);
    expect(result.valid).toBe(false);
  });

  it('is read whole and conformant once packed to the declared capacity', async () => {
    const packed = packPrompt({ build, sources, target: LOCAL, label: 'constitution' });
    const result = await attempt('packed (А-8)', packed.messages, packed.record.estimatedTokens);
    results.push(result);

    expect(result.truncations).toBe(0);
    expect(result.readTokens ?? 0).toBeLessThanOrEqual(LOCAL.capacity.promptTokens);
    expect(result.valid).toBe(true);

    mkdirSync(OUT, { recursive: true });
    writeFileSync(`${OUT}/run-2-state-packed.md`, result.content, 'utf8');
    writeFileSync(
      `${OUT}/run-2-state-unpacked.md`,
      results[0]?.content ?? '(the unpacked attempt did not run)',
      'utf8',
    );
    writeFileSync(
      `${OUT}/RUN-2-STATE.md`,
      [
        '# Состояние run-2, прогнанное через упаковщик (задача 130, AC-3)',
        '',
        `Модель \`${process.env.PREFLIGHT_MODEL ?? DEFAULT_MODELS.ollama}\`, окно ${String(CONTEXT_LENGTH)},`,
        `объявленная ёмкость промпта ${String(LOCAL.capacity.promptTokens)} токенов,`,
        `резерв генерации ${String(LOCAL.capacity.generationReserveTokens)}.`,
        `Контекст при бюджете по умолчанию — ${String(RUN_2_CONTEXT_CHARS)} символов, то есть тот самый.`,
        '',
        '| прогон | символов в промпте | наша оценка, ток. | прочитано моделью, ток. | обрезок | секунд | структура |',
        '|---|---|---|---|---|---|---|',
        ...results.map(
          (row) =>
            `| ${row.label} | ${String(row.promptChars)} | ${row.estimatedTokens === 0 ? '—' : String(row.estimatedTokens)} | ${String(row.readTokens ?? 0)} | **${String(row.truncations)}** | ${String(row.seconds)} | ${row.valid ? '**верна**' : `\`${row.violations}\``} |`,
        ),
        '',
        '## Заголовки, которые написала модель',
        '',
        ...results.flatMap((row) => [
          `**${row.label}**`,
          '',
          ...row.headings.map((h) => `- \`${h}\``),
          '',
        ]),
        '## Запись упаковки',
        '',
        '```',
        describePacking(
          packPrompt({ build, sources, target: LOCAL, label: 'constitution' }).record,
        ),
        '```',
        '',
        'Документы: `run-2-state-unpacked.md`, `run-2-state-packed.md`.',
      ].join('\n'),
      'utf8',
    );
  });
});
