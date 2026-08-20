/**
 * The end-to-end harness (task 79).
 *
 * Three concerns, three modules, one entry point:
 *
 * - **`auth`** — a signed-in identity without an OAuth round trip, and a fresh credential for an
 *   existing one. Nothing test-only is added to the application to make this work: the fixture
 *   creates the session row Auth.js would have created, and the application authenticates it through
 *   the same adapter and the same query. There is no bypass provider and no "test mode" branch that
 *   production code could later come to depend on.
 * - **`journey`** — driving a session through its gates. Every helper clicks what a person clicks, so
 *   a gate that stops holding is a test that stops passing.
 * - **`download`** — capturing an archive and reading what is actually inside it.
 * - **`locale`** — choosing the interface language before the first request, which is the only way to
 *   prove the server rendered it (task 143).
 * - **`console-noise`** — the one dictionary of browser noise a clean-console check forgives, shared
 *   by the suite and by every hand-run walk (task 173; D-276).
 * - **`reload`** — a reload Gecko may abort, retried once: the same event as `console-noise`, one
 *   layer down, where it arrives as a thrown navigation rather than a console line.
 *
 * Barrel rather than deep imports, so a test names what it needs and not where it lives.
 */
export {
  createSignedInUser,
  pendingReviewIdFor,
  reauthenticate,
  signIn,
  type SignedInUser,
} from './auth';

export {
  collectFor,
  completeInterview,
  completeStage,
  decideReviewAndAdvance,
  draftAndApprove,
  openRefine,
  PARITY_STAGES,
  projectIdOf,
  reachDrafting,
  startSession,
  type ParityStage,
} from './journey';

export { downloadBundle, type CapturedArchive } from './download';

export { useLocale, type UiLocale } from './locale';

export { EXPECTED_CONSOLE_NOISE, EXPECTED_RESTART_NOISE, unexpectedConsole } from './console-noise';

export { reloadSettled } from './reload';
