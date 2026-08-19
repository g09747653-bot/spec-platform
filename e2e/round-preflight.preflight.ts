/* eslint-disable no-restricted-properties -- a hand-run measurement, not application code: it takes
   its server, its model and its output directory from the environment, because that is how a person
   points it at the machine being measured. */
import { mkdirSync, writeFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { capacityFor, createFailoverClient, type LlmAdapter } from '@/modules/adapters/llm';
import { createProviderStream, DEFAULT_MODELS } from '@/modules/adapters/llm/providers';
import {
  CONCRETE_CHECKS,
  CONCRETE_UNDECIDED,
  checkConcreteRound,
  type ConcreteCheck,
  type ConcreteFinding,
} from '@/modules/agents/interview/concrete-rubric';
import {
  createInterviewAgent,
  parseJsonDocument,
} from '@/modules/agents/interview/interview-agent';

/**
 * **The JSON round, on the gate's candidate model** (gate profile of 2026-08-16; task 129 pre-flight).
 *
 * The speed profile the customer set says the gate's local fallback is «the smallest model that passes
 * the pre-flight measurement», and names the measurement: document structure, a JSON round, and the
 * constrained Edit. The other two live next door — `pack-preflight.preflight.ts` writes a document and
 * checks it against the section schema, `edit-preflight.preflight.ts` runs the constrained proposal.
 * This is the middle one.
 *
 * A question round is the smallest machine-read artifact the product asks for and the one it asks for
 * most often — every stage opens with one — so a model that cannot hold its shape cannot walk a gate
 * at all, whatever else it can do. It goes through the real agent, so what is measured includes the
 * layers that stand between the model and a usable round: the tolerant parse, the deterministic
 * repair, and the single re-draft of Р-1.
 *
 * **The second pass measures the concrete register** (task 144; AC «judged by a scripted rubric over 3
 * live rounds»). It is the same three samples with `style: 'concrete'`, scored by
 * `checkConcreteRound` — so what the table says is not that the round parsed, but whether the model
 * can hold a register while holding a shape, which is the harder of the two and the one the customer
 * complained about. The rubric costs nothing and needs no second model: a round is green when it
 * carries no blocking finding, and the advisories are printed to be read rather than obeyed (§4.7).
 *
 * The score is taken over the **raw** draft rather than the validated set, because the schema drops a
 * hallucinated link and an unknown logo slug in silence (D-221) and a measurement that read the
 * repaired round would report a clean one every time.
 *
 * Not part of any suite and never run in CI — see `vitest.live.config.ts` (NFR-012 AC-5).
 */

const OUT = process.env.PREFLIGHT_OUT ?? 'artifacts/gate-M10/preflight';
const BASE_URL = process.env.OLLAMA_BASE_URL ?? 'http://127.0.0.1:11434/v1';
const CONTEXT_LENGTH = Number(process.env.OLLAMA_CONTEXT_LENGTH ?? '16384');
const SAMPLES = Number(process.env.PREFLIGHT_SAMPLES ?? '3');

/**
 * Which model is being measured (task 146).
 *
 * The measurement was written for the gate's **local** fallback and still defaults to it. It takes a
 * provider now because task 144's rubric turned it into a question about the *register*, and a
 * register is a property of a model as much as of a prompt: «the local 8B cannot hold it» and «the
 * prompt does not ask for it clearly enough» are different findings with different owners, and only
 * running the same three rounds on the deployment's own chain tells them apart. One harness, one
 * rubric, one variable.
 */
const MEASURABLE = ['ollama', 'google', 'anthropic', 'openai'] as const;
type Measurable = (typeof MEASURABLE)[number];

const requested = process.env.PREFLIGHT_PROVIDER ?? 'ollama';
const PROVIDER: Measurable = (MEASURABLE as readonly string[]).includes(requested)
  ? (requested as Measurable)
  : 'ollama';

const MODEL = process.env.PREFLIGHT_MODEL ?? DEFAULT_MODELS[PROVIDER];

const IDEA =
  'A tool that tracks which of a small charity’s grant applications are due, and drafts the reminder emails';

interface Round {
  label: string;
  seconds: number;
  calls: number;
  kind: string;
  questions: number;
  repaired: boolean;
  issues: string;
}

interface ConcreteRound extends Round {
  findings: readonly ConcreteFinding[];
}

/** One sample's bookkeeping: how many calls it took, and the last text the model actually wrote. */
interface Sample {
  calls: number;
  text: string;
}

/**
 * The connection for the provider under measurement.
 *
 * A local runtime is reached by address and needs no credential; a hosted one is reached by key and
 * has none to invent. Refusing loudly here rather than falling back to the local model is the whole
 * point: a measurement that silently changed which model it measured would report the wrong finding
 * with the right confidence.
 */
function connectionFor(provider: Measurable): { apiKey: string } | { baseUrl: string } {
  if (provider === 'ollama') return { baseUrl: BASE_URL };

  const key = process.env[PROVIDER_KEYS[provider]];
  if (key === undefined || key === '') {
    throw new Error(`${PROVIDER_KEYS[provider]} is not set — cannot measure ${provider}`);
  }

  return { apiKey: key };
}

const PROVIDER_KEYS: Record<Exclude<Measurable, 'ollama'>, string> = {
  anthropic: 'ANTHROPIC_API_KEY',
  openai: 'OPENAI_API_KEY',
  google: 'GOOGLE_GENERATIVE_AI_API_KEY',
};

function chainFor(sample: Sample): LlmAdapter {
  const capacity = capacityFor(PROVIDER, CONTEXT_LENGTH);
  const connection = connectionFor(PROVIDER);
  const chain = createFailoverClient({
    providers: [
      {
        id: PROVIDER,
        model: MODEL,
        priority: 1,
        capacity,
        stream: createProviderStream(PROVIDER, connection, MODEL, capacity),
      },
    ],
    timeoutMs: 900_000,
  });

  return {
    generateStreaming: async (options) => {
      sample.calls += 1;
      const result = await chain.generateStreaming(options);

      /*
       * The raw text is kept because the rubric needs the draft the model wrote, not the round the
       * schema allowed through. On a re-draft this holds the second sample, which is the one the
       * returned outcome came from.
       */
      sample.text = result.text;

      return result;
    },
  };
}

const rounds: Round[] = [];
const concrete: ConcreteRound[] = [];

describe('a question round on the candidate local model (gate profile)', () => {
  for (let index = 1; index <= SAMPLES; index += 1) {
    it(`drafts a usable round (${String(index)} of ${String(SAMPLES)})`, async () => {
      const sample: Sample = { calls: 0, text: '' };
      const startedAt = Date.now();

      const outcome = await createInterviewAgent(chainFor(sample)).draftRound({
        stage: 'requirements',
        audience: 'non-technical',
        roundNumber: 1,
        initialPrompt: IDEA,
        summary: null,
        satisfiedNeeds: [],
        unmetNeeds: [],
        contentLanguage: 'en',
        runId: `preflight-round-${String(index)}`,
      });

      const round: Round = {
        label: `round-${String(index)}`,
        seconds: Math.round((Date.now() - startedAt) / 100) / 10,
        calls: sample.calls,
        kind: outcome.kind,
        questions: outcome.kind === 'round' ? outcome.set.questions.length : 0,
        repaired: outcome.kind === 'round' && outcome.repaired,
        issues: outcome.kind === 'draft-invalid' ? outcome.issues.join('; ') : '',
      };

      rounds.push(round);

      expect(round.kind).toBe('round');
      expect(round.questions).toBeGreaterThan(0);
      // The first sample, not the re-draft: a model that needs two tries per round doubles a walk.
      expect(round.calls).toBe(1);
    });
  }
});

describe('the same round in the concrete register (task 144)', () => {
  for (let index = 1; index <= SAMPLES; index += 1) {
    it(`drafts a round in the register it was asked for (${String(index)} of ${String(SAMPLES)})`, async () => {
      const sample: Sample = { calls: 0, text: '' };
      const startedAt = Date.now();

      const outcome = await createInterviewAgent(chainFor(sample)).draftRound({
        /*
         * `solution` and a non-technical profile together, on purpose. The stage is where a question
         * about what to build and how has somewhere to go, and the profile is the claim of §0 under
         * test: the style **displaces** the register rather than composing with it, so a round that
         * comes back hedging every option into a category has falsified that claim rather than the
         * model.
         */
        stage: 'solution',
        audience: 'non-technical',
        style: 'concrete',
        roundNumber: 1,
        initialPrompt: IDEA,
        summary: null,
        satisfiedNeeds: [],
        unmetNeeds: [],
        contentLanguage: 'en',
        runId: `preflight-concrete-${String(index)}`,
      });

      const findings = checkConcreteRound({
        draft: parseJsonDocument(sample.text),
        set: outcome.kind === 'round' ? outcome.set : null,
        language: 'en',
        initialPrompt: IDEA,
      });

      concrete.push({
        label: `concrete-${String(index)}`,
        seconds: Math.round((Date.now() - startedAt) / 100) / 10,
        calls: sample.calls,
        kind: outcome.kind,
        questions: outcome.kind === 'round' ? outcome.set.questions.length : 0,
        repaired: outcome.kind === 'round' && outcome.repaired,
        issues: outcome.kind === 'draft-invalid' ? outcome.issues.join('; ') : '',
        findings,
      });

      expect(outcome.kind).toBe('round');
    });
  }
});

/** `✓`, or what the check found — blocking first, because that is what decides the verdict. */
function verdict(findings: readonly ConcreteFinding[], check: ConcreteCheck): string {
  const mine = findings.filter((finding) => finding.check === check);
  const blocking = mine.filter((finding) => finding.severity === 'blocking').length;
  const advisory = mine.length - blocking;

  if (mine.length === 0) return '✓';

  return [
    ...(blocking > 0 ? [`**${String(blocking)} блок.**`] : []),
    ...(advisory > 0 ? [`${String(advisory)} сов.`] : []),
  ].join(' · ');
}

describe('the record', () => {
  it('writes the measurement', () => {
    mkdirSync(OUT, { recursive: true });
    writeFileSync(
      `${OUT}/ROUND.md`,
      [
        '# JSON-раунд на кандидате гейтовой модели (профиль скорости, 2026-08-16)',
        '',
        `Модель \`${MODEL}\` у провайдера \`${PROVIDER}\`, окно ${String(CONTEXT_LENGTH)}. Через настоящего агента, то есть вместе`,
        'со слоями Р-1: терпимый разбор, детерминированный ремонт, один пересэмпл.',
        '',
        '| прогон | вызовов модели | исход | вопросов | ремонт | секунд | претензии |',
        '|---|---|---|---|---|---|---|',
        ...rounds.map(
          (row) =>
            `| ${row.label} | ${String(row.calls)} | ${row.kind === 'round' ? '**round**' : `\`${row.kind}\``} | ` +
            `${String(row.questions)} | ${row.repaired ? 'да' : 'нет'} | ${String(row.seconds)} | ` +
            `${row.issues === '' ? '—' : `\`${row.issues.slice(0, 80)}\``} |`,
        ),
        '',
        'Столбец «ремонт» — сработал ли детерминированный ремонт набора (лишние рекомендации, размеры',
        'списков). «да» здесь не отказ: черновик был пригоден после ремонта, и ремонт оставляет строку',
        'в логе (задача 131).',
        '',
        '## Режим «Concrete»: те же прогоны под скриптованной рубрикой (задача 144, §4)',
        '',
        'Стадия `solution`, профиль `non-technical`, `style: concrete` — стиль обязан вытеснить регистр',
        'профиля, а не сложиться с ним. Рубрика считается по **сырому** черновику: то, что схема',
        'молча отбрасывает (выдуманная ссылка, чужой слаг), обязано быть названо.',
        '',
        'Зелено = ноль **блокирующих** находок. «сов.» — совещательные: их читают, по ним не блокируют.',
        '',
        `| прогон | вызовов | исход | вопросов | ${CONCRETE_CHECKS.join(' | ')} | секунд |`,
        `|---|---|---|---|${CONCRETE_CHECKS.map(() => '---').join('|')}|---|`,
        ...concrete.map(
          (row) =>
            `| ${row.label} | ${String(row.calls)} | ${row.kind === 'round' ? '**round**' : `\`${row.kind}\``} | ` +
            `${String(row.questions)} | ` +
            `${CONCRETE_CHECKS.map((check) => verdict(row.findings, check)).join(' | ')} | ` +
            `${String(row.seconds)} |`,
        ),
        '',
        '### Находки построчно',
        '',
        ...concrete.flatMap((row) =>
          row.findings.length === 0
            ? [`- **${row.label}** — чисто.`]
            : row.findings.map(
                (finding) =>
                  `- **${row.label}** · \`${finding.id}\` (${finding.severity}) — ${finding.message} ` +
                  `Найдено: «${finding.evidence.slice(0, 120)}».`,
              ),
        ),
        '',
        '### Чего рубрика не решает',
        '',
        'Зелёная таблица выше не означает, что проверено всё: ниже — то, что текстом не решается и',
        'остаётся судейскому проходу гейта 146.',
        '',
        ...CONCRETE_UNDECIDED.map((entry) => `- **${entry.subject}** — ${entry.reason}`),
      ].join('\n'),
      'utf8',
    );

    expect(rounds.filter((round) => round.kind === 'round' && round.calls === 1)).toHaveLength(
      SAMPLES,
    );

    /*
     * The acceptance criterion of task 144, as an assertion: three live rounds in the concrete
     * register, each carrying no blocking finding. The file is written above first, so a failure
     * leaves the evidence behind rather than only a red line.
     */
    expect(
      concrete.filter(
        (round) =>
          round.kind === 'round' &&
          !round.findings.some((finding) => finding.severity === 'blocking'),
      ),
    ).toHaveLength(SAMPLES);
  });
});
