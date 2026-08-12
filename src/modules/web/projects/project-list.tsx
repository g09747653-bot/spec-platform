import Link from 'next/link';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';

/**
 * The project list (FR-002 AC-1): name, current stage, last-updated time.
 *
 * Presentation only — the rows arrive already scoped to the signed-in owner, because the query that
 * produced them required an `OwnerScope`. There is nothing here that could widen it.
 */
export interface ProjectListItem {
  id: string;
  name: string;
  stageLabel: string;
  updatedAt: Date;
}

/**
 * Rendered on the server, so the format is stable rather than dependent on the visitor's locale
 * settings differing between server and client (which would be a hydration mismatch).
 */
function formatUpdatedAt(updatedAt: Date): string {
  return new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'UTC',
  }).format(updatedAt);
}

export function ProjectList({ projects }: { projects: readonly ProjectListItem[] }) {
  if (projects.length === 0) {
    return (
      <Card data-testid="projects-empty">
        <CardHeader>
          <CardTitle>No projects yet</CardTitle>
          <CardDescription>
            Describe an idea above and the interview starts from that prompt.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <ul className="flex flex-col gap-3" data-testid="projects-list">
      {projects.map((project) => (
        <li key={project.id}>
          <Link href={`/projects/${project.id}`} className="block" data-testid="project-row">
            <Card className="hover:border-border transition-colors">
              <CardContent className="flex items-center justify-between gap-4 p-4">
                <span className="truncate font-medium" data-testid="project-name">
                  {project.name}
                </span>
                <span className="text-ink-muted flex shrink-0 items-center gap-3 text-xs">
                  <span data-testid="project-stage">{project.stageLabel}</span>
                  <time dateTime={project.updatedAt.toISOString()}>
                    {formatUpdatedAt(project.updatedAt)}
                  </time>
                </span>
              </CardContent>
            </Card>
          </Link>
        </li>
      ))}
    </ul>
  );
}
