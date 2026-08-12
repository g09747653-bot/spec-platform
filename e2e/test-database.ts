/**
 * Where the end-to-end suite's throwaway database listens.
 *
 * One constant, imported by the Playwright configuration (which starts the server and points the
 * application at it) and by the fixtures (which seed it). Deliberately **not** read from
 * `DATABASE_URL`: that variable is also set — to a deliberately fake value — so the application can
 * boot in CI, and a fixture that fell back to it would connect to a database that does not exist.
 */
export const TEST_DB_PORT = 5497;

export const TEST_DATABASE_URL = `postgres://postgres:postgres@127.0.0.1:${String(TEST_DB_PORT)}/postgres`;
