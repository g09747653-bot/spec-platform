import { describe, expect, it } from 'vitest';

import { MODULE_ID } from '@/modules/specs';

/**
 * Proves the unit harness runs, resolves the `@/` alias, and needs no database, no network,
 * and no model provider (constitution — Testing Approaches item 1; NFR-012 AC-2/AC-5).
 *
 * Replaced in substance by the workflow, specs, agents and parity suites from Milestone 2
 * onward; kept as the canary that the harness itself still works.
 */

/**
 * A pure function: same input, same output, no I/O.
 *
 * Its samples are deliberately nonsense words. They used to be real section names, which task 39
 * turned into structural vocabulary that may live in exactly one module — and the new lint rule
 * caught this file on the first run, which is the rule doing its job.
 */
function squash(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ').toLowerCase();
}

describe('unit test harness', () => {
  it('resolves the @/ path alias to the module tree', () => {
    expect(MODULE_ID).toBe('specs');
  });

  it('evaluates a pure function deterministically', () => {
    expect(squash('  Lorem   Ipsum ')).toBe('lorem ipsum');
    expect(squash('  Lorem   Ipsum ')).toBe(squash('Lorem Ipsum'));
  });

  it('runs without a network fetch', () => {
    const before = globalThis.fetch;
    expect(squash('Dolor')).toBe('dolor');
    expect(globalThis.fetch).toBe(before);
  });
});
