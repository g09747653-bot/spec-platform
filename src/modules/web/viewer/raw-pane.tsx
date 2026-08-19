'use client';

import { useT } from '../i18n/locale-context';
import { Button } from '../ui/button';

import { useCopyContent } from './content';
import { linesOf } from './metrics';

/**
 * The Raw pane (task 122 AC-3), with the line numbers the customer asked for (task 138), wrapping
 * the way his video shows (task 147; амендмент А-17 §4).
 *
 * **The bytes, untouched.** The text below is the stored revision put into a `<pre>`, so what a
 * reader sees is what is stored — no fences added, no whitespace normalised, nothing fetched. That
 * is the half of AC-3 a test can compare byte for byte against the row, and it is why the numbers
 * are a CSS counter rather than elements: a number printed inside `viewer-raw` would be a byte that
 * is not in the file. `linesOf` splits the document into one span per logical line, each carrying
 * its own newline, so concatenating the spans reproduces the file exactly — `globals.css` explains
 * the other half of the arrangement, and `metrics.test.ts` asserts the identity.
 *
 * **Long lines wrap; nothing scrolls sideways.** The gutter numbers logical lines, so a line wider
 * than the well continues on the next visual line without a number of its own — which the old
 * parallel `<ol>` could not do at all, because it aligned only while every logical line occupied
 * exactly one line box. The well therefore stops owning a sideways scroll: there is nothing left to
 * scroll to.
 *
 * **The copy goes through the task-74 endpoint**, which is the other half of AC-3, and it names the
 * revision it is showing — see `content.ts` for the silent-wrong-revision defect that closed.
 */
export function RawPane({
  specFileId,
  content,
  /** Which revision these bytes are, so the copy is of them and not of the exported one. */
  revision = null,
  /** Off while a document is still being written, and off where the header carries its own Copy. */
  copyable = true,
}: {
  specFileId: string;
  content: string;
  revision?: number | null;
  copyable?: boolean;
}) {
  const t = useT();
  const { state, copy } = useCopyContent(specFileId, revision);
  const lines = linesOf(content);

  return (
    <div className="flex min-h-0 flex-col gap-2">
      {copyable && (
        <div className="flex items-center gap-3">
          <Button size="sm" variant="secondary" data-testid="viewer-copy" onClick={copy}>
            {t('viewer.raw.copy')}
          </Button>
          {state !== 'idle' && (
            <span
              role="status"
              data-testid="viewer-copy-status"
              className={
                state === 'copied' ? 'text-foreground-muted text-xs' : 'text-xs text-danger-ink'
              }
            >
              {t(state === 'copied' ? 'viewer.copy.done' : 'viewer.copy.failed')}
            </span>
          )}
        </div>
      )}

      {/*
        The well keeps its test id and loses its sideways scroll (task 147).

        It was the element that scrolled when the customer met D-205, and the walk that proved the
        pane had stayed put measured it. Both halves of that measurement are still wanted — the
        difference is that «the long line is reachable» is now answered by the wrap rather than by a
        scrollbar, so the well is asserted *not* to scroll and the page still may not either.
      */}
      <div
        data-testid="viewer-raw-well"
        className="bg-background border-border-subtle rounded-md border"
      >
        {/*
          The left padding is `.raw-lines`'s and there is no `pl-*` here on purpose: Tailwind's
          utilities layer outranks the components layer whatever the specificity, so a left padding
          utility would quietly overwrite the room the counters are painted into and drop every
          number on top of the text.
        */}
        <pre
          data-testid="viewer-raw"
          data-lines={String(lines.length)}
          className="raw-lines py-3 pr-3 font-mono text-xs leading-5"
        >
          {lines.map((line, index) => (
            <span key={index} className="raw-line">
              {line}
            </span>
          ))}
        </pre>
      </div>
    </div>
  );
}
