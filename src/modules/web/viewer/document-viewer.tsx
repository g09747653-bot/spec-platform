import Link from 'next/link';

import { DiffBody } from '../ui/diff-body';

import { Markdown } from './markdown';
import { outlineOf } from './outline';
import { RawPane } from './raw-pane';

/**
 * The document viewer (task 122; Эталон §5.1).
 *
 * Four views over one revision — Outline, Preview, Raw, Diff — and a switcher over the file's
 * revisions with the verdict each one got. **Read-only, deliberately:** every way of changing a
 * document already has a surface (approve on the card, refine in the composer, edit in an Edit
 * chat), and a fifth one here would be a second write path to keep in step with the gates.
 *
 * **The state is in the URL** (AC-4). Which view and which revision are `?view=` and `?rev=`, so a
 * reload restores what the reader was looking at, and a link to «the diff of Rev 3» is a link
 * somebody can send. That also makes this a server component: nothing here needs to be interactive
 * except the copy button, which is its own island.
 */

export const VIEWS = ['outline', 'preview', 'raw', 'diff'] as const;

export type ViewerView = (typeof VIEWS)[number];

export const isViewerView = (value: string | undefined): value is ViewerView =>
  VIEWS.some((view) => view === value);

export interface ViewerRevision {
  revisionNumber: number;
  approved: boolean;
  /** The review's decision on this revision, or `null` when it was never reviewed. */
  verdict: string | null;
  createdAt: Date;
}

export interface DocumentViewerProps {
  specFileId: string;
  fileName: string;
  /** Where «back» goes: the chat this document belongs to. */
  sessionHref: string;
  view: ViewerView;
  revisions: readonly ViewerRevision[];
  current: { revisionNumber: number; content: string };
  /** The revision before this one, or `null` when this is the first (AC-1). */
  previous: { revisionNumber: number; content: string } | null;
  unifiedDiff: string | null;
}

function href(specFileId: string, view: ViewerView, revisionNumber: number): string {
  return `/specs/${specFileId}?view=${view}&rev=${String(revisionNumber)}`;
}

function Tabs({
  specFileId,
  view,
  revisionNumber,
}: {
  specFileId: string;
  view: ViewerView;
  revisionNumber: number;
}) {
  return (
    <nav className="flex gap-2" aria-label="View" data-testid="viewer-tabs">
      {VIEWS.map((candidate) => (
        <Link
          key={candidate}
          href={href(specFileId, candidate, revisionNumber)}
          data-testid={`viewer-tab-${candidate}`}
          data-state={view === candidate ? 'current' : 'available'}
          className={
            view === candidate
              ? 'border-border bg-surface rounded-md border px-3 py-1.5 text-sm font-medium capitalize'
              : 'text-foreground-muted rounded-md px-3 py-1.5 text-sm capitalize hover:underline'
          }
        >
          {candidate}
        </Link>
      ))}
    </nav>
  );
}

export function DocumentViewer({
  specFileId,
  fileName,
  sessionHref,
  view,
  revisions,
  current,
  previous,
  unifiedDiff,
}: DocumentViewerProps) {
  const outline = outlineOf(current.content);

  return (
    <section className="flex flex-col gap-4" data-testid="viewer">
      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-h2" data-testid="viewer-file-name">
            {fileName}
          </h1>
          <span className="text-foreground-muted text-sm" data-testid="viewer-revision">
            Rev {current.revisionNumber}
          </span>
          <Link href={sessionHref} className="text-foreground-muted text-xs hover:underline">
            Back to the chat
          </Link>
        </div>

        <Tabs specFileId={specFileId} view={view} revisionNumber={current.revisionNumber} />

        <ul className="flex flex-wrap gap-2" data-testid="viewer-revisions">
          {revisions.map((revision) => (
            <li key={revision.revisionNumber}>
              <Link
                href={href(specFileId, view, revision.revisionNumber)}
                data-testid={`viewer-revision-${String(revision.revisionNumber)}`}
                data-state={
                  revision.revisionNumber === current.revisionNumber ? 'current' : 'available'
                }
                className={
                  revision.revisionNumber === current.revisionNumber
                    ? 'border-border bg-surface rounded-md border px-2 py-1 text-xs font-medium'
                    : 'text-foreground-muted rounded-md px-2 py-1 text-xs hover:underline'
                }
              >
                Rev {revision.revisionNumber}
                <span className="text-foreground-muted ml-1">
                  {revision.verdict ?? (revision.approved ? 'approved' : 'draft')}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </header>

      {view === 'outline' && (
        <nav data-testid="viewer-outline" className="flex flex-col gap-1">
          {outline.length === 0 ? (
            <p className="text-foreground-muted text-sm">This revision has no headings.</p>
          ) : (
            outline.map((heading) => (
              <Link
                key={heading.anchor}
                href={`${href(specFileId, 'preview', current.revisionNumber)}#${heading.anchor}`}
                data-testid="viewer-outline-entry"
                data-anchor={heading.anchor}
                className="hover:bg-background rounded px-2 py-1 text-sm"
                style={{ paddingLeft: `${String((heading.level - 1) * 0.75 + 0.5)}rem` }}
              >
                {heading.text}
              </Link>
            ))
          )}
        </nav>
      )}

      {view === 'preview' && <Markdown content={current.content} />}

      {view === 'raw' && <RawPane specFileId={specFileId} content={current.content} />}

      {view === 'diff' &&
        (previous === null || unifiedDiff === null ? (
          /*
           * AC-1: the first revision has no predecessor, and says so. Not an error and not an empty
           * pane — «nothing to compare against» is the true answer, and a diff view that threw on
           * Rev 1 would make the tab a trap on every newly written document.
           */
          <p className="text-sm" data-testid="viewer-diff-empty">
            This is the first revision of {fileName} — there is no earlier one to compare it with.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            <p className="text-foreground-muted text-xs" data-testid="viewer-diff-caption">
              Rev {previous.revisionNumber} → Rev {current.revisionNumber}
            </p>
            <DiffBody unifiedDiff={unifiedDiff} testId="viewer-diff" />
          </div>
        ))}
    </section>
  );
}
