import { describe, expect, it } from 'vitest';

import { describeUsage, foldStreamLine, type ExecutorUsage } from './stream-json.ts';

/**
 * What a cycle cost, read out of the executor's own stream (task 155; А-23 §4).
 *
 * The lines below are **verbatim** shapes taken from a real `--output-format stream-json` run of the
 * pinned CLI inside the executor image — not invented ones. That is the point of the fixture: this
 * module reads a stream the loop does not own, so the test's value is in it being a recording.
 */

const RATE_LIMIT =
  '{"type":"rate_limit_event","rate_limit_info":{"status":"allowed","resetsAt":1787231400,' +
  '"rateLimitType":"five_hour","overageStatus":"rejected","isUsingOverage":false},' +
  '"uuid":"e69da766","session_id":"4504e1e4"}';

const RESULT =
  '{"type":"result","subtype":"success","is_error":false,"duration_ms":2573,"num_turns":3,' +
  '"result":"готово","session_id":"4504e1e4","total_cost_usd":0.0594212,' +
  '"usage":{"input_tokens":2,"cache_creation_input_tokens":8496,"cache_read_input_tokens":120,' +
  '"output_tokens":9,"service_tier":"standard"}}';

const fold = (lines: string[]): ExecutorUsage =>
  lines.reduce<ExecutorUsage>((usage, line) => foldStreamLine(usage, line), {});

describe('reading the price of an iteration out of the stream', () => {
  it('takes turns, tokens and the cost estimate from the closing result', () => {
    expect(fold([RESULT])).toMatchObject({
      turns: 3,
      inputTokens: 2,
      outputTokens: 9,
      cachedInputTokens: 120,
      costUsd: 0.0594212,
    });
  });

  it('takes the plan’s own budget signal from the rate-limit event', () => {
    expect(fold([RATE_LIMIT])).toMatchObject({
      rateLimitStatus: 'allowed',
      rateLimitWindow: 'five_hour',
      rateLimitResetsAt: 1787231400,
    });
  });

  it('keeps the latest rate-limit status when the run saw several', () => {
    const throttled = RATE_LIMIT.replace('"status":"allowed"', '"status":"rejected"');

    expect(fold([RATE_LIMIT, throttled]).rateLimitStatus).toBe('rejected');
  });

  it('ignores everything else in the stream, including prose and half-written JSON', () => {
    expect(fold(['сборка началась', '{"type":"assistant","message":{}}', '{"broken', ''])).toEqual(
      {},
    );
  });

  it('costs a missing number, never an iteration, when the shape is unfamiliar', () => {
    // A future CLI that renames a field must not throw here — the run is what matters.
    expect(fold(['{"type":"result","num_turns":"three"}'])).toEqual({});
  });

  it('says the price in one line, in the units a subscription is actually spent in', () => {
    const line = describeUsage(fold([RATE_LIMIT, RESULT]));

    expect(line).toContain('ходов 3');
    expect(line).toContain('токенов 2→9');
    expect(line).toContain('из кэша 120');
    expect(line).toContain('лимит тарифа: allowed');
    expect(line).toContain('five_hour');
    // Dollars are an estimate at API prices and are not a subscription bill, so they are not shown.
    expect(line).not.toContain('$');
  });

  it('says nothing at all when the executor was a script with no stream to read', () => {
    expect(describeUsage({})).toBeNull();
  });
});
