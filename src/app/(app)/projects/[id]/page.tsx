import { notFound } from 'next/navigation';

import { getDatabase } from '@/db/client';
import { requireOwnerScope } from '@/modules/projects/auth/scope';
import { createProjectRepository } from '@/modules/projects/repositories/projects';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/modules/web';

/**
 * The session surface for one project.
 *
 * **Not found and not owned are the same answer** (AR-2; NFR-005 AC-2): the repository query carries
 * the owner predicate, so a project belonging to someone else returns `null` exactly as a project that
 * never existed, and both render `notFound()`. There is no branch here that could distinguish them,
 * which is what makes 404-not-403 a property of the code rather than a promise.
 *
 * The stage rail arrives in task 19, generation in task 20, the approval card in task 21 and export in
 * task 22 — each extends this page rather than replacing it.
 */
export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const scope = await requireOwnerScope();
  const project = await createProjectRepository(getDatabase()).findById(scope, id);

  if (project === null) notFound();

  return (
    <section className="flex flex-col gap-6" data-testid="session">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight" data-testid="session-project-name">
          {project.name}
        </h1>
        <p className="text-ink-muted text-sm">Session {project.sessionId}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Your prompt</CardTitle>
          <CardDescription>
            The grounding input for every stage of this session (FR-003 AC-3).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm whitespace-pre-wrap" data-testid="session-prompt">
            {project.initialPrompt}
          </p>
        </CardContent>
      </Card>
    </section>
  );
}
