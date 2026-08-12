import { getDatabase } from '@/db/client';
import { requireOwnerScope } from '@/modules/projects/auth/scope';
import { createProjectRepository } from '@/modules/projects/repositories/projects';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  NewProjectForm,
  ProjectList,
} from '@/modules/web';
import { stageLabel } from '@/modules/web/session/stage-display';

/**
 * The authenticated home: start a session, or resume one (FR-002 AC-1; FR-003).
 *
 * A server component, so the list is rendered from a scoped query rather than fetched by the browser
 * and filtered afterwards. `requireOwnerScope` is what makes the query possible at all.
 */
export default async function ProjectsPage() {
  const scope = await requireOwnerScope();
  const projects = await createProjectRepository(getDatabase()).list(scope);

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Projects</h1>
        <p className="text-ink-muted text-sm">
          Each project holds one specification bundle and the session that produced it.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Start a new project</CardTitle>
        </CardHeader>
        <CardContent>
          <NewProjectForm />
        </CardContent>
      </Card>

      <ProjectList
        projects={projects.map((project) => ({
          id: project.id,
          name: project.name,
          stageLabel: stageLabel(project.stage),
          updatedAt: project.updatedAt,
        }))}
      />
    </section>
  );
}
