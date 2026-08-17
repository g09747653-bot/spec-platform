/* eslint-disable no-restricted-properties -- a hand-run measurement, not application code: it takes
   its server, its model and its output directory from the environment, because that is how a person
   points it at the machine being measured. */
import { mkdirSync, writeFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { capacityFor, createFailoverClient, type LlmAdapter } from '@/modules/adapters/llm';
import { createProviderStream, DEFAULT_MODELS } from '@/modules/adapters/llm/providers';
import { createInterviewAgent } from '@/modules/agents/interview/interview-agent';

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
 * Not part of any suite and never run in CI — see `vitest.live.config.ts`.
 */

const OUT = process.env.PREFLIGHT_OUT ?? 'artifacts/gate-M10/preflight';
const BASE_URL = process.env.OLLAMA_BASE_URL ?? 'http://127.0.0.1:11434/v1';
const CONTEXT_LENGTH = Number(process.env.OLLAMA_CONTEXT_LENGTH ?? '16384');
const MODEL = process.env.PREFLIGHT_MODEL ?? DEFAULT_MODELS.ollama;
const SAMPLES = Number(process.env.PREFLIGHT_SAMPLES ?? '3');

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

function localChain(count: { calls: number }): LlmAdapter {
  const capacity = capacityFor('ollama', CONTEXT_LENGTH);
  const chain = createFailoverClient({
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

  return {
    generateStreaming: (options) => {
      count.calls += 1;

      return chain.generateStreaming(options);
    },
  };
}

const rounds: Round[] = [];

describe('a question round on the candidate local model (gate profile)', () => {
  for (let index = 1; index <= SAMPLES; index += 1) {
    it(`drafts a usable round (${String(index)} of ${String(SAMPLES)})`, async () => {
      const count = { calls: 0 };
      const startedAt = Date.now();

      const outcome = await createInterviewAgent(localChain(count)).draftRound({
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
        calls: count.calls,
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

  it('records the measurement', () => {
    mkdirSync(OUT, { recursive: true });
    writeFileSync(
      `${OUT}/ROUND.md`,
      [
        '# JSON-раунд на кандидате гейтовой модели (профиль скорости, 2026-08-16)',
        '',
        `Модель \`${MODEL}\`, окно ${String(CONTEXT_LENGTH)}. Через настоящего агента, то есть вместе`,
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
      ].join('\n'),
      'utf8',
    );

    expect(rounds.filter((round) => round.kind === 'round' && round.calls === 1)).toHaveLength(
      SAMPLES,
    );
  });
});
