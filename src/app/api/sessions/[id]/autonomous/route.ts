import { getDatabase } from '@/db/client';
import { currentOwnerScope } from '@/modules/projects/auth/scope';
import { createAutonomousRunRepository } from '@/modules/projects/repositories/autonomous-runs';
import { createSessionMessageRepository } from '@/modules/projects/repositories/session-messages';
import { createSessionRepository } from '@/modules/projects/repositories/sessions';
import { errorResponse, jsonResponse } from '@/modules/web/api/responses';
import { serverT } from '@/modules/web/i18n/server-locale';
import { createWorkflowStateRepository } from '@/modules/workflow/repositories/workflow-state';

/**
 * `POST /api/sessions/:id/autonomous` — hand the session to the driver.
 * `DELETE /api/sessions/:id/autonomous` — take it back (task 145; А-7).
 *
 * Two verbs and nothing between them, because autonomy has exactly two states from a person's side.
 * Neither of them moves the session: starting a run creates the row a tick reads and stops there,
 * and stopping one ends that row and stops there. The position, the pending card and every budget
 * are exactly what they were a moment earlier, which is what «Stop drops the session into normal
 * manual mode at exactly that position» means when it is implemented rather than promised.
 *
 * **Stop is unconditional and immediate.** It does not wait for a step, cancel a request or ask the
 * driver to finish anything: it writes the row, and the step guard in `step/route.ts` refuses to
 * dispatch for a run that is not `running`. A step already inside a model call therefore ends
 * without touching the session — the claim it needs no longer exists.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const scope = await currentOwnerScope();
  if (scope === null) return errorResponse('UNAUTHENTICATED');

  const { id: sessionId } = await params;
  const db = getDatabase();

  const session = await createSessionRepository(db).findById(scope, sessionId);
  if (session === null) return errorResponse('NOT_FOUND');

  /*
   * A sealed session has nothing left to drive, and starting a driver on one would produce a run
   * whose first move is to stop. Refusing here is the same refusal the state machine gives a
   * transition out of `complete` (SESSION_SEALED), said once rather than discovered by walking into
   * it.
   */
  if (session.stage === 'complete') {
    return errorResponse('GATE_REJECTED', { reason: 'SESSION_SEALED' });
  }

  const run = await createAutonomousRunRepository(db).start(session.id);
  /*
   * `null` means the partial unique index refused a second live run. That is not a failure the
   * caller needs to recover from — the session already has a driver, which is what they asked for —
   * so it answers with the run that exists.
   */
  if (run === null) {
    const live = await createAutonomousRunRepository(db).findLive(session.id);
    if (live === null) return errorResponse('CONFLICT');

    return jsonResponse({ runId: live.id, status: live.status, steps: live.steps });
  }

  const t = await serverT();
  const state = await createWorkflowStateRepository(db).find(session.id);

  if (state !== null) {
    await createSessionMessageRepository(db).append({
      sessionId: session.id,
      role: 'assistant',
      origin: 'driver',
      stage: state.stage,
      substage: state.substage,
      body: t('feed.driver.started'),
    });
  }

  return jsonResponse({ runId: run.id, status: run.status, steps: run.steps }, 201);
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const scope = await currentOwnerScope();
  if (scope === null) return errorResponse('UNAUTHENTICATED');

  const { id: sessionId } = await params;
  const db = getDatabase();

  const session = await createSessionRepository(db).findById(scope, sessionId);
  if (session === null) return errorResponse('NOT_FOUND');

  const runs = createAutonomousRunRepository(db);
  const live = await runs.findLive(session.id);
  /*
   * Stopping a session with no driver is not an error. It is what a second press of Stop looks like,
   * and what a press that raced the run's own ending looks like; both leave the session manual,
   * which is what was asked for.
   */
  if (live === null) return jsonResponse({ runId: null, status: 'stopped', stopped: false });

  const stopped = await runs.stop(live.id, 'stopped-by-user');
  if (stopped === null) return errorResponse('NOT_FOUND');

  /*
   * The note is written only by the press that actually ended the run — `stop` is idempotent and
   * hands back the row as it stands, so a Stop that arrives after the run finished on its own reads
   * a reason that is not `stopped-by-user` and says nothing, leaving the run's own ending in the
   * feed rather than two endings.
   */
  if (stopped.stopReason === 'stopped-by-user') {
    const t = await serverT();
    const state = await createWorkflowStateRepository(db).find(session.id);

    if (state !== null) {
      await createSessionMessageRepository(db).append({
        sessionId: session.id,
        role: 'assistant',
        origin: 'driver',
        stage: state.stage,
        substage: state.substage,
        body: t('feed.driver.stop.stopped-by-user'),
      });
    }
  }

  return jsonResponse({
    runId: stopped.id,
    status: stopped.status,
    stopped: stopped.stopReason === 'stopped-by-user',
  });
}
