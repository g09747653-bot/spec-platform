/**
 * Whether the end-to-end harness route exists in this process (task 153).
 *
 * Read directly rather than through `getEnv()`, and deliberately so: this is not configuration of
 * the loop, it is a property of *how this process was started for a test*. Putting it in the
 * validated schema would make it a documented deployment option, which is the opposite of what it
 * is — a real deployment never sets it, and `.env.example` does not mention it.
 */
/* eslint-disable no-restricted-properties -- the one reader of the harness flag; see above. */
export function harnessEnabled(): boolean {
  return process.env.LOOP_E2E === '1';
}
/* eslint-enable no-restricted-properties */
