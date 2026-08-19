import Link from 'next/link';

import type { BundleEntry } from '@/modules/methodologies';

import type { PhraseKey } from '../i18n/dictionary';
import type { PhraseParams } from '../i18n/phrase';
import { serverT } from '../i18n/server-locale';

import { SidePanel } from './side-panel';

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

/**
 * The three states a row can be in, as a phrase, a colour and a token (task 143).
 *
 * `kind` is the same distinction the label already draws, said in a way that survives translation:
 * a walk that recognised «Approved» by reading it would stop recognising anything the moment the
 * chrome is written in Russian, and «Rev 2» is not a state anyone can match on at all.
 *
 * The words themselves are a key rather than a sentence, and the key is resolved by the caller: the
 * three states must agree in gender with the thing they describe — a document is «Одобрен», not
 * «Одобрено» — so they belong beside this surface rather than in the shared dictionary, and a
 * function that returned a rendered string would need a translator this deep for nothing.
 */
function statusOf(file: SpecFileModel | undefined): {
  phrase: PhraseKey;
  params?: PhraseParams;
  tone: string;
  kind: 'not-started' | 'draft' | 'approved';
} {
  if (file === undefined || file.revisionCount === 0) {
    return {
      phrase: 'session.specs.status-not-started',
      tone: 'text-foreground-muted',
      kind: 'not-started',
    };
  }
  if (file.approved) {
    return { phrase: 'session.specs.status-approved', tone: 'text-success-ink', kind: 'approved' };
  }

  return {
    phrase: 'common.revision-badge',
    params: { revision: file.revisionCount },
    tone: 'text-foreground-muted',
    kind: 'draft',
  };
}

export async function SpecsPanel({ plan, files }: SpecsPanelProps) {
  const t = await serverT();

  return (
    <SidePanel title={t('session.specs.title')} testId="specs-panel">
      <ul className="flex flex-col gap-1.5">
        {plan.map((document) => {
          const file = files.find((candidate) => candidate.specType === document.specType);
          const status = statusOf(file);

          return (
            <li
              key={document.fileName}
              className="flex items-baseline justify-between gap-3 text-sm"
              data-testid="specs-panel-row"
              data-file={document.fileName}
            >
              {/*
               * A written file opens in the viewer (task 122); one that does not exist yet is not a
               * link, because there is nothing to open. That is the whole of "click opens the
               * viewer" — the row is the same row either way, and its status already says which.
               */}
              {file?.specFileId == null || file.revisionCount === 0 ? (
                <span className="text-foreground-muted truncate font-mono text-xs">
                  {document.fileName}
                </span>
              ) : (
                <Link
                  href={`/specs/${file.specFileId}`}
                  className="truncate font-mono text-xs hover:underline"
                  data-testid="specs-panel-open"
                >
                  {document.fileName}
                </Link>
              )}
              <span className="flex shrink-0 items-baseline gap-2">
                {/*
                 * Straight to the Diff view of the newest revision (task 127; Эталон §5.1 — «Diff
                 * Preview из сайдбара»). Offered only from the second revision on, because a file
                 * with one has nothing to compare against, and the viewer would open on a pane that
                 * says so. The link is the viewer's own URL state (task 122 AC-4), not a second
                 * surface.
                 */}
                {file?.specFileId != null && file.revisionCount > 1 && (
                  <Link
                    href={`/specs/${file.specFileId}?view=diff`}
                    className="text-primary-ink text-xs hover:underline"
                    data-testid="specs-panel-diff"
                  >
                    {t('common.view-diff')}
                  </Link>
                )}
                <span
                  className={`text-xs whitespace-nowrap ${status.tone}`}
                  data-testid="specs-panel-status"
                  data-status={status.kind}
                >
                  {t(status.phrase, status.params)}
                </span>
              </span>
            </li>
          );
        })}
      </ul>
    </SidePanel>
  );
}
