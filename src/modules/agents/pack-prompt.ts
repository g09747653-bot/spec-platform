import {
  charsForTokens,
  estimatePromptTokens,
  estimateTokens,
  PromptOverCapacityError,
  type ModelMessage,
  type PromptTarget,
} from '@/modules/adapters/llm';

import {
  assembleContext,
  DEFAULT_CONTEXT_BUDGET,
  type ContextSources,
  type PackingEntry,
} from './context-assembler';

/**
 * Packing a prompt to the window of the provider that is about to read it (task 130; амендмент А-8).
 *
 * The assembler budgets the *context*; a provider's window has to hold the whole *prompt*. Between
 * the two sits everything the caller wraps the context in — the system instruction, the vendored
 * methodology template, the required-section list, the user's own sentence describing the product.
 * А-8 calls that block inviolable, and this function is what makes the word mean something: it is
 * built once, measured, and the context is packed into what is left over. It is never shortened,
 * never reordered, and never rebuilt differently for a smaller provider. A prompt that cannot hold
 * it is refused rather than degraded, because a methodology's template with its middle removed
 * describes a document nobody asked for.
 *
 * **The hosted path is untouched by construction.** The context budget is the smaller of the default
 * 120 000 characters and what the capacity allows; every hosted window is far larger than the first,
 * so the minimum is the default, the assembler receives exactly the budget it received before А-8,
 * and the bytes are identical. Degradation happens where physics demands it and nowhere else.
 */
export interface PromptShape {
  system: string;
  user: string;
}

export interface PackPromptInput {
  /**
   * Builds the prompt around an assembled context.
   *
   * Everything this returns that is *not* the context is the inviolable block. Passing the empty
   * string is how its size is discovered, so the function must tolerate a context that is not there
   * — every prompt asset already does, because a first-stage generation has no context to speak of.
   */
  build: (context: string) => PromptShape;
  sources: ContextSources;
  target: PromptTarget;
  /** What is being generated, for the packing record. Not sent to any model. */
  label: string;
}

export interface PackingRecord {
  provider: string;
  label: string;
  capacityTokens: number;
  /** The instruction, template and section list — what the context had to fit around. */
  fixedTokens: number;
  estimatedTokens: number;
  contextBudgetChars: number;
  /** How many times the budget had to be reduced before the estimate fitted. */
  rounds: number;
  sections: readonly PackingEntry[];
}

export interface PackedPrompt {
  messages: readonly ModelMessage[];
  record: PackingRecord;
}

/**
 * How many times the budget may be adjusted before this is treated as not converging.
 *
 * A handful, because each round moves by a *measured* amount rather than by a fixed step: two or
 * three settle it. The count exists so that a pathological case ends as an error rather than as a
 * loop inside a request.
 */
const MAX_ROUNDS = 6;

/** Characters shaved off beyond the measured overshoot, so a round converges rather than grazes. */
const OVERSHOOT_SLACK_CHARS = 256;

/** Of the slack a round leaves unused, how much the next one dares to claim. */
const GROWTH_SAFETY = 0.9;

/** Below this much unused window, growing again is not worth another assembly. */
const GROWTH_MIN_TOKENS = 256;

function messagesOf(prompt: PromptShape): readonly ModelMessage[] {
  return [
    { role: 'system', content: prompt.system },
    { role: 'user', content: prompt.user },
  ];
}

/**
 * Fits the context to the window by measuring, twice if necessary, in whichever direction is needed.
 *
 * The first budget is deliberately **pessimistic**: characters are converted to tokens at the finest
 * ratio any script in the chain produces, because the one error that must never happen is starting
 * too big — an over-run does not cost the excess, it collapses the prompt to half the window and
 * takes the instruction with it (D-146; measured again in round 4).
 *
 * But a pessimistic budget spent as-is would leave most of a local window empty on ordinary English
 * prose, which is quality thrown away for nothing. So the loop measures what the material actually
 * cost and re-derives the budget from *that* ratio — the estimator's own reading of this text rather
 * than its worst case — and verifies the result again. Growing is always followed by a check, and a
 * round that lands over shrinks by the measured overshoot, so the invariant «never past capacity»
 * holds by construction rather than by arithmetic being right the first time.
 */
export function packPrompt(input: PackPromptInput): PackedPrompt {
  const { capacity, provider } = input.target;

  const fixed = messagesOf(input.build(''));
  const fixedTokens = estimatePromptTokens(fixed);
  const allowance = capacity.promptTokens - fixedTokens;

  if (allowance <= 0) {
    /*
     * The instruction and the template alone are past the window. There is nothing here to trade
     * away — this is a provider that cannot write this document, and saying so is the honest answer.
     * It reads as a configuration error far more often than as a real one: `OLLAMA_CONTEXT_LENGTH`
     * left at its 4 096 default while the server runs with more is exactly this shape.
     */
    throw new PromptOverCapacityError(provider, fixedTokens, capacity.promptTokens);
  }

  const ceiling = DEFAULT_CONTEXT_BUDGET.totalChars;
  let budgetChars = Math.min(ceiling, charsForTokens(allowance));
  let best: PackedPrompt | null = null;
  let bestBudget = -1;

  for (let round = 1; round <= MAX_ROUNDS; round += 1) {
    const context = assembleContext(input.sources, { totalChars: budgetChars });
    const messages = messagesOf(input.build(context.text));
    const estimatedTokens = estimatePromptTokens(messages);

    if (estimatedTokens > capacity.promptTokens) {
      if (budgetChars === 0) {
        throw new PromptOverCapacityError(provider, estimatedTokens, capacity.promptTokens);
      }

      budgetChars = Math.max(
        budgetChars -
          charsForTokens(estimatedTokens - capacity.promptTokens) -
          OVERSHOOT_SLACK_CHARS,
        0,
      );
      continue;
    }

    if (budgetChars > bestBudget) {
      bestBudget = budgetChars;
      best = {
        messages,
        record: {
          provider,
          label: input.label,
          capacityTokens: capacity.promptTokens,
          fixedTokens,
          estimatedTokens,
          contextBudgetChars: budgetChars,
          rounds: round,
          sections: context.packing,
        },
      };
    }

    // Nothing was left out, or the assembler's own ceiling is reached: there is nothing to grow into.
    if (budgetChars >= ceiling || context.truncated.length === 0) break;

    const slack = capacity.promptTokens - estimatedTokens;
    if (slack < GROWTH_MIN_TOKENS) break;

    const contextTokens = Math.max(estimateTokens(context.text), 1);
    const observedCharsPerToken = context.text.length / contextTokens;
    const grown = Math.min(
      ceiling,
      Math.floor(budgetChars + slack * observedCharsPerToken * GROWTH_SAFETY),
    );

    if (grown <= budgetChars) break;
    budgetChars = grown;
  }

  if (best === null) {
    throw new PromptOverCapacityError(provider, capacity.promptTokens + 1, capacity.promptTokens);
  }

  return best;
}

/**
 * The packing record as one log line (А-8, point 4).
 *
 * Server-side observability, and the gate reads it: "what went in and what fell out" is not a
 * detail here, it is the difference between a walk that packed cleanly and one that quietly
 * generated four documents without the web research anybody thought they had. Nothing user-facing
 * and nothing vendor-shaped — a provider id, sizes, and one word per section.
 */
export function describePacking(record: PackingRecord): string {
  const sections = record.sections
    .map((entry) =>
      entry.dropped
        ? `${entry.section}=dropped(-${String(entry.omittedChars)})`
        : entry.omittedChars > 0
          ? `${entry.section}=${String(entry.keptChars)}(-${String(entry.omittedChars)})`
          : `${entry.section}=whole`,
    )
    .join(' ');

  return (
    `context packing ${record.label} provider=${record.provider} ` +
    `tokens=${String(record.estimatedTokens)}/${String(record.capacityTokens)} ` +
    `fixed=${String(record.fixedTokens)} budget=${String(record.contextBudgetChars)}ch ` +
    `rounds=${String(record.rounds)} ${sections}`
  );
}
