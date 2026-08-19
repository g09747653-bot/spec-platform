import { defineConfig, devices } from '@playwright/test';

/**
 * The loop's end-to-end harness (task 153).
 *
 * Its own configuration, not a project inside the platform's: one `next` server per directory, and
 * the two applications must never share one (the platform's own gate learned that the hard way).
 *
 * **Production server, not `next dev`.** The claim under test includes a cold start bound, and a dev
 * server's first request compiles the route — measuring that would measure the bundler. `webServer`
 * therefore builds and starts, and the suite measures what an operator would actually wait for.
 *
 * Chromium only. The surface is one page rendered for one operator on one machine; three engines
 * would be three times the CI minutes for a claim nobody makes about this package.
 */
const PORT = 3199;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  reporter: process.env.CI === undefined ? 'list' : [['list'], ['html', { open: 'never' }]],

  use: {
    baseURL: `http://127.0.0.1:${String(PORT)}`,
    trace: 'retain-on-failure',
  },

  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],

  webServer: {
    command: 'pnpm build && pnpm start',
    url: `http://127.0.0.1:${String(PORT)}`,
    /*
     * Never reused. A server left over from a previous run holds a different database file and a
     * different event bus, and a feed fed by the wrong bus is a test that passes for the wrong
     * reason — the platform's own suite lost a session to exactly this.
     */
    reuseExistingServer: false,
    timeout: 5 * 60_000,
    stdout: 'pipe',
    stderr: 'pipe',
    env: {
      PORT: String(PORT),
      ANTHROPIC_API_KEY: 'e2e-not-a-real-key',
      WORKSPACE_ROOT_PATH: '.data/e2e-workspace',
      LOOP_DB_PATH: '.data/e2e.db',
      /* Mounts the harness route — the only thing in this process a browser test can poke. */
      LOOP_E2E: '1',
    },
  },
});
