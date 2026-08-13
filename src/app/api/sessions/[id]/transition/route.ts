import { z } from 'zod';

import { getEnv } from '@/config/env';
import { getDatabase } from '@/db/client';
import { currentOwnerScope } from '@/modules/projects/auth/scope';
import { createProjectRepository } from '@/modules/projects/repositories/projects';
import { createSessionRepository } from '@/modules/projects/repositories/sessions';
import { applyTransition } from '@/modules/workflow/apply-transition';
import { registeredCapabilityIds } from '@/modules/workflow/capabilities';
import {
  isSpecStage,
  STAGES,
  SUBSTAGES,
  type StagePosition,
} from '@/modules/workflow/model/stages';
import type { ReasonCode } from '@/modules/workflow/reason-codes';
import { errorResponse, jsonResponse, type ErrorCode } from '@/modules/web/api/responses';

/**
 * `POST /api/sessions/:id/transition` — the one door through which a session moves (task 29;
 * FR-007 AC-6; NFR-012 AC-4).
 *
 * The handler owns nothing but plumbing: ownership, body validation, and the mapping from the
 * engine's verdict to the HTTP vocabulary. Whether the movement is legal is decided entirely by
 * `evaluateTransition` inside `applyTransition`; a rejection returns 409 with the machine-readable
 * reason and leaves the persisted state untouched.
 */
const TransitionRequest = z.object({
  toStage: z.enum(STAGES),
  toSubstage: z.enum(SUBSTAGES).optional(),
});

/** Reasons that are their own HTTP code in the solution's error table; the rest are GATE_REJECTED. */
const STANDALONE_REASONS: Partial<Record<ReasonCode, ErrorCode>> = {
  CAPABILITY_NOT_REGISTERED: 'CAPABILITY_NOT_REGISTERED',
  ROUND_LIMIT_REACHED: 'ROUND_LIMIT_REACHED',
};

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const scope = await currentOwnerScope();
  if (scope === null) return errorResponse('UNAUTHENTICATED');

  const { id: sessionId } = await params;
  const db = getDatabase();

  // The join in this lookup is the authorisation: a session that is not the caller's is simply
  // not found (AR-2), and nothing below runs for it.
  const session = await createSessionRepository(db).findById(scope, sessionId);
  if (session === null) return errorResponse('NOT_FOUND');

  const body: unknown = await request.json().catch(() => null);
  const parsed = TransitionRequest.safeParse(body);

  if (!parsed.success) {
    return errorResponse('VALIDATION_FAILED', {
      issues: parsed.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    });
  }

  // A target must be a real position before the table is even consulted: a spec stage carries a
  // substage, `interview` and `complete` never do. A malformed pair is a bad request, not an
  // illegal transition — the table only ever sees positions that exist.
  const { toStage, toSubstage } = parsed.data;
  let to: StagePosition;

  if (isSpecStage(toStage)) {
    if (toSubstage === undefined) {
      return errorResponse('VALIDATION_FAILED', {
        issues: [{ path: 'toSubstage', message: `${toStage} requires a substage` }],
      });
    }
    to = { stage: toStage, substage: toSubstage };
  } else {
    if (toSubstage !== undefined) {
      return errorResponse('VALIDATION_FAILED', {
        issues: [{ path: 'toSubstage', message: `${toStage} has no substages` }],
      });
    }
    to = { stage: toStage, substage: null };
  }

  const outcome = await applyTransition(db, session.id, to, {
    roundBudget: getEnv().MAX_ROUNDS_PER_STAGE,
    capabilities: registeredCapabilityIds(),
  });

  switch (outcome.status) {
    case 'applied': {
      await createProjectRepository(db).touch(scope, session.projectId);

      return jsonResponse({
        stage: outcome.position.stage,
        substage: outcome.position.substage,
        version: outcome.position.version,
      });
    }
    case 'rejected': {
      const code = STANDALONE_REASONS[outcome.reason] ?? 'GATE_REJECTED';

      // The reason code is the payload (NFR-012 AC-4); `unmet` names the interview conditions
      // still outstanding when the reason is INTERVIEW_INCOMPLETE (FR-006 AC-2).
      return errorResponse(code, {
        reason: outcome.reason,
        ...(!outcome.result.allowed && outcome.result.unmet !== undefined
          ? { unmet: outcome.result.unmet }
          : {}),
      });
    }
    case 'conflict':
      return errorResponse('CONFLICT');
    case 'not-found':
      return errorResponse('NOT_FOUND');
  }
}
