import type { BundleEntry } from '@/modules/methodologies';

/**
 * The Specs section of the sidebar (task 119; Эталон §1.5).
 *
 * One row per file the session's methodology produces — **including the ones it has not written
 * yet**, which is the point: a bundle is a promise of four documents, and a list that showed only
 * what exists would let a session look finished at two. A pending row says «not started», a written
 * one says its revision, and an approved one says so.
 *
 * The rows come from the same bundle plan the export panel uses — the caller computes it once and
 * hands it to both — so the sidebar and the ZIP cannot disagree about what the bundle is, including
 * about whether the optional Quality file is part of it (task 117).
 *
 * Server-rendered, so a new revision updates it on the page's own refresh rather than through a
 * second data path — the feed and this list read the same rows and are re-derived together.
 */
export interface SpecFileModel {
  specFileId: string | null;
  /** The storage slot, which is what the methodology's plan is keyed by. */
  specType: string;
  revisionCount: number;
  approved: boolean;
}

export interface SpecsPanelProps {
  /** The bundle this session's methodology promises, in order. */
  plan: readonly BundleEntry[];
  files: readonly SpecFileModel[];
}

function statusOf(file: SpecFileModel | undefined): { label: string; tone: string } {
  if (file === undefined || file.revisionCount === 0) {
    return { label: 'Not started', tone: 'text-ink-muted' };
  }
  if (file.approved) return { label: 'Approved', tone: 'text-green-700' };

  return { label: `Rev ${String(file.revisionCount)}`, tone: 'text-ink-muted' };
}

export function SpecsPanel({ plan, files }: SpecsPanelProps) {
  return (
    <section
      className="border-border-subtle flex flex-col gap-2 rounded-lg border p-3"
      data-testid="specs-panel"
    >
      <h2 className="text-sm font-medium">Specs</h2>

      <ul className="flex flex-col gap-1">
        {plan.map((document) => {
          const file = files.find((candidate) => candidate.specType === document.specType);
          const status = statusOf(file);

          return (
            <li
              key={document.fileName}
              className="flex items-baseline justify-between gap-2 text-sm"
              data-testid="specs-panel-row"
              data-file={document.fileName}
            >
              <span className="font-mono text-xs">{document.fileName}</span>
              <span className={`text-xs ${status.tone}`} data-testid="specs-panel-status">
                {status.label}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
