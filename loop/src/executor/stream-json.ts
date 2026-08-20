import { z } from 'zod';

/**
 * Reading the executor's own `stream-json` output for what a cycle cost (task 155; А-23 §4).
 *
 * The customer's loop runs on a subscription, and a subscription is not billed in dollars — it is
 * billed in turns against a rolling window. So the number that matters to the operator is not a
 * price, it is «how much of the five-hour window did this cycle spend, and is the window still
 * open». The CLI already says both, in two events of the stream the wrapper is streaming anyway:
 *
 * - **`rate_limit_event`** carries the plan's own budget signal — `status`, which window
 *   (`five_hour`), and when it resets. This is the line M16а's throttling has to react to: a
 *   `rejected` status is a pipeline that should slow down, not a pipeline that failed.
 * - **`result`** closes the run with `num_turns`, token usage, and the CLI's client-side cost
 *   estimate (which is an estimate of API pricing, and is therefore *not* what a subscription run
 *   costs — it is recorded as-is and never presented as a bill).
 *
 * Parsing is total and forgiving on purpose: this is observability over a stream the loop does not
 * own, and a line that fails to parse must cost a missing number, never an iteration.
 */

const RateLimit = z.object({
  status: z.string().optional(),
  rateLimitType: z.string().optional(),
  resetsAt: z.number().optional(),
});

const RateLimitEvent = z.object({
  type: z.literal('rate_limit_event'),
  rate_limit_info: RateLimit,
});

const ResultEvent = z.object({
  type: z.literal('result'),
  num_turns: z.number().optional(),
  total_cost_usd: z.number().optional(),
  is_error: z.boolean().optional(),
  usage: z
    .object({
      input_tokens: z.number().optional(),
      output_tokens: z.number().optional(),
      cache_read_input_tokens: z.number().optional(),
      cache_creation_input_tokens: z.number().optional(),
    })
    .optional(),
});

export interface ExecutorUsage {
  /** Turns the CLI reported for the whole run — the subscription's own unit of spend. */
  turns?: number;
  inputTokens?: number;
  outputTokens?: number;
  /** Cache reads are the cheap half of a long session; kept apart so the ratio stays visible. */
  cachedInputTokens?: number;
  /** The CLI's client-side estimate at API prices. Not a subscription bill. */
  costUsd?: number;
  /** The last rate-limit status the run saw, e.g. `allowed` / `rejected`. */
  rateLimitStatus?: string;
  /** Which window the status is about, e.g. `five_hour`. */
  rateLimitWindow?: string;
  /** When that window resets, as the CLI reported it (epoch seconds). */
  rateLimitResetsAt?: number;
}

/** One line of the stream, folded into the running total. Unknown or unparsable lines are ignored. */
export function foldStreamLine(usage: ExecutorUsage, line: string): ExecutorUsage {
  const trimmed = line.trim();
  if (!trimmed.startsWith('{')) return usage;

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return usage;
  }

  const limit = RateLimitEvent.safeParse(parsed);
  if (limit.success) {
    const info = limit.data.rate_limit_info;
    return {
      ...usage,
      ...(info.status === undefined ? {} : { rateLimitStatus: info.status }),
      ...(info.rateLimitType === undefined ? {} : { rateLimitWindow: info.rateLimitType }),
      ...(info.resetsAt === undefined ? {} : { rateLimitResetsAt: info.resetsAt }),
    };
  }

  const result = ResultEvent.safeParse(parsed);
  if (result.success) {
    const { num_turns, total_cost_usd, usage: reported } = result.data;
    return {
      ...usage,
      ...(num_turns === undefined ? {} : { turns: num_turns }),
      ...(total_cost_usd === undefined ? {} : { costUsd: total_cost_usd }),
      ...(reported?.input_tokens === undefined ? {} : { inputTokens: reported.input_tokens }),
      ...(reported?.output_tokens === undefined ? {} : { outputTokens: reported.output_tokens }),
      ...(reported?.cache_read_input_tokens === undefined
        ? {}
        : { cachedInputTokens: reported.cache_read_input_tokens }),
    };
  }

  return usage;
}

/** The one line the operator reads in the feed. Absent numbers are simply not claimed. */
export function describeUsage(usage: ExecutorUsage): string | null {
  const parts: string[] = [];

  if (usage.turns !== undefined) parts.push(`ходов ${String(usage.turns)}`);
  if (usage.outputTokens !== undefined) {
    parts.push(
      `токенов ${String(usage.inputTokens ?? 0)}→${String(usage.outputTokens)}` +
        (usage.cachedInputTokens === undefined
          ? ''
          : ` (из кэша ${String(usage.cachedInputTokens)})`),
    );
  }
  if (usage.rateLimitStatus !== undefined) {
    parts.push(
      `лимит тарифа: ${usage.rateLimitStatus}` +
        (usage.rateLimitWindow === undefined ? '' : ` (${usage.rateLimitWindow})`),
    );
  }

  return parts.length === 0 ? null : `Цена итерации — ${parts.join(', ')}.`;
}
