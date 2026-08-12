import { describe, expect, it } from 'vitest';

/**
 * TEMPORARY — proves the CI unit-test gate blocks a merge (task 8 acceptance criteria).
 * This branch is never merged; it is closed and deleted once the block is demonstrated.
 */
describe('ci gate proof', () => {
  it('fails on purpose so the required check turns red', () => {
    expect(1 + 1).toBe(3);
  });
});
