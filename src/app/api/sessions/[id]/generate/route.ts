import { randomUUID } from 'node:crypto';

import { getDatabase } from '@/db/client';
import { createSpecAgent } from '@/modules/agents/spec/spec-agent';
import { targetSpecType } from '@/modules/agents/spec/target-spec-type';
import { createTestDoubleAdapter, stubDocumentFor } from '@/modules/adapters/llm';
import { currentOwnerScope } from '@/modules/projects/auth/scope';
import { createSessionRepository } from '@/modules/projects/repositories/sessions';
import { createRevisionRepository } from '@/modules/specs/repositories/revisions';
import { isStage } from '@/modules/workflow/model/stages';
import { errorResponse, jsonResponse } from '@/modules/web/api/responses';

/**
 * `POST /api/sessions/:id/generate` — the walking skeleton's generation path (task 20; FR-008).
 *
 * Deliberately the simplest thing that can work end to end: resolve the owner, ask the agent for
 * markdown, persist it as **one unapproved revision**, return the card payload. No provider registry, no
 * failover, no chunk log and no event protocol — those extend this handler in tasks 43–45 rather than
 * replacing the route.
 *
 * The provider is the deterministic stub, constructed here in the composition root. The agent itself
 * knows nothing about which adapter it was handed (P7), so swapping in the registry later touches this
 * file and not the agent.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const scope = await currentOwnerScope();
  if (scope === null) return errorResponse('UNAUTHENTICATED');

  const { id: sessionId } = await params;
  const db = getDatabase();

  // Ownership is resolved by this query's join, so a session belonging to someone else is simply not
  // found — the same answer as one that never existed (AR-2; task 20 AC-3).
  const session = await createSessionRepository(db).findById(scope, sessionId);
  if (session === null) return errorResponse('NOT_FOUND');

  const stage = isStage(session.stage) ? session.stage : 'interview';
  const specType = targetSpecType(stage);

  const revisions = createRevisionRepository(db);
  const specFile = await revisions.ensureSpecFile(session.projectId, specType);

  const agent = createSpecAgent(createTestDoubleAdapter({ document: stubDocumentFor(specType) }));
  const generated = await agent.generate({
    specType,
    initialPrompt: session.initialPrompt,
    runId: randomUUID(),
  });

  const revision = await revisions.append({
    specFileId: specFile.id,
    content: generated.content,
  });

  return jsonResponse(
    {
      specFileId: specFile.id,
      specType,
      fileName: `${specType}.md`,
      revisionId: revision.id,
      revisionNumber: revision.revisionNumber,
      approved: revision.approved,
      content: revision.content,
    },
    201,
  );
}
