import Link from 'next/link';
import { notFound } from 'next/navigation';

import { getDatabase } from '@/db/client';
import { methodologiesForChatClass, methodologyConfig } from '@/modules/methodologies';
import { requireOwnerScope } from '@/modules/projects/auth/scope';
import { createProjectRepository } from '@/modules/projects/repositories/projects';
import { createSessionRepository } from '@/modules/projects/repositories/sessions';
import { createSpecFileRepository } from '@/modules/specs/repositories/spec-files';
import { PageBody } from '@/modules/web';
import { ChatList, type ChatListItem } from '@/modules/web/projects/chat-list';
import { McpCard } from '@/modules/web/projects/mcp-card';
import { NewEditChat } from '@/modules/web/projects/new-edit-chat';
import { stageLabel } from '@/modules/web/session/stage-display';

/**
 * The project page: the bundle's conversations (task 120; Эталон §1.5).
 *
 * Since А-6 a project holds many chats, so this is the page that lists them — Generate on one tab,
 * Edit on the other, with a search box and an Active / Archived / All filter that **compose**.
 *
 * All three live in the URL and are resolved in SQL. That is what makes "searching within Archived
 * works" true rather than nearly true: a client-side filter over the rows this page happened to load
 * would silently mean "search the Active tab", because those are the only rows it would have.
 *
 * Nothing here reads a clock in the browser. The age of a chat arrives already computed, in seconds,
 * from the same database that stamped the rows (task 120 AC-2).
 */

const TABS = [
  { key: 'generate', label: 'Generate' },
  { key: 'edit', label: 'Edit' },
] as const;

const FILTERS = [
  { key: 'active', label: 'Active' },
  { key: 'archived', label: 'Archived' },
  { key: 'all', label: 'All' },
] as const;

type TabKey = (typeof TABS)[number]['key'];
type FilterKey = (typeof FILTERS)[number]['key'];

const isTab = (value: string | undefined): value is TabKey => TABS.some((tab) => tab.key === value);

const isFilter = (value: string | undefined): value is FilterKey =>
  FILTERS.some((filter) => filter.key === value);

/** The current search as a URL, so a tab or filter link keeps the other two settings. */
function linkTo(projectId: string, params: Record<string, string>): string {
  const query = new URLSearchParams(
    Object.entries(params).filter(([, value]) => value !== '' && value !== 'generate'),
  );
  const search = query.toString();

  return search === '' ? `/projects/${projectId}` : `/projects/${projectId}?${search}`;
}

export default async function ProjectPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const scope = await requireOwnerScope();
  const db = getDatabase();

  const project = await createProjectRepository(db).findById(scope, id);
  if (project === null) notFound();

  const first = (value: string | string[] | undefined): string | undefined =>
    Array.isArray(value) ? value[0] : value;

  const tab: TabKey = isTab(first(query.tab)) ? (first(query.tab) as TabKey) : 'generate';
  const filter: FilterKey = isFilter(first(query.show))
    ? (first(query.show) as FilterKey)
    : 'active';
  const search = first(query.q) ?? '';

  /*
   * The tab, expressed as the methodology ids of that chat class. The page asks the registry rather
   * than naming ids, so a methodology added later appears under its own class without an edit here —
   * which is the whole point of methodologies being data (task 116).
   */
  const methodologyIds = methodologiesForChatClass(tab).map((config) => config.id);

  const [chats, approved] = await Promise.all([
    createSessionRepository(db).listForProject(scope, project.id, {
      methodologyIds,
      archived: filter,
      search,
    }),
    createSpecFileRepository(db).approvedFiles(scope, project.id),
  ]);

  const bundleConfig = methodologyConfig(project.methodologyId);
  const exportedName = (specType: string): string =>
    bundleConfig.stages.find((stage) => stage.document?.specType === specType)?.document
      ?.fileName ?? `${specType}.md`;

  const rows: ChatListItem[] = chats.map((chat) => {
    const config = methodologyConfig(chat.methodologyId);

    return {
      id: chat.id,
      title: chat.title,
      archived: chat.archived,
      badge: `${config.badge.vendor} · ${config.badge.flavour} · ${config.badge.version}`,
      // The chat's own methodology names its position (task 132), so the list agrees with the
      // header of the conversation it links to rather than printing the canonical seven at it.
      stageLabel: stageLabel(chat.stage, chat.methodologyId),
      completed: chat.completionCount > 0,
      bundleLabel: `${String(approved.length)}/${String(bundleConfig.stages.filter((stage) => stage.document !== null && !stage.optional).length)} approved`,
      ageSeconds: chat.ageSeconds,
    };
  });

  return (
    <PageBody>
      <section className="flex flex-col gap-6" data-testid="project-page">
        <div className="flex flex-col gap-1">
          <h1 className="text-h1" data-testid="project-page-name">
            {project.name}
          </h1>
          {/*
          The project's own description (task 133; row `1.5-3`… `1.5-4`; Эталон §1.5).

          It was loaded and thrown away: the page printed the name and a sentence about archiving,
          and a visitor with three projects called «A tool that tracks which of a small charity's
          grant…» had nothing on this page to tell them apart. The text is the grounding prompt —
          the words the user typed — clamped to two lines with the whole of it in `title`, which is
          the reference's own tooltip.
        */}
          <p
            className="text-foreground-muted line-clamp-2 max-w-[60rem] text-sm"
            data-testid="project-description"
            title={project.initialPrompt}
          >
            {project.initialPrompt}
          </p>
          <p className="text-foreground-muted text-xs">
            Every conversation about this bundle. Archiving hides a chat from Active and changes
            nothing else.
          </p>
        </div>

        <nav className="flex flex-wrap items-center gap-4" aria-label="Chat class">
          <span className="flex gap-2">
            {TABS.map((entry) => (
              <Link
                key={entry.key}
                href={linkTo(project.id, { tab: entry.key, show: filter, q: search })}
                data-testid={`tab-${entry.key}`}
                data-state={tab === entry.key ? 'current' : 'available'}
                className={
                  tab === entry.key
                    ? 'border-border bg-surface rounded-md border px-3 py-1.5 text-sm font-medium'
                    : 'text-foreground-muted rounded-md px-3 py-1.5 text-sm hover:underline'
                }
              >
                {entry.label}
              </Link>
            ))}
          </span>

          <span className="flex gap-2" data-testid="chat-filters">
            {FILTERS.map((entry) => (
              <Link
                key={entry.key}
                href={linkTo(project.id, { tab, show: entry.key, q: search })}
                data-testid={`filter-${entry.key}`}
                data-state={filter === entry.key ? 'current' : 'available'}
                className={
                  filter === entry.key
                    ? 'border-border bg-surface rounded-md border px-3 py-1.5 text-xs font-medium'
                    : 'text-foreground-muted rounded-md px-3 py-1.5 text-xs hover:underline'
                }
              >
                {entry.label}
              </Link>
            ))}
          </span>

          {/*
           * A GET form, so the search is a URL. That is what lets it compose with the tab and the
           * filter — they are hidden fields of the same form — and what makes a searched view
           * something a person can reload, bookmark or come back to.
           */}
          <form method="GET" action={`/projects/${project.id}`} className="flex items-center gap-2">
            <input type="hidden" name="tab" value={tab} />
            <input type="hidden" name="show" value={filter} />
            <label className="sr-only" htmlFor="chat-search">
              Search chats
            </label>
            <input
              id="chat-search"
              name="q"
              defaultValue={search}
              placeholder="Search by name"
              data-testid="chat-search"
              className="border-border-subtle bg-surface rounded-md border px-3 py-1.5 text-sm"
            />
            <button
              type="submit"
              data-testid="chat-search-submit"
              className="border-border-subtle rounded-md border px-3 py-1.5 text-sm"
            >
              Search
            </button>
          </form>
        </nav>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <ChatList chats={rows} />

          <div className="flex flex-col gap-4">
            <NewEditChat
              projectId={project.id}
              files={approved.map((file) => ({
                specFileId: file.specFileId,
                fileName: exportedName(file.specType),
                revisionNumber: file.revisionNumber,
              }))}
            />

            <McpCard />
          </div>
        </div>
      </section>
    </PageBody>
  );
}
