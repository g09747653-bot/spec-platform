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
