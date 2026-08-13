import { randomUUID } from 'node:crypto';

import { z } from 'zod';

import { getDatabase } from '@/db/client';
import { createTestDoubleAdapter } from '@/modules/adapters/llm';
import { createSpecAgent } from '@/modules/agents/spec/spec-agent';
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
   * Still the skeleton's path: a deterministic stub stands in for the RevisionAgent of task 57. It
   * answers the assembled prompt, so what it produces carries the sections the schema asked for — and
   * the verdict below is checked even here, because a document that fails structural validation must
   * never reach the revision chain, whichever code path produced it (FR-008 AC-7).
   */
  const agent = createSpecAgent(createTestDoubleAdapter({ followPrompt: true }));
  const regenerated = await agent.generate({
    specType: specFile.specType,
    initialPrompt: project.initialPrompt,
    changeInstruction: parsed.data.instruction,
    runId: randomUUID(),
  });

  if (!regenerated.structure.valid) return errorResponse('GENERATION_FAILED');

  const revision = await revisions.append({
    specFileId: specFile.id,
    // The instruction is echoed into the document so the skeleton visibly reflects the request; the
    // real revision agent (task 57) rewrites the content itself.
    content: `${regenerated.content}\n\n<!-- requested change: ${parsed.data.instruction} -->\n`,
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
