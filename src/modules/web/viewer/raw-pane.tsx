'use client';

import { useState } from 'react';

import { Button } from '../ui/button';

/**
 * The Raw pane (task 122 AC-3).
 *
 * **The bytes, server-rendered.** The text below is the stored revision put straight into a `<pre>`,
 * so what a reader sees is what is stored — no fences added, no whitespace normalised, nothing
 * fetched. That is the half of AC-3 a test can compare byte for byte against the row.
 *
 * **The copy goes through the task-74 endpoint**, which is the other half. That endpoint is the one
 * place that decides which bytes a *copy* of this file consists of, resolving the export mode the
 * same way the archive does — so a copied file and the same file inside the ZIP agree by
 * construction (FR-016 AC-5). Copying from the DOM instead would be a second answer to that
 * question, and the two would drift the first time export mode mattered.
 */
export function RawPane({ specFileId, content }: { specFileId: string; content: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');

  async function copy() {
    try {
      const response = await fetch(`/api/specs/${specFileId}/content`);
      if (!response.ok) {
        setState('failed');
        return;
      }

      await navigator.clipboard.writeText(await response.text());
      setState('copied');
    } catch {
      setState('failed');
    }
  }

  return (
    <div className="flex flex-col gap-2">
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
            className={state === 'copied' ? 'text-ink-muted text-xs' : 'text-xs text-red-700'}
          >
            {state === 'copied'
              ? 'Copied the approved revision to the clipboard.'
              : 'That copy did not go through.'}
          </span>
        )}
      </div>

      <pre
        data-testid="viewer-raw"
        className="bg-canvas border-border-subtle overflow-auto rounded-md border p-3 text-xs whitespace-pre-wrap"
      >
        {content}
      </pre>
    </div>
  );
}
