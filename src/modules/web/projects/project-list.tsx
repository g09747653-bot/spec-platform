import Link from 'next/link';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';

import { ProjectActions } from './project-actions';

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
  /** Where the name links: the chat itself when there is only one, otherwise the chat list (А-6). */
  href: string;
  sessionCount: number;
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
          <Card className="hover:border-border transition-colors">
            <CardContent className="flex flex-col gap-3 p-4">
              {/*
               * The link wraps the name only, not the row. The row now carries buttons, and a link
               * around a button is a link the button lives inside — one stray click away from
               * navigating instead of deleting.
               */}
              <div className="flex items-center justify-between gap-4">
                <Link
                  href={project.href}
                  className="truncate font-medium hover:underline"
                  data-testid="project-row"
                >
                  <span data-testid="project-name">{project.name}</span>
                </Link>
                <span className="text-foreground-muted flex shrink-0 items-center gap-3 text-xs">
                  {project.sessionCount > 1 && (
                    <span data-testid="project-chat-count">{project.sessionCount} chats</span>
                  )}
                  <span data-testid="project-stage">{project.stageLabel}</span>
                  <time dateTime={project.updatedAt.toISOString()}>
                    {formatUpdatedAt(project.updatedAt)}
                  </time>
                </span>
              </div>

              <ProjectActions projectId={project.id} name={project.name} />
            </CardContent>
          </Card>
        </li>
      ))}
    </ul>
  );
}
