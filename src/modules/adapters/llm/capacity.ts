import type { ModelMessage, PromptTarget, ProviderCapacity, ProviderId } from './types';

/**
 * What a provider will actually accept as a prompt (task 130; амендмент А-8; D-146).
 *
 * This exists because of a defect that took a whole gate round to find. The assembler packed to a
 * fixed 120 000-character budget for every provider, the local one's window is a fraction of that,
 * and Ollama resolved the difference the way every local runtime does: it **truncated the prompt
 * itself**, keeping four tokens of the head and the whole tail. The head is the system instruction
 * and the required-section list; the tail is the web research. So the model was handed the research
 * and no instructions, wrote a summary of the research, and the structural check — correctly —
 * rejected it. Three retries reproduced it exactly, because truncation is deterministic.
 *
 * The rule that follows is the one this file exists to make expressible: **never rely on a provider
 * to make the prompt fit.** A provider states what it can read; the assembler packs to that; a prompt
 * larger than the declared capacity is our defect and is never sent (see `failover-client.ts`).
 *
 * Measured again in round 4 against the gate's own server, and the shape of the failure is worse
 * than "the overflow is lost": a prompt of 11 972 tokens is read whole, and one of 20 000 comes back
 * reporting **8 194 tokens read** — half the window, not the window. Overrunning the window costs
 * two thirds of the prompt, not the excess. That asymmetry is why every number below is conservative
 * and why the safety margin is not decoration.
 *
 * Capacity is stated in **tokens**, because that is the unit every provider's window is expressed in.
 * The conversion from characters is `estimateTokens`, which lives here — at the vendor edge — rather
 * than in the assembler, so no business logic acquires an opinion about tokenisation (constitution
 * P7). It is deliberately an over-estimate: see its note.
 */
/**
 * `ProviderCapacity` itself is declared in `types.ts`, with the rest of the interface every layer
 * above compiles against. What lives here is how the numbers are arrived at, and the estimate that
 * converts a character count into them — the two parts that are genuinely about vendors.
 *
 * For a hosted model the generation reserve is bookkeeping: the provider sizes its own reply. For a
 * local one it is load-bearing — prompt and answer share a single window, so the reserve is what the
 * adapter states as `num_predict`, and it is what makes the input allowance a known number rather
 * than an assumption (А-8, point 3).
 */

/**
 * Characters per token, by script, chosen to **over**-estimate.
 *
 * Measured on this machine against `qwen3:14b` rather than assumed: 20 000 characters of English
 * prose tokenise to 2 866 tokens (7.0 chars/token), and a full generation context — markdown, JSON
 * fragments, URLs and fetched web pages — to about 5 chars/token, which is the number that matters
 * because it is the material this actually packs. Cyrillic runs far finer through the same
 * tokeniser, so it is counted separately rather than averaged away: a Russian session (У-1 writes
 * documents in the language of the seed prompt) would otherwise be measured with an English ruler
 * and overflow the window.
 *
 * The values below are roughly two-thirds of the measured ratios in each script. An over-estimate
 * costs unused window; an under-estimate costs a truncated prompt, which is the defect this whole
 * file exists to prevent. The asymmetry is the reason the numbers are not the measured ones.
 */
const ASCII_CHARS_PER_TOKEN = 3.4;
const WIDE_CHARS_PER_TOKEN = 1.6;

/**
 * What a chat turn costs beyond its text: role framing and the model's chat template.
 *
 * A handful of tokens per message in every template anyone ships. Counted so that a prompt split
 * into two messages is not silently cheaper than the same bytes in one.
 */
const PER_MESSAGE_TOKENS = 8;

/** Everything outside the Basic Latin block, which every tokeniser in the chain splits far finer. */
const WIDE = /[^\p{ASCII}]/gu;

/**
 * An upper bound on how many tokens a string will occupy.
 *
 * Not a tokeniser. Importing one would mean importing a vendor's — and then owning the question of
 * which vendor's is right for a chain of four, which is precisely the dependency P7 forbids business
 * logic from acquiring. What the packer needs is not the exact number but a bound it can trust in
 * one direction, and a bound is cheap, deterministic and vendor-neutral.
 */
export function estimateTokens(text: string): number {
  const wide = text.match(WIDE)?.length ?? 0;
  const ascii = text.length - wide;

  return Math.ceil(ascii / ASCII_CHARS_PER_TOKEN) + Math.ceil(wide / WIDE_CHARS_PER_TOKEN);
}

/** The same bound for a whole request, including what the chat template adds around each turn. */
export function estimatePromptTokens(messages: readonly ModelMessage[]): number {
  return messages.reduce(
    (total, message) => total + estimateTokens(message.content) + PER_MESSAGE_TOKENS,
    0,
  );
}

/**
 * How many characters of body a token allowance is worth, at the least generous script.
 *
 * The packer works in characters — that is the unit the assembler's sections are measured in — so it
 * needs the conversion in this direction too. It uses the *wide* ratio, so the character budget it
 * derives is safe even for a context that turns out to be entirely Cyrillic. Overshoot is corrected
 * by re-packing against the real estimate; undershoot would not be corrected by anything.
 */
export function charsForTokens(tokens: number): number {
  return Math.max(Math.floor(tokens * WIDE_CHARS_PER_TOKEN), 0);
}

/**
 * The window a hosted provider offers, in tokens.
 *
 * Every one of these is an order of magnitude above `DEFAULT_CONTEXT_BUDGET` (120 000 characters,
 * at most ~75 000 tokens by the bound above), and that is the point rather than a coincidence: the
 * packer is a no-op whenever the assembled context already fits, so a hosted call produces the
 * **same prompt byte for byte** as it did before А-8. Degradation happens only where physics demands
 * it, which is the local window, and nowhere else (А-8, point 4).
 */
const HOSTED_CONTEXT_TOKENS: Readonly<Record<Exclude<ProviderId, 'ollama'>, number>> =
  Object.freeze({
    anthropic: 200_000,
    openai: 400_000,
    google: 1_000_000,
    /** The double answers from the prompt and has no window; it must never be the reason to pack. */
    stub: 1_000_000,
  });

/** What a hosted provider is asked to leave room for. Bookkeeping — it is never sent (see below). */
const HOSTED_GENERATION_RESERVE_TOKENS = 8_192;

/**
 * What the local model is given for its answer, and therefore what the prompt may not use.
 *
 * Sized from measurement, not from the document: `qwen3:14b` is a reasoning model, so the reserve
 * has to cover the thinking *and* the document. A conformant SpecKit constitution took 32.4 s
 * end to end (D-144), which is well under two thousand tokens of both together on this machine. Four
 * thousand leaves the same margin again — and a reserve that is too small does not fail loudly, it
 * returns a document that stops mid-sentence and is rejected on structure, which reads exactly like
 * the defect this file removes.
 */
export const LOCAL_GENERATION_RESERVE_TOKENS = 4_096;

/**
 * How much of the remaining window the prompt may claim.
 *
 * Not all of it. The estimate above is a bound rather than a count, the chat template adds tokens
 * neither we nor the caller can see, and a runtime is free to reserve a slot or two of its own. Ten
 * per cent of a 16 384-token window is roughly 1 200 tokens of headroom — cheap insurance against a
 * class of failure whose symptom is a document written from an instruction that was thrown away.
 */
const LOCAL_SAFETY_FRACTION = 0.9;

/**
 * The local provider's capacity, derived from the window its server was started with.
 *
 * `OLLAMA_CONTEXT_LENGTH` is Ollama's own variable, read here by the same name deliberately: it is
 * one number describing one machine, and the alternative — our own variable meaning the same thing —
 * is two numbers that can disagree, with prompt truncation as the symptom of the disagreement. The
 * default is Ollama's own default (4 096) rather than the gate's 16 384, so a machine that has not
 * set it is *under*-declared and over-packs, which is the harmless direction.
 */
export function localCapacity(contextLength: number): ProviderCapacity {
  const generationReserveTokens = Math.min(
    LOCAL_GENERATION_RESERVE_TOKENS,
    Math.floor(contextLength / 2),
  );

  return {
    promptTokens: Math.max(
      Math.floor((contextLength - generationReserveTokens) * LOCAL_SAFETY_FRACTION),
      0,
    ),
    generationReserveTokens,
    windowTokens: contextLength,
  };
}

/**
 * What the answer may actually use: the window, less the prompt that is about to fill part of it.
 *
 * The reserve is a *floor*, not a ceiling, and conflating the two cost the round-4 walk its Edit
 * step. An edit proposal restates whole documents as JSON — five, six thousand tokens of answer —
 * and a flat 4 096 stopped it mid-object while 6 900 tokens of window sat unused. The prompt is
 * measured with the same over-estimating bound the packer uses, so what this hands the provider is
 * conservative in the only direction that matters: it can never let prompt and answer together
 * overrun the window, which is the failure that starts the runtime's own truncation.
 */
export function generationAllowance(
  capacity: ProviderCapacity,
  messages: readonly ModelMessage[],
): number | null {
  const { windowTokens } = capacity;
  if (windowTokens === undefined) return null;

  const remaining = windowTokens - estimatePromptTokens(messages) - LOCAL_ANSWER_MARGIN_TOKENS;

  return Math.max(remaining, Math.min(capacity.generationReserveTokens, windowTokens));
}

/** Slack between the packed prompt and the answer, for what neither of us can count exactly. */
const LOCAL_ANSWER_MARGIN_TOKENS = 128;

export function capacityFor(provider: ProviderId, ollamaContextLength: number): ProviderCapacity {
  if (provider === 'ollama') return localCapacity(ollamaContextLength);

  return {
    promptTokens: HOSTED_CONTEXT_TOKENS[provider],
    generationReserveTokens: HOSTED_GENERATION_RESERVE_TOKENS,
  };
}

/**
 * The target that packs nothing — the double's window.
 *
 * What a test means by "the prompt" is the prompt the caller intended, not the one a small provider
 * would have got, so this is what the deterministic double and every assertion about prompt text
 * resolve against.
 */
export const UNPACKED_TARGET: PromptTarget = Object.freeze({
  provider: 'stub',
  capacity: Object.freeze({
    promptTokens: HOSTED_CONTEXT_TOKENS.stub,
    generationReserveTokens: HOSTED_GENERATION_RESERVE_TOKENS,
  }),
});

/**
 * Raised when a prompt that was packed for a provider still does not fit it.
 *
 * This is an **assembler** error and it is deliberately not a provider failure: a caller that asked
 * to be packed to a capacity and overshot it has a defect, and failing over would hide it behind a
 * slower answer from somewhere else. Provider-side truncation is a defect by definition (D-146), and
 * so is ours.
 */
export class PromptOverCapacityError extends Error {
  readonly provider: ProviderId;
  readonly estimatedTokens: number;
  readonly capacityTokens: number;

  constructor(provider: ProviderId, estimatedTokens: number, capacityTokens: number) {
    super(
      `The prompt packed for provider "${provider}" is about ${String(estimatedTokens)} tokens, ` +
        `which is past its declared capacity of ${String(capacityTokens)}. It was not sent: a ` +
        'provider asked to read more than it can read truncates silently, and the document it then ' +
        'writes is not the document that was requested.',
    );
    this.name = 'PromptOverCapacityError';
    this.provider = provider;
    this.estimatedTokens = estimatedTokens;
    this.capacityTokens = capacityTokens;
  }
}
