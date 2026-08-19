'use client';

import { useState } from 'react';

import { useT } from '../i18n/locale-context';
import { showToast } from '../ui/toast';

/**
 * Where a copy and a download of one document get their bytes (tasks 74, 122, 147; FR-016 AC-5).
 *
 * **One address, so the two controls cannot disagree.** Copy and Download are the same promise made
 * twice — «take this document away with you» — and the only way to keep them byte-identical is for
 * them to ask the same endpoint the same question. Neither reads the DOM: the pane on screen is a
 * rendering, and a rendering is a place characters can be introduced.
 *
 * **`?rev=` is the question, and its absence was a defect** (task 147). Without it the endpoint
 * answers «which bytes would be *exported*», which resolves through the export mode to the latest
 * approved revision. That is the right answer for the export panel and the wrong one for a viewer:
 * a reader looking at Rev 1 of a file whose Rev 3 is approved pressed Copy and got Rev 3, silently,
 * with a toast saying it had worked. Both viewer surfaces now name the revision they are showing,
 * so what is on screen, what is on the clipboard and what lands in the downloads folder are one
 * thing. A draft still being written names none — there are no stored bytes yet — and neither
 * control is offered.
 */
export function contentUrl(specFileId: string, revision: number | null): string {
  return `/api/specs/${specFileId}/content${revision === null ? '' : `?rev=${String(revision)}`}`;
}

export type CopyState = 'idle' | 'copied' | 'failed';

/**
 * Copying that document, for whichever surface is asking.
 *
 * A hook rather than a button, because the two callers differ in everything except the behaviour:
 * the overlay's header carries a compact control beside Download, the standalone page carries a
 * labelled one with its own status line. What must not differ is which bytes leave, and that is
 * exactly what lives here.
 */
export function useCopyContent(
  specFileId: string,
  revision: number | null,
): { state: CopyState; copy: () => void } {
  const t = useT();
  const [state, setState] = useState<CopyState>('idle');

  async function run(): Promise<void> {
    const failed = () => {
      setState('failed');
      showToast(t('viewer.copy.failed'), 'danger', 'raw-copy-failed');
    };

    try {
      const response = await fetch(contentUrl(specFileId, revision));

      if (!response.ok) {
        failed();
        return;
      }

      await navigator.clipboard.writeText(await response.text());
      setState('copied');
      showToast(t('viewer.copy.done'), 'success', 'raw-copied');
    } catch {
      failed();
    }
  }

  return {
    state,
    copy: () => {
      void run();
    },
  };
}
