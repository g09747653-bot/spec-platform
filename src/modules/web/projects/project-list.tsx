import Link from 'next/link';

import { type Locale } from '../i18n/phrase';
import { currentLocale, serverT } from '../i18n/server-locale';
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
  /**
   * The stage's canonical id, beside the label rather than instead of it (task 143): the label is
   * the methodology's own word for the position and is about to be translatable, while this is the
   * name the workflow model uses and never changes.
   */
  stage: string;
  stageLabel: string;
  updatedAt: Date;
  /** Where the name links: the chat itself when there is only one, otherwise the chat list (А-6). */
  href: string;
  sessionCount: number;
}

/**
 * The one date this application formats, and the two halves of that are not the same decision
 * (task 143).
 *
 * The **language** follows the chrome: a page whose every other word is Russian has no business
 * printing «17 Aug 2026», and `<html lang>` now claims the language out loud. The **time zone** does
 * not follow anything — it is pinned to UTC, and that pin is what makes the string stable. Rendered
 * on the server, the format has to be one the client would produce from the same instant, and the
 * visitor's zone is the part of `Intl` the server cannot know; the locale it does know, because it
 * just read the cookie. Dropping the pin would trade a translated date for a hydration mismatch.
 */
function formatUpdatedAt(updatedAt: Date, locale: Locale): string {
  return new Intl.DateTimeFormat(locale === 'ru' ? 'ru-RU' : 'en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'UTC',
  }).format(updatedAt);
}

export async function ProjectList({ projects }: { projects: readonly ProjectListItem[] }) {
  const t = await serverT();
  const locale = await currentLocale();

  if (projects.length === 0) {
    return (
      <Card data-testid="projects-empty">
        <CardHeader>
          <CardTitle>{t('projects.list.empty-title')}</CardTitle>
          <CardDescription>{t('projects.list.empty-body')}</CardDescription>
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
                    <span data-testid="project-chat-count">
                      {t('projects.list.chat-count', { count: project.sessionCount })}
                    </span>
                  )}
                  <span data-testid="project-stage" data-stage={project.stage}>
                    {project.stageLabel}
                  </span>
                  <time dateTime={project.updatedAt.toISOString()}>
                    {formatUpdatedAt(project.updatedAt, locale)}
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
