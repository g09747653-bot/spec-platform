import { getDatabase } from '@/db/client';
import { createDefaultAdapter } from '@/modules/adapters/llm/default-adapter';
import { createMethodologyClassifier } from '@/modules/agents/methodology/classify';
import { configEntryPosition, methodologyConfig } from '@/modules/methodologies';
import { currentOwnerScope } from '@/modules/projects/auth/scope';
import {
  AUTO_METHODOLOGY,
  CreateProjectRequest,
  deriveProjectName,
} from '@/modules/projects/create-project';
import { detectContentLanguage } from '@/modules/projects/language';
import { createProjectRepository } from '@/modules/projects/repositories/projects';
import { errorResponse, jsonResponse } from '@/modules/web/api/responses';

/**
 * `GET /api/projects` — the caller's own projects (FR-002 AC-1).
 * `POST /api/projects` — a project, session and workflow state from one prompt (FR-002 AC-2, FR-003).
 *
 * Both derive the `OwnerScope` from the session before touching the repository, which is the only way
 * to reach data at all (NFR-005 AC-3). Neither accepts an owner identifier from the client.
 */

export async function GET(): Promise<Response> {
  const scope = await currentOwnerScope();
  if (scope === null) return errorResponse('UNAUTHENTICATED');

  const projects = await createProjectRepository(getDatabase()).list(scope);

  return jsonResponse({ projects });
}

export async function POST(request: Request): Promise<Response> {
  const scope = await currentOwnerScope();
  if (scope === null) return errorResponse('UNAUTHENTICATED');

  const body: unknown = await request.json().catch(() => null);
  const parsed = CreateProjectRequest.safeParse(body);

  if (!parsed.success) {
    // FR-003 AC-2 server-side half. The browser checks too, but the API is the authority.
    return errorResponse('VALIDATION_FAILED', {
      issues: parsed.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    });
  }

  const { prompt, audience, style, methodology } = parsed.data;

  /*
   * Auto (task 117): one cheap classification over the existing chain, and every failure — a bad
   * answer, an unknown id, an exhausted provider — lands on the parity workflow without saying so.
   * The user picked "let it choose", not "tell me who chose".
   */
  const methodologyId =
    methodology === AUTO_METHODOLOGY
      ? await createMethodologyClassifier(createDefaultAdapter()).classify({
          description: prompt,
          runId: `methodology-auto-${scope.userId}`,
        })
      : methodology;

  const entry = configEntryPosition(methodologyConfig(methodologyId));

  const created = await createProjectRepository(getDatabase()).createFromPrompt(scope, {
    name: deriveProjectName(prompt),
    prompt,
    audience,
    /* Task 144: the second axis of the same choice — how the questions are worded, and what they ask
     * about. Stored beside the profile and read back per round, never re-decided. */
    style,
    methodologyId,
    entryStage: entry.stage,
    entrySubstage: entry.substage,
    /*
     * У-1: detected here, once, and stored (task 108). Every later call reads the column — the
     * detection is deterministic and cheap, but re-running it per request would let a round whose
     * answers happened to be product names look like a different language from the one before it.
     */
    contentLanguage: detectContentLanguage(prompt),
  });

  return jsonResponse(created, 201);
}
