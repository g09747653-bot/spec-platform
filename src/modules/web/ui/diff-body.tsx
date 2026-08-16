import { cn } from '../lib/cn';

/**
 * A unified diff, in green and red (task 127; Эталон §5.1 «Diff Preview»).
 *
 * One renderer, three callers: the refinement card of M4, the viewer's Diff view, and the revert
 * preview. It had been copied twice — the same twelve lines in `proposal-block.tsx` and
 * `document-viewer.tsx` — which is two places for "what does a `+` line look like" to answer
 * differently, and exactly the drift the token system exists to stop.
 *
 * **The colours are tokens** (`diff-added`, `diff-removed`), so a line that reads as added in the
 * light theme reads as added in the dark one. A tinted background as well as coloured text: on a
 * dense document the marker column alone is easy to lose, and the tint is what makes the shape of a
 * change visible before any of it is read.
 */
export function DiffBody({
  unifiedDiff,
  testId = 'diff-body',
  className,
}: {
  unifiedDiff: string;
  testId?: string;
  className?: string;
}) {
  return (
    <pre
      data-testid={testId}
      className={cn(
        'bg-background border-border-subtle max-h-72 overflow-auto rounded-md border p-3 text-xs whitespace-pre',
        className,
      )}
    >
      {unifiedDiff.split('\n').map((line, index) => (
        <span
          key={`${String(index)}-${line}`}
          data-diff-line={lineKind(line)}
          className={LINE_CLASS[lineKind(line)]}
        >
          {line === '' ? ' ' : line}
        </span>
      ))}
    </pre>
  );
}

type DiffLineKind = 'added' | 'removed' | 'hunk' | 'context';

/** `+++`/`---` are file headers, not changed lines — the reason the check is not just the marker. */
function lineKind(line: string): DiffLineKind {
  if (line.startsWith('+') && !line.startsWith('+++')) return 'added';
  if (line.startsWith('-') && !line.startsWith('---')) return 'removed';
  if (line.startsWith('@@')) return 'hunk';

  return 'context';
}

const LINE_CLASS: Record<DiffLineKind, string> = {
  added: 'text-diff-added-ink bg-diff-added-soft block',
  removed: 'text-diff-removed-ink bg-diff-removed-soft block',
  hunk: 'text-foreground-muted block',
  context: 'block',
};
