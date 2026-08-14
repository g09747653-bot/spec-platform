import { NO_CREDENTIAL } from '../env';

/**
 * The environment a route test runs against, declared once.
 *
 * Route handlers read configuration through `getEnv()`, so every route test mocks it. Three copies of
 * the same literal had already accumulated, and the fourth variable to become required broke all of
 * them at once — the same shape of defect as D-29, where a second opinion about the test database
 * hid a failure until CI. One module, one answer.
 *
 * Nothing here is a credential: the values are obviously fake, and the point of the record is to
 * satisfy the Zod loader, not to reach any service.
 */
export const TEST_ENV: Readonly<Record<string, string>> = Object.freeze({
  DATABASE_URL: 'postgresql://unused:unused@localhost:5432/unused',
  AUTH_SECRET: 'test-secret',
  AUTH_GOOGLE_ID: 'test',
  AUTH_GOOGLE_SECRET: 'test',
  AUTH_GITHUB_ID: 'test',
  AUTH_GITHUB_SECRET: 'test',
  // Required from task 42 because it is the provider the default chain names (D-46).
  GOOGLE_GENERATIVE_AI_API_KEY: 'test-google-generative-ai-key',
  /*
   * Required from the M6 tail (D-73). `none` is the stated absence: a route test that reaches the
   * storage or research composition root gets the in-process store and the null adapter — the same
   * behaviour these tests had when the variables were optional, now chosen rather than defaulted.
   */
  BLOB_READ_WRITE_TOKEN: NO_CREDENTIAL,
  WEB_SEARCH_API_KEY: NO_CREDENTIAL,
});

/** `TEST_ENV` with overrides — for a test that needs a different chain or a longer timeout. */
export function testEnv(overrides: Record<string, string> = {}): Record<string, string> {
  return { ...TEST_ENV, ...overrides };
}
