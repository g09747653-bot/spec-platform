import { defineConfig, devices } from '@playwright/test';

import { TEST_DATABASE_URL, TEST_DB_PORT } from './e2e/test-database';

/**
 * End-to-end harness (constitution — Testing Approaches item 2; NFR-011; SC-12).
 *
 * Browser matrix: Chromium, Firefox and WebKit.
 * **Edge is covered by the Chromium project** — Edge is Chromium-based and Playwright drives it
 * with the same engine, so a separate project would re-test the same rendering and streaming
 * paths. NFR-011's four browsers therefore map onto three Playwright projects:
 * Chrome + Edge → chromium, Firefox → firefox, Safari → webkit.
 *
 * No test here may make a live model call (NFR-012 AC-5); generation runs against the
 * deterministic stub adapter introduced in task 18.
 *
 * **The database.** Two servers start, in order: a throwaway PostgreSQL instance (PGlite behind the
 * PostgreSQL wire protocol, migrations pre-applied — see `scripts/test-db-server.mjs`) and then the
 * application pointed at it. No container, no managed database and no credential is involved, so the
 * suite runs identically on a developer machine and on CI (D-18; constitution S1).
 */
const PORT = 3100;
const BASE_URL = `http://127.0.0.1:${String(PORT)}`;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],

  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
  },

  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],

  webServer: [
    {
      command: 'pnpm db:test-server',
      port: TEST_DB_PORT,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      stdout: 'ignore',
      stderr: 'pipe',
    },
    {
      command: `pnpm next dev --port ${String(PORT)}`,
      url: BASE_URL,
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
      stdout: 'ignore',
      stderr: 'pipe',
      // Overrides `.env`: Next never overwrites a variable that is already set in the environment,
      // so the application under test talks to the throwaway database rather than to Neon.
      env: { DATABASE_URL: TEST_DATABASE_URL },
    },
  ],
});
