'use client';

import { useState } from 'react';

import { Button } from '../ui/button';
import { showToast } from '../ui/toast';

import { lineCount } from './metrics';

/**
 * The Raw pane (task 122 AC-3), with the line numbers the customer asked for (task 138).
 *
 * **The bytes, untouched.** The text below is the stored revision put straight into a `<pre>`, so
 * what a reader sees is what is stored — no fences added, no whitespace normalised, nothing fetched.
 * That is the half of AC-3 a test can compare byte for byte against the row, and it is why the
 * numbers live in a **separate gutter element** rather than being woven into the text: a number
 * printed inside `viewer-raw` would be a byte that is not in the file.
 *
 * The gutter is `aria-hidden` and the lines do not wrap. Both follow from what a line number is for:
 * it names the nth line of the file, so a soft-wrapped line would put number 41 beside the middle of
 * line 40, and a screen reader would read the whole column of digits before reaching the document.
 * Long lines scroll sideways inside this pane, which is the pane's business and not the page's.
 *
 * **The copy goes through the task-74 endpoint**, which is the other half of AC-3. That endpoint is
 * the one place that decides which bytes a *copy* of this file consists of, resolving the export mode
 * the same way the archive does — so a copied file and the same file inside the ZIP agree by
 * construction (FR-016 AC-5). Copying from the DOM instead would be a second answer to that
 * question, and the two would drift the first time export mode mattered.
 */
export function RawPane({
  specFileId,
  content,
  /** Off while a document is still being written: there is nothing stored to copy yet. */
  copyable = true,
}: {
  specFileId: string;
  content: string;
  copyable?: boolean;
}) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const lines = lineCount(content);

  async function copy() {
    try {
      const response = await fetch(`/api/specs/${specFileId}/content`);
      if (!response.ok) {
        setState('failed');
        showToast('That copy did not go through.', 'danger');
        return;
      }

      await navigator.clipboard.writeText(await response.text());
      setState('copied');
      showToast('Copied the approved revision to the clipboard.', 'success');
    } catch {
      setState('failed');
      showToast('That copy did not go through.', 'danger');
    }
  }

  return (
    <div className="flex min-h-0 flex-col gap-2">
      {copyable && (
        <div className="flex items-center gap-3">
          <Button
            size="sm"
            variant="secondary"
            data-testid="viewer-copy"
            onClick={() => {
              void copy();
            }}
          >
            Copy markdown
          </Button>
          {state !== 'idle' && (
            <span
              role="status"
              data-testid="viewer-copy-status"
              className={
                state === 'copied' ? 'text-foreground-muted text-xs' : 'text-xs text-danger-ink'
              }
            >
              {state === 'copied'
                ? 'Copied the approved revision to the clipboard.'
                : 'That copy did not go through.'}
            </span>
          )}
        </div>
      )}

      {/*
        The well owns the sideways scroll, and the test id is here so a walk can say so (task 142).

        Nothing about this element changed with the clipping fix — it was always the thing that
        scrolls. What the customer met was that the row two levels above it had grown to the width of
        the longest line, so the well was scrolling correctly at an x-offset off the side of the
        screen. The id makes «the pane stayed put and this scrolled» a measurement rather than an
        inference.
      */}
      <div
        data-testid="viewer-raw-well"
        className="bg-background border-border-subtle flex overflow-auto rounded-md border"
      >
        <ol
          aria-hidden
          data-testid="viewer-raw-gutter"
          data-lines={String(lines)}
          className="text-foreground-muted border-border-subtle bg-surface sticky left-0 shrink-0 border-r px-2 py-3 text-right font-mono text-xs leading-5 tabular-nums select-none"
        >
          {Array.from({ length: lines }, (_, index) => (
            <li key={index}>{index + 1}</li>
          ))}
        </ol>

        <pre
          data-testid="viewer-raw"
          className="min-w-0 flex-1 px-3 py-3 font-mono text-xs leading-5 whitespace-pre"
        >
          {content}
        </pre>
      </div>
    </div>
  );
}
