import { getDatabase } from '@/db/client';
import { currentOwnerScope } from '@/modules/projects/auth/scope';
import { CreateProjectRequest, deriveProjectName } from '@/modules/projects/create-project';
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

  const { prompt } = parsed.data;
  const created = await createProjectRepository(getDatabase()).createFromPrompt(scope, {
    name: deriveProjectName(prompt),
    prompt,
  });

  return jsonResponse(created, 201);
}
