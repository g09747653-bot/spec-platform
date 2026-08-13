import { randomUUID } from 'node:crypto';

import { z } from 'zod';

import { getDatabase } from '@/db/client';
import { createDefaultAdapter } from '@/modules/adapters/llm/default-adapter';
import { createRevisionAgent } from '@/modules/agents/revision/revision-agent';
import { collectContextSources } from '@/modules/agents/spec/collect-context';
import { currentOwnerScope } from '@/modules/projects/auth/scope';
import { createProjectRepository } from '@/modules/projects/repositories/projects';
import { isCoreSpecType } from '@/modules/specs/model/spec-files';
import { createRevisionRepository } from '@/modules/specs/repositories/revisions';
import { createSpecFileRepository } from '@/modules/specs/repositories/spec-files';
import { errorResponse, jsonResponse } from '@/modules/web/api/responses';

/**
 * `POST /api/specs/:specFileId/decision` — the per-file approval gate (task 21; FR-009).
 *
 * Two decisions, and the difference between them is the whole of P2:
 *
 * - **approve** marks exactly the revision the user was looking at as approved. Nothing else changes;
 *   the workflow advancing is a separate, gated transition (task 24).
 * - **request_changes** produces a *new unapproved* revision from the user's instruction and presents
 *   that one for approval instead. The previous revision stays in history untouched — the database would
 *   refuse anything else (task 16).
 *
 * Approving requires the revision number the client was shown. That is not ceremony: without it, a
 * decision made against a stale card could approve content the user never read.
 */
const DecisionRequest = z.discriminatedUnion('decision', [
  z.object({
    decision: z.literal('approve'),
    revisionNumber: z.number().int().positive(),
  }),
  z.object({
    decision: z.literal('request_changes'),
    instruction: z.string().trim().min(1, 'Say what should change.').max(4000),
  }),
]);

export async function POST(
  request: Request,
  { params }: { params: Promise<{ specFileId: string }> },
): Promise<Response> {
  const scope = await currentOwnerScope();
  if (scope === null) return errorResponse('UNAUTHENTICATED');

  const { specFileId } = await params;
  const db = getDatabase();

  // The join in this lookup is the authorization: another user's spec file is not found (AR-2).
  const specFile = await createSpecFileRepository(db).findById(scope, specFileId);
  if (specFile === null) return errorResponse('NOT_FOUND');

  const body: unknown = await request.json().catch(() => null);
  const parsed = DecisionRequest.safeParse(body);

  if (!parsed.success) {
    return errorResponse('VALIDATION_FAILED', {
      issues: parsed.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    });
  }

  const revisions = createRevisionRepository(db);
  const projects = createProjectRepository(db);

  if (parsed.data.decision === 'approve') {
    const latest = await revisions.latest(specFile.id);

    if (latest === null) return errorResponse('NOT_FOUND');

    // The card the user acted on must be the current one, or the decision is about something else.
    if (latest.revisionNumber !== parsed.data.revisionNumber) {
      return errorResponse('PENDING_DECISION', {
        currentRevisionNumber: latest.revisionNumber,
      });
    }

    await revisions.approve(latest.id);
    await projects.touch(scope, specFile.projectId);

    /*
     * Approval **permits** `generate → review` (FR-009 AC-3); it does not perform it, and it does
     * not produce the review. The feedback is generated when the stage actually enters `review`
     * (FR-010 AC-1), which is the transition endpoint's job — the same separation that keeps
     * deciding and moving apart everywhere else in this workflow.
     */
    return jsonResponse({
      specFileId: specFile.id,
      fileName: specFile.fileName,
      revisionId: latest.id,
      revisionNumber: latest.revisionNumber,
      approved: true,
      content: latest.content,
    });
  }

  const project = await projects.findById(scope, specFile.projectId);
  if (project === null) return errorResponse('NOT_FOUND');

  // The parity path regenerates parity files. `quality.md` belongs to the optional Quality module,
  // which owns its own generation outright (constitution A6) and is not registered here — so a
  // request-changes decision on it is answered by the capability code rather than served wrongly.
  if (!isCoreSpecType(specFile.specType)) return errorResponse('CAPABILITY_NOT_REGISTERED');

  /*
   * The RevisionAgent of task 57, on the card's trigger (FR-009 AC-4).
   *
   * It regenerates through the assembled context rather than from the instruction alone (FR-008
   * AC-6), and it carries any ticked review feedback for this file with it — filtered to the
   * selection by the assembler. The structural verdict is checked here as on every other path that
   * can write a revision: a document missing a required section never reaches the chain, whichever
   * code produced it (FR-008 AC-7; D-52).
   */
  const collected = await collectContextSources(db, scope, {
    sessionId: project.sessionId,
    projectId: specFile.projectId,
    initialPrompt: project.initialPrompt,
    specType: specFile.specType,
  });

  const agent = createRevisionAgent(createDefaultAdapter());
  const regenerated = await agent.revise({
    specType: specFile.specType,
    sources: collected.sources,
    instruction: parsed.data.instruction,
    runId: randomUUID(),
  });

  if (!regenerated.structure.valid) return errorResponse('GENERATION_FAILED');

  const revision = await revisions.append({
    specFileId: specFile.id,
    // The instruction is echoed as a trailing comment so the card visibly reflects what was asked;
    // the document itself is the agent's, rewritten against the instruction and the context.
    content: `${regenerated.content}\n\n<!-- requested change: ${parsed.data.instruction} -->\n`,
    // The same set the context was built from — a revision written by any path records it (DR-12).
    contextAttachmentIds: collected.contextAttachmentIds,
  });
  await projects.touch(scope, specFile.projectId);

  return jsonResponse(
    {
      specFileId: specFile.id,
      fileName: specFile.fileName,
      revisionId: revision.id,
      revisionNumber: revision.revisionNumber,
      approved: revision.approved,
      content: revision.content,
    },
    201,
  );
}
