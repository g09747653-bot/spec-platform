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
        <h1 className="text-h1">Projects</h1>
        <p className="text-foreground-muted text-sm">
          Each project holds one specification bundle and the chats that write it.
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
          // The primary chat's own methodology names the position (task 132; row `1.4-6`).
          stageLabel: stageLabel(project.stage, project.methodologyId),
          updatedAt: project.updatedAt,
          /*
           * Where the row's name goes (А-6). A project with one chat opens **in that chat**, so
           * every project created before M9п — and every project nobody has edited — behaves
           * exactly as it did. A project with more than one opens its list of chats, because there
           * is no longer a single obvious conversation to drop the reader into.
           */
          href:
            project.sessionCount === 1
              ? `/sessions/${project.sessionId}`
              : `/projects/${project.id}`,
          sessionCount: project.sessionCount,
        }))}
      />
    </section>
  );
}
