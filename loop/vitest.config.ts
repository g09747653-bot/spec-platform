import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

/**
 * The loop's unit harness.
 *
 * Same discipline as the platform's: plain objects, no network, no model provider. The database is
 * not mocked — SQLite is a file, and the claims worth making about it (WAL, busy timeouts, cascades,
 * ten writers not colliding) are claims about the real engine. Each suite works in a temporary
 * directory of its own.
 */
export default defineConfig({
  resolve: {
    alias: {
      '~': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'e2e/**/*.unit.test.ts'],
    exclude: ['node_modules/**', '.next/**', '.data/**'],
    /* The concurrency probe starts ten worker threads, each opening its own connection. */
    hookTimeout: 60_000,
    testTimeout: 60_000,
  },
});
