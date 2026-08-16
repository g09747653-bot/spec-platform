import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

/**
 * The live pre-flight harness (task 130 AC-3; the D-91 pattern).
 *
 * Separate from `vitest.config.ts` on purpose, and the separation is the safety property: the unit
 * config excludes `e2e/**` outright, so nothing here can be picked up by `pnpm test:unit` and no CI
 * run can reach a model (NFR-012 AC-5; constitution — Testing Approaches item 3). What runs under
 * this config is the opposite instrument — a measurement that only says something *because* it
 * depends on a real model on a real machine.
 *
 * Round 3 measured the same class of thing with a script that was never committed, so its numbers
 * could be quoted but not re-run. This is that script, kept.
 *
 * Run it as the gate is prepared:
 *   OLLAMA_CONTEXT_LENGTH=16384 OLLAMA_KEEP_ALIVE=4h OLLAMA_NUM_PARALLEL=1 ollama serve
 *   pnpm test:preflight
 */
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    /*
     * `*.preflight.ts`, not `*.live.test.ts`: Playwright's default `testMatch` claims anything
     * ending in `.test.ts`, and `pnpm test:e2e` tried to run this file as a browser spec. One suffix,
     * one runner — the name is what keeps the two harnesses out of each other's way.
     */
    include: ['e2e/**/*.preflight.ts'],
    /** A local 14B reads a full window in minutes, not seconds. This is the budget, not a guess. */
    testTimeout: 900_000,
    hookTimeout: 900_000,
  },
});
