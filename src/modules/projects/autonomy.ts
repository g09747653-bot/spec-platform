/**
 * The vocabulary of an autonomous run — the subject of Программа А (task 145; А-7, А-16).
 *
 * A chat is driven autonomously when it has a **run**: a row that says the driver is walking this
 * session, how far it has got, and — once it is over — why it stopped. There is deliberately no
 * `sessions.autonomous` column beside it. A boolean would have to answer two different questions
 * with one value («was this chat created autonomous?» and «is a driver moving right now?»), and the
 * pair drifts the first time a run is stopped: the flag says yes, the session is manual, and the
 * page has to guess which of the two it believes. The run's own existence answers both without a
 * second fact to keep in step, and it carries the history a stopped run leaves behind.
 *
 * `projects` owns the vocabulary for the same reason it owns `AudienceProfile` and `InterviewStyle`
 * (task 144): these are properties of a session, and both `db/schema` (for the CHECKs) and the web
 * surface may import this module while neither may import `agents`.
 *
 * **Every reason is named.** A run that ends says which of these it was, and the set is closed: an
 * autonomous run that stopped «somehow» is the failure mode the red-team pass exists to prevent, and
 * a free-text reason is how that failure mode gets written down as though it were handled.
 */
export const AUTONOMOUS_RUN_STATUSES = ['running', 'stopped'] as const;

export type AutonomousRunStatus = (typeof AUTONOMOUS_RUN_STATUSES)[number];

/**
 * Why a run is over. Ordered by how it reads to the person who comes back to the session.
 *
 * - `completed` — the session reached its terminal position. The only ending that is a success.
 * - `stopped-by-user` — Stop was pressed. Sovereignty: the session continues manually from exactly
 *   the position the run was standing on (АС «Stop mid-run converts to manual cleanly»).
 * - `seed-too-thin` — the session's grounding input carries no buildable intent. The driver answers
 *   an interview from the seed; a seed of two words is not a shortage of effort, it is a shortage of
 *   information, and inventing a product from it would be the driver writing the specification it
 *   was asked to elicit.
 * - `needs-unanswered` — the round budget is spent and the gate out still names something missing.
 *   The product's own answer to that state is the fallback panel, where a **person** supplies what
 *   the model could not extract; a driver filling it from the same seed it already failed to extract
 *   them from is theatre, so it stops and says so.
 * - `revision-budget` — a file's rewrite budget is spent while its board still asks for changes.
 * - `step-budget` — the run reached its step ceiling. A backstop, not a working limit: the real
 *   bounds are the round and revision budgets, and reaching this one is a defect worth reading.
 * - `stalled` — two consecutive steps left the session in an identical state. This is the shape a
 *   runaway loop actually takes, and it is caught by measurement rather than by hope.
 * - `gate-refused` — an endpoint refused with a reason the driver has no move for. The machine's
 *   gates are law for the driver too, so the honest ending is to say which gate said no.
 * - `provider-failed` — the model chain could not produce what the step needed.
 * - `human-decision-pending` — a decision the driver will not take on someone's behalf is waiting
 *   (today: a refinement diff a person proposed). It stops rather than deciding it.
 */
export const AUTONOMOUS_STOP_REASONS = [
  'completed',
  'stopped-by-user',
  'seed-too-thin',
  'needs-unanswered',
  'revision-budget',
  'step-budget',
  'stalled',
  'gate-refused',
  'provider-failed',
  'human-decision-pending',
] as const;

export type AutonomousStopReason = (typeof AUTONOMOUS_STOP_REASONS)[number];

export function isAutonomousStopReason(value: string): value is AutonomousStopReason {
  return (AUTONOMOUS_STOP_REASONS as readonly string[]).includes(value);
}

/** The one ending that means the driver finished what it was asked to do. */
export const AUTONOMOUS_SUCCESS: AutonomousStopReason = 'completed';
