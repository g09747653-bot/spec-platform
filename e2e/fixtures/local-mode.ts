/* eslint-disable no-restricted-properties -- the suite's one reader of the run's own flag: the
   config passes LOCAL_SINGLE_USER to the application server, and the specs read the same variable
   to know which deployment kind they are asserting against. */

/**
 * Whether this suite run drives the local single-user deployment (task 148).
 *
 * The value mirrors what `playwright.config.ts` handed the application server, so a spec can skip —
 * with a named reason — the assertions that belong to exactly one deployment kind: the OAuth
 * surface exists only with the flag off, the auto-owner session only with it on. Parsed the way the
 * application's `boolish` parses it, so the suite and the server cannot read one value two ways.
 */
const raw = (process.env.LOCAL_SINGLE_USER ?? '').trim().toLowerCase();

export const LOCAL_SINGLE_USER_RUN = raw === '1' || raw === 'true';

/** The named reason a spec gives when it asserts the surface the local deployment removes. */
export const OAUTH_SURFACE_ONLY =
  'asserts the OAuth surface (sign-in, sign-out, anonymous redirects), which local single-user mode removes by design (task 148)';
