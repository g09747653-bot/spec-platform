import { z } from 'zod';

import type { LlmAdapter } from '@/modules/adapters/llm';
import { assemblePrompt } from '@/modules/prompts';

import { parseJsonDocument } from '../interview/interview-agent';

import { isHedged, leadingActionVerb, matchDeterministic, readsAsQuestion } from './deterministic';
import {
  CHAT_RESOLVABLE,
  DECISION_ACTIONS,
  isChatResolvable,
  offersAction,
  requiresEditPrompt,
  type DecisionAction,
  type PendingKind,
} from './pending-actions';

/**
 * `resolveDecisionIntent` (task 61; FR-009 AC-6/AC-7; FR-010 AC-4; constitution P2; D-4).
 *
 * Turns a typed message into a decision the user demonstrably made — or into `null`, which leaves
 * the card exactly as it was.
 *
 * **The failure mode this module is built around is not "fails to resolve".** It is "resolves to
 * something the user did not say", because that silently spends the human approval gate P2 exists to
 * protect, and leaves nothing behind to notice: the spec is approved, the stage moves, and the audit
 * trail is indistinguishable from a deliberate click. Every threshold, guard and default below is
 * set on that asymmetry. Abstaining is always safe; resolving is not.
 *
 * The order is the contract's:
 *
 * 1. **Abstain outright** if the message reads as a question or hedges. This runs *before* both
 *    other layers, so an under-decided message never reaches a classifier that might tidy it up.
 * 2. **Deterministic phrase match**, whole-message, no model call (AC-1).
 * 3. **Constrained model classification**, offered actions only, above a confidence floor, and with
 *    the user's own words required for any action that needs them.
 *
 * At every exit the answer is filtered through `offersAction`, so AC-3 — "cannot select an action
 * the pending card does not offer" — holds on the deterministic path, the model path, and any path
 * added later, rather than being a property of each branch's care.
 */

/** Below this, the model's own answer is treated as no answer. */
export const CONFIDENCE_FLOOR = 0.8;

export const DecisionIntent = z.object({
  kind: z.enum(['spec', 'review', 'diff']),
  action: z.enum(DECISION_ACTIONS),
  /** The user's words, for an action that cannot be dispatched without them. */
  editPrompt: z.string().min(1).optional(),
  confidence: z.number().min(0).max(1),
});

export type DecisionIntentValue = z.infer<typeof DecisionIntent>;

/** What the model is allowed to answer: an action from the offered set, or an explicit abstention. */
const ModelVerdict = z.object({
  action: z.union([z.enum(DECISION_ACTIONS), z.null()]),
  editPrompt: z.string().nullish(),
  confidence: z.number().min(0).max(1),
});

export interface ResolveOptions {
  message: string;
  pending: PendingKind;
  /** Absent means "no model layer": the deterministic layer answers or the resolver abstains. */
  adapter?: LlmAdapter;
  runId?: string;
  signal?: AbortSignal;
}

/** Why the resolver answered as it did. Recorded, never shown — a resolution the user must trust. */
export type ResolutionReason =
  | 'deterministic'
  | 'model'
  | 'question'
  | 'hedged'
  | 'empty'
  | 'no-match'
  | 'not-offered'
  | 'low-confidence'
  | 'missing-edit-prompt'
  | 'model-unavailable'
  | 'model-abstained'
  | 'draft-invalid';

export interface Resolution {
  intent: DecisionIntentValue | null;
  reason: ResolutionReason;
}

const abstain = (reason: ResolutionReason): Resolution => ({ intent: null, reason });

/**
 * The single exit through which every resolved intent passes.
 *
 * AC-3 lives here rather than at each call site: an action the card does not render is refused no
 * matter which layer proposed it, and so is one that needs the user's words and has none.
 */
function admit(
  kind: PendingKind,
  action: DecisionAction,
  confidence: number,
  editPrompt: string | undefined,
  reason: 'deterministic' | 'model',
): Resolution {
  if (!offersAction(kind, action) || !isChatResolvable(kind, action)) {
    return abstain('not-offered');
  }

  if (requiresEditPrompt(kind, action) && (editPrompt === undefined || editPrompt.trim() === '')) {
    return abstain('missing-edit-prompt');
  }

  return {
    intent: {
      kind,
      action,
      confidence,
      ...(editPrompt === undefined || editPrompt.trim() === ''
        ? {}
        : { editPrompt: editPrompt.trim() }),
    },
    reason,
  };
}

export async function resolveDecisionIntent(options: ResolveOptions): Promise<Resolution> {
  const { message, pending } = options;

  if (message.trim() === '') return abstain('empty');

  /*
   * Both guards run before either matcher. A question mentioning an action ("should I approve
   * this?") and a hedged near-decision ("I might approve it later") are the two shapes that most
   * resemble a decision without being one, and neither should reach a classifier at all — a model
   * asked to classify "maybe approve" will find `approve` in it, because it is there.
   */
  if (readsAsQuestion(message)) return abstain('question');
  if (isHedged(message)) return abstain('hedged');

  const deterministic = matchDeterministic(message, pending);

  // Confidence 1: this is not an estimate, it is a curated phrase matched whole (AC-1).
  if (deterministic.kind === 'match') {
    return admit(pending, deterministic.action, 1, undefined, 'deterministic');
  }

  /*
   * A clear message naming an action this card does not offer ends here, without a model call. The
   * user said something unambiguous; the honest answer is that this card cannot do it, not a nearby
   * action a classifier found more plausible.
   */
  if (deterministic.kind === 'not-offered') return abstain('not-offered');

  /*
   * The gate in front of the model, and the reason the corpus in the tests can *require* `null`
   * rather than hope for it: a message only reaches a classifier if it opens by naming an action
   * this card offers. Commentary ("the approve button is greyed out"), sarcasm ("brilliant, just
   * approve everything") and near-decisions ("I was going to approve this") all mention the word in
   * some other position, and none of them are ever put to a model at all.
   *
   * Without this, the guarantee would rest on the model behaving — and the whole point of the layer
   * ordering is that it does not have to.
   */
  if (leadingActionVerb(message, pending) === null) return abstain('no-match');

  if (options.adapter === undefined) return abstain('model-unavailable');

  const offered = CHAT_RESOLVABLE[pending];
  if (offered.length === 0) return abstain('not-offered');

  const prompt = assemblePrompt('decision.intent.v1', {
    message,
    pendingKind: pending,
    offeredActions: offered.join(', '),
  });

  let text: string;
  try {
    const result = await options.adapter.generateStreaming({
      messages: [
        { role: 'system', content: prompt.system },
        { role: 'user', content: prompt.user },
      ],
      runId: options.runId ?? 'decision-intent',
      signal: options.signal,
    });
    text = result.text;
  } catch {
    // A provider outage must not become a decision, in either direction (P5, and the asymmetry above).
    return abstain('model-unavailable');
  }

  const draft = parseJsonDocument(text);
  if (draft === null) return abstain('draft-invalid');

  const verdict = ModelVerdict.safeParse(draft);
  if (!verdict.success) return abstain('draft-invalid');

  if (verdict.data.action === null) return abstain('model-abstained');
  if (verdict.data.confidence < CONFIDENCE_FLOOR) return abstain('low-confidence');

  return admit(
    pending,
    verdict.data.action,
    verdict.data.confidence,
    verdict.data.editPrompt ?? undefined,
    'model',
  );
}
