import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

/**
 * Unit test harness (constitution — Testing Approaches item 1).
 *
 * Runs on plain objects: no database, no browser, no model provider, no network
 * (NFR-012 AC-2/AC-5). E2E lives in `e2e/` and is driven by Playwright instead.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    /*
     * Booting PGlite is a WASM PostgreSQL start-up, and a dozen suites do it in parallel. On a busy
     * machine — and on a CI runner with fewer cores than a laptop — that comfortably exceeds the
     * 10 s default, which shows up as `beforeAll` timing out in whichever suites lost the race
     * rather than as a defect in any of them. The work is not slow; the contention is.
     */
    hookTimeout: 60_000,
    exclude: ['node_modules/**', '.next/**', 'e2e/**', 'src/modules/**/__fixtures__/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      reportsDirectory: './coverage',
      include: ['src/**/*.ts', 'src/**/*.tsx'],
      exclude: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'src/modules/**/__fixtures__/**'],
    },
  },
});
