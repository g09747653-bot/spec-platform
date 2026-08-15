import { defineConfig, devices } from '@playwright/test';

import { NO_CREDENTIAL } from './src/config/env';
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
  /*
   * 60 seconds per test, not Playwright's 30 (round 1 of M9п).
   *
   * Every journey test waits on a *streamed* generation. The stub answers quickly on an idle
   * machine, but the suite runs serially across three engines, and by the time the third one starts
   * the runner has been busy for twenty minutes — on CI that pushed a stub generation past the
   * 20-second wait inside a 30-second test, and four correct journeys failed for want of a few
   * seconds. The wait itself is bounded (`GENERATION_TIMEOUT` in the journey fixture); this is the
   * envelope around it, and it exists so a slow machine reports slowness rather than a defect.
   */
  timeout: 60_000,
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
      /*
       * Overrides `.env`: Next never overwrites a variable that is already set in the environment.
       *
       * `DATABASE_URL` points the application at the throwaway database instead of Neon.
       *
       * `AUTH_URL` is blanked — and blank means absent (D-12) — so Auth.js derives the callback and
       * redirect base from the request, exactly as it does on a deployment where the variable is
       * deliberately unset (D-21). Left at its local value, every redirect would aim at port 3000
       * while the suite runs on 3100; the point is not to dodge that, it is that the suite should
       * exercise the production behaviour rather than a local pin.
       */
      /*
       * `LLM_PROVIDER_ORDER` points the chain at the deterministic double (D-48; IR-001-AC-5). The
       * suite therefore drives the real routes, the real engine and the real streaming path with no
       * vendor involved — the same move as pointing `DATABASE_URL` at a throwaway database, and the
       * reason no end-to-end run can be made to depend on a model having a good day.
       */
      /*
       * `BLOB_READ_WRITE_TOKEN` is set to `none` for the same reason, and it matters more than it
       * looks: without this, a developer whose `.env` holds a real token would have every upload in
       * the suite written to the project's live Blob store, while CI — which has no `.env` — used the
       * in-memory one. Same suite, two behaviours, one of them touching a real service (NFR-012
       * AC-2). `none` is the stated absence (D-73), so both run against the in-process store.
       *
       * It was a blank until the M6 tail, when the variable became required: blank means absent
       * (D-12), and absent now stops the server from booting at all. Same intent, stated explicitly.
       */
      /*
       * `WEB_SEARCH_API_KEY` is set to `none` for the same reason as the Blob token, and it is the
       * sharper case: a live search is a paid third-party call made from a test, per generation, at
       * whatever pace the suite runs. `none` selects the null research adapter, whose behaviour is
       * identical to an outage — which is exactly the path FR-019 AC-4 requires the stage to survive,
       * so the suite exercises it on every run rather than never.
       */
      env: {
        DATABASE_URL: TEST_DATABASE_URL,
        AUTH_URL: '',
        LLM_PROVIDER_ORDER: 'stub',
        BLOB_READ_WRITE_TOKEN: NO_CREDENTIAL,
        WEB_SEARCH_API_KEY: NO_CREDENTIAL,
      },
    },
  ],
});
