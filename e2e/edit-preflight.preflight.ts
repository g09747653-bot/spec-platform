/* eslint-disable no-restricted-properties -- a hand-run measurement, not application code: it takes
   its server, its model and its output directory from the environment, because that is how a person
   points it at the machine being measured. */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  capacityFor,
  createFailoverClient,
  type GenerateOptions,
  type LlmAdapter,
} from '@/modules/adapters/llm';
import { createProviderStream, DEFAULT_MODELS } from '@/modules/adapters/llm/providers';
import {
  createEditAgent,
  type EditDocument,
  type EditOutcome,
} from '@/modules/agents/edit/edit-agent';
import { bundleFileNames, methodologyConfig } from '@/modules/methodologies';

/**
 * **The D-161 state, re-run under constraint** (task 131 AC-1; амендмент А-10; the D-91 pattern).
 *
 * D-161 is the finding this task exists to answer: on the M9п round-5 walk the local model returned
 * «the draft is not parseable JSON» three times running on a whole-bundle Edit proposal — six samples
 * with the resample counted — while everything around it was healthy. The prompt was read whole
 * (7 596 tokens of a 16 384 window, zero truncations), each attempt took its full 4.5 minutes and
 * ended with the server's own verdict. Not packing, not the deadline, not a timeout: the limit of the
 * model asked to hold strict JSON while restating four documents.
 *
 * This measures the inverse on the same machine: the same bundle, the same instruction, the same
 * model, and one field added to the call — `structuredOutput`, which reaches Ollama as `format` and
 * makes valid JSON a property of the sampler rather than of the model's obedience.
 *
 * **Both halves are measured**, as they were for А-8, because "it works now" is worth nothing without
 * the failure beside it. Set `PREFLIGHT_UNCONSTRAINED=1` to run the three unconstrained samples too;
 * they cost about fifteen minutes and reproduce D-161 rather than testing this task's change.
 *
 * **What is reproduced, and what is not.** The four documents are the ones the failing walk produced,
 * read back from its own transcript, and the instruction is the one that walk typed. The transcript
 * keeps 2 500 characters of each document, so each is extended with its own sections until the bundle
 * is the size the walk's was — the size is what makes the answer long, and the length of the answer
 * is what D-161 is about. The runtime's own token count is recorded next to the target so the
 * reproduction can be checked rather than believed.
 *
 * Not part of any suite and never run in CI — see `vitest.live.config.ts`.
 *
 * Run it as the gate is prepared:
 *   OLLAMA_CONTEXT_LENGTH=16384 OLLAMA_KEEP_ALIVE=4h OLLAMA_NUM_PARALLEL=1 ollama serve
 *   pnpm test:preflight
 */

const OUT = process.env.PREFLIGHT_OUT ?? 'artifacts/gate-M10/preflight';
const OLLAMA_LOG = process.env.OLLAMA_LOG ?? 'artifacts/gate-M10/ollama-serve.err';
const BASE_URL = process.env.OLLAMA_BASE_URL ?? 'http://127.0.0.1:11434/v1';
const CONTEXT_LENGTH = Number(process.env.OLLAMA_CONTEXT_LENGTH ?? '16384');
const MODEL = process.env.PREFLIGHT_MODEL ?? DEFAULT_MODELS.ollama;
const SAMPLES = Number(process.env.PREFLIGHT_SAMPLES ?? '3');

/** The walk that produced D-161; its transcript is the source of the bundle under edit. */
const WALK_TRANSCRIPT =
  process.env.PREFLIGHT_TRANSCRIPT ?? 'artifacts/gate-M9/run-5/TRANSCRIPT-walk-2-local-edit.md';

/** What the runtime counted for the failing prompt (`task.n_tokens = 7596`, D-161). */
const D161_PROMPT_TOKENS = 7_596;

/**
 * The bundle's size in characters, derived from that count.
 *
 * The walk's prompt measured 7 596 tokens on this runtime, and the material — markdown documents
 * quoted inside a JSON-shaped instruction — runs about 4.5 characters to the token there. So the
 * whole prompt was ~34 000 characters, of which the template is roughly two thousand. Tuned in
 * characters rather than by another calibration call, because the number that settles it is the one
 * the server reports afterwards, and this pre-flight records it.
 */
const BUNDLE_CHARS = 32_000;

/** The four documents of the SpecKit bundle, as the walk's transcript keeps them. */
const DOCUMENT_STAGES = ['constitution', 'requirements', 'solution', 'tasks'] as const;

/** The Describe box's prefill plus what the walk typed into it (`gate-M9.live.ts`). */
const INSTRUCTION =
  'I want to update spec constitution.md, spec.md, plan.md and tasks.md to ' +
  'state plainly that reminder emails are never sent without a human approving them.';

interface Sample {
  label: string;
  constrained: boolean;
  seconds: number;
  /** How many model calls the agent needed. More than one means it resampled (D-94's one retry). */
  calls: number;
  outcome: EditOutcome['kind'];
  files: number;
  issues: string;
  /**
   * Every prompt the runtime reported while this call ran, smallest first.
   *
   * A list rather than a number, because a constrained call turns out to produce **two** entries: the
   * prompt itself, and a second, larger one once the answer is under way. Recording only the last of
   * them would have put a figure in the table that is not the prompt and cannot be compared with
   * D-161's 7 596.
   */
  readTokens: number[];
  truncations: number;
}

/** Records in the Ollama server log, so the prompt size is read from the runtime, not inferred. */
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

/**
 * The document the walk's transcript recorded for one stage.
 *
 * Read from the artifact rather than restated here: these are the bytes the model wrote in the run
 * that failed, and a paraphrase would be a different measurement wearing its name.
 */
function documentFromTranscript(transcript: string, stage: string): string {
  const heading = `### speckit-greenfield-v1-${stage} — the document`;
  const start = transcript.indexOf(heading);
  if (start === -1) throw new Error(`the transcript has no ${stage} document`);

  const fenceStart = transcript.indexOf('```', start);
  const fenceEnd = transcript.indexOf('```', fenceStart + 3);
  if (fenceStart === -1 || fenceEnd === -1) throw new Error(`the ${stage} document is unfenced`);

  return transcript.slice(fenceStart + 3, fenceEnd).trim();
}

/**
 * Extends a document with its own sections until it reaches `size`.
 *
 * The transcript keeps the first 2 500 characters of each document, and 2 500 is not the state that
 * failed: an edit proposal restates what it is given, so a bundle a third of the size is an answer a
 * third as long, and the length of the answer is the thing under test. Sections are repeated with
 * their headings marked so the result reads as a longer document of the same kind rather than as the
 * same document twice — the model is being asked to rewrite markdown, and markdown is what it gets.
 */
function grownTo(document: string, size: number): string {
  const sections = document.split(/\n(?=## )/);
  const body = sections.slice(1);
  if (body.length === 0) return document.repeat(Math.ceil(size / document.length)).slice(0, size);

  let grown = document;

  for (let pass = 2; grown.length < size; pass += 1) {
    for (const section of body) {
      if (grown.length >= size) break;
      grown += `\n${section.replace(/^## (.+)$/m, `## $1 (part ${String(pass)})`)}`;
    }
  }

  return grown;
}

/** The bundle under edit: the walk's four documents, at the walk's size, under the bundle's names. */
function bundleUnderEdit(): EditDocument[] {
  const transcript = readFileSync(WALK_TRANSCRIPT, 'utf8');
  const fileNames = bundleFileNames(methodologyConfig('speckit-greenfield-v1'));
  const perDocument = Math.floor(BUNDLE_CHARS / DOCUMENT_STAGES.length);

  return DOCUMENT_STAGES.map((stage, index) => {
    const fileName = fileNames[index];
    if (fileName === undefined) throw new Error('the SpecKit bundle no longer has four documents');

    return { fileName, content: grownTo(documentFromTranscript(transcript, stage), perDocument) };
  });
}

/**
 * The local chain, exactly as a deployment builds it: one provider, the real failover client.
 *
 * The agent is driven through its own public surface, so what is measured is the call the product
 * makes — including the single resample of D-94, whose firing is visible in `calls`.
 */
function localChain(): LlmAdapter {
  const capacity = capacityFor('ollama', CONTEXT_LENGTH);

  return createFailoverClient({
    providers: [
      {
        id: 'ollama',
        model: MODEL,
        priority: 1,
        capacity,
        stream: createProviderStream('ollama', { baseUrl: BASE_URL }, MODEL, capacity),
      },
    ],
    timeoutMs: 900_000,
  });
}

/**
 * The same chain with the stated shape removed on the way past.
 *
 * This is the unconstrained arm, and it is one line for a reason: the difference between the two
 * halves of this measurement is exactly one field of one call, and nothing else about the agent, the
 * prompt or the chain differs between them.
 */
function withoutConstraint(adapter: LlmAdapter): LlmAdapter {
  return {
    generateStreaming: (options: GenerateOptions) => {
      const { structuredOutput: _dropped, ...rest } = options;

      return adapter.generateStreaming(rest);
    },
  };
}

/** Counts the model calls an outcome cost, so a resample cannot pass for a first-sample success. */
function counting(adapter: LlmAdapter, count: { calls: number }): LlmAdapter {
  return {
    generateStreaming: (options: GenerateOptions) => {
      count.calls += 1;

      return adapter.generateStreaming(options);
    },
  };
}

const documents = bundleUnderEdit();
const samples: Sample[] = [];

async function sample(label: string, constrained: boolean): Promise<Sample> {
  const count = { calls: 0 };
  const chain = localChain();
  const adapter = counting(constrained ? chain : withoutConstraint(chain), count);

  const before = ollamaLog();
  const startedAt = Date.now();
  const outcome = await createEditAgent(adapter).propose({
    documents,
    instruction: INSTRUCTION,
    contentLanguage: 'en',
    runId: `preflight-${label}`,
  });
  const seconds = Math.round((Date.now() - startedAt) / 100) / 10;
  const after = ollamaLog();

  const result: Sample = {
    label,
    constrained,
    seconds,
    calls: count.calls,
    outcome: outcome.kind,
    files: outcome.kind === 'edits' ? outcome.files.length : 0,
    issues: outcome.kind === 'draft-invalid' ? outcome.issues.join('; ') : '',
    readTokens: [...after.promptTokens.slice(before.promptTokens.length)].sort((a, b) => a - b),
    truncations: after.truncations - before.truncations,
  };

  samples.push(result);

  return result;
}

function report(): string {
  const row = (sample: Sample): string =>
    `| ${sample.label} | ${sample.constrained ? '**да**' : 'нет'} | ${String(sample.calls)} | ` +
    `${sample.outcome === 'edits' ? `**edits** (${String(sample.files)} файла)` : '`draft-invalid`'} | ` +
    `${sample.readTokens.join(', ') || '—'} | ${String(sample.truncations)} | ${String(sample.seconds)} | ` +
    `${sample.issues === '' ? '—' : `\`${sample.issues.slice(0, 80)}\``} |`;

  return [
    '# Состояние D-161 под ограниченной генерацией (задача 131, AC-1)',
    '',
    `Модель \`${MODEL}\`, окно ${String(CONTEXT_LENGTH)}, объявленная ёмкость промпта ` +
      `${String(capacityFor('ollama', CONTEXT_LENGTH).promptTokens)} токенов.`,
    `Бандл — четыре документа прогулки M9п р.5 из её же транскрипта, доращённые до ` +
      `${String(documents.reduce((total, document) => total + document.content.length, 0))} символов.`,
    `Инструкция — та, что набрала прогулка. Цель по промпту: ${String(D161_PROMPT_TOKENS)} токенов ` +
      '(`task.n_tokens` из лога сервера в день находки).',
    '',
    '| прогон | ограничение | вызовов модели | исход | промпт(ы) рантайма, ток. | обрезок | секунд | претензии |',
    '|---|---|---|---|---|---|---|---|',
    ...samples.map(row),
    '',
    'Столбец «вызовов модели» — сколько раз агент обратился к модели: **1** значит, что ответ подошёл',
    'с первой выборки, без пересэмпла D-94.',
    '',
    'Столбец промптов — все записи `task.n_tokens` сервера за время вызова. Первая из них и есть',
    'промпт; у ограниченного вызова появляется вторая, большая — продолжение уже начатого ответа.',
  ].join('\n');
}

describe('the whole-bundle Edit proposal on the local model (task 131 AC-1)', () => {
  it('reproduces the bundle the failing walk was editing', () => {
    expect(documents).toHaveLength(4);
    expect(documents.map((document) => document.fileName)).toEqual([
      'constitution.md',
      'spec.md',
      'plan.md',
      'tasks.md',
    ]);

    for (const document of documents) {
      expect(document.content.length).toBeGreaterThan(BUNDLE_CHARS / 5);
    }
  });

  for (let index = 1; index <= SAMPLES; index += 1) {
    it(`returns a usable proposal under constraint (${String(index)} of ${String(SAMPLES)})`, async () => {
      const result = await sample(`constrained-${String(index)}`, true);

      expect(result.truncations).toBe(0);
      // The first sample, not the resample: a grammar that needs two tries is not a grammar.
      expect(result.calls).toBe(1);
      expect(result.outcome).toBe('edits');
      expect(result.files).toBeGreaterThan(0);
    });
  }

  if (process.env.PREFLIGHT_UNCONSTRAINED === '1') {
    for (let index = 1; index <= SAMPLES; index += 1) {
      it(`records what the same call does unconstrained (${String(index)} of ${String(SAMPLES)})`, async () => {
        // No assertion on the outcome: this arm exists to record D-161, and D-161 is a model's
        // behaviour on a given day. What it must not do is silently stop being measured.
        const result = await sample(`unconstrained-${String(index)}`, false);

        expect(result.truncations).toBe(0);
      });
    }
  }

  it('records the measurement', () => {
    const constrained = samples.filter((sample) => sample.constrained);
    const usable = constrained.filter(
      (sample) => sample.outcome === 'edits' && sample.calls === 1,
    ).length;

    mkdirSync(OUT, { recursive: true });
    writeFileSync(`${OUT}/EDIT-CONSTRAINED.md`, report(), 'utf8');

    // Three for three, on first samples — the acceptance criterion, stated as a count.
    expect(usable).toBe(SAMPLES);

    /*
     * The reproduction has to be the state that failed, not a smaller one wearing its name. The
     * runtime's own count is the check, and the **smallest** entry of each call is the prompt: a
     * prompt materially shorter than the walk's would make a shorter answer, and a shorter answer is
     * an easier test.
     */
    const prompts = constrained.map((sample) => sample.readTokens[0] ?? 0);
    expect(Math.min(...prompts)).toBeGreaterThan(D161_PROMPT_TOKENS * 0.8);
  });
});
