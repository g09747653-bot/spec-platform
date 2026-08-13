import { randomUUID } from 'node:crypto';

import { z } from 'zod';

import { getDatabase } from '@/db/client';
import { createDefaultAdapter } from '@/modules/adapters/llm/default-adapter';
import { createRefinementAgent } from '@/modules/agents/refinement/refinement-agent';
import { currentOwnerScope } from '@/modules/projects/auth/scope';
import { createProjectRepository } from '@/modules/projects/repositories/projects';
import { createProposedChangeService } from '@/modules/specs/proposed-changes/proposed-change-service';
import { createRevisionRepository } from '@/modules/specs/repositories/revisions';
import { createSpecFileRepository } from '@/modules/specs/repositories/spec-files';
import { errorResponse, jsonResponse } from '@/modules/web/api/responses';

/**
 * `POST /api/specs/:specFileId/proposed-changes` — conversational refinement (task 59; FR-011).
 *
 * The composition root for a refinement: it resolves ownership, asks the agent for candidate text,
 * and hands that text to `ProposedChangeService`, which decides whether it may be offered. The
 * split is the module boundary doing its job — the model call lives in `agents`, the admissibility
 * rules live in `specs`, and neither can quietly take over the other's judgement.
 *
 * Three of the four answers are refusals, and each is a different fact:
 *
 * - `409 PENDING_DECISION` — a proposal is already awaiting a decision on this file (AC-6);
 * - `422 VALIDATION_FAILED` with the section named — the change would remove a required heading
 *   (AC-8), which `validateStructure` decided, not a heading list read here;
 * - `200` with a clarifying question — the instruction was ambiguous (AC-9). Deliberately not an
 *   error: the user asked a reasonable thing imprecisely, and an error code would tell them they
 *   did something wrong.
 *
 * **No revision is written on any of these paths, including the successful one** (AC-2).
 */
const RefinementRequest = z.object({
  instruction: z.string().trim().min(1, 'Say what should change.').max(4000),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ specFileId: string }> },
): Promise<Response> {
  const scope = await currentOwnerScope();
  if (scope === null) return errorResponse('UNAUTHENTICATED');

  const { specFileId } = await params;
  const db = getDatabase();

  // The join in this lookup is the authorisation: another user's file is not found (AR-2).
  const specFile = await createSpecFileRepository(db).findById(scope, specFileId);
  if (specFile === null) return errorResponse('NOT_FOUND');

  const body: unknown = await request.json().catch(() => null);
  const parsed = RefinementRequest.safeParse(body);

  if (!parsed.success) {
    return errorResponse('VALIDATION_FAILED', {
      issues: parsed.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    });
  }

  const service = createProposedChangeService(db);

  /*
   * The pending check runs before the model call as well as after it. The index is what actually
   * enforces DR-11 — the second insert fails whatever this read said — but paying for a generation
   * only to throw it away is worth avoiding when the answer is already knowable.
   */
  const pending = await service.pendingForFile(scope, specFile.id);
  if (pending !== null) {
    return errorResponse('PENDING_DECISION', { proposedChangeId: pending.id });
  }

  const current = await createRevisionRepository(db).latest(specFile.id);
  if (current === null) return errorResponse('NOT_FOUND');

  // The configured chain, with failover, exactly as generation uses it — refinement needs no
  // provider of its own and no configuration of its own (A3; P7).
  const agent = createRefinementAgent(createDefaultAdapter());
  const refined = await agent.propose({
    specType: specFile.specType,
    specContent: current.content,
    instruction: parsed.data.instruction,
    runId: randomUUID(),
  });

  if (refined.kind === 'draft-invalid') return errorResponse('GENERATION_FAILED');

  if (refined.kind === 'clarification') {
    return jsonResponse({
      status: 'clarification',
      question: refined.question,
      instruction: parsed.data.instruction,
    });
  }

  const outcome = await service.propose(scope, {
    specFileId: specFile.id,
    instruction: parsed.data.instruction,
    proposedContent: refined.content,
  });

  switch (outcome.status) {
    case 'proposed':
      await createProjectRepository(db).touch(scope, specFile.projectId);

      return jsonResponse(
        {
          status: 'proposed',
          proposedChangeId: outcome.proposal.id,
          fileName: outcome.proposal.fileName,
          baseRevision: outcome.proposal.baseRevision,
          instruction: outcome.proposal.instruction,
          unifiedDiff: outcome.unifiedDiff,
          added: outcome.diff.added,
          removed: outcome.diff.removed,
        },
        201,
      );

    case 'pending-decision':
      return errorResponse('PENDING_DECISION', { proposedChangeId: outcome.existing.id });

    case 'removes-required-section':
      return errorResponse('VALIDATION_FAILED', {
        issues: outcome.sections.map((section) => ({
          path: 'instruction',
          message: `that change would remove the required section "${section}"`,
        })),
        removedSections: outcome.sections,
      });

    case 'no-change':
      return jsonResponse({ status: 'no-change', instruction: parsed.data.instruction });

    case 'not-found':
      return errorResponse('NOT_FOUND');
  }
}
