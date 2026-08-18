import type { ReactNode } from 'react';

/**
 * One section of the sidebar (tasks 137, 139).
 *
 * The four panels used to be three different shapes: two hand-rolled `<section>`s with an `h2` in
 * body type, and one full `Card` with a five-line description written for a page rather than for a
 * column. Side by side in a 300-pixel pane, that reads as three unrelated widgets stacked on top of
 * each other — which is exactly what "the design is poor" means when someone says it about a
 * product whose colours are fine.
 *
 * So: one shape. A quiet uppercase label, an optional action on the same line, and the content
 * underneath. The reference sets its sidebar headings the same way and for the same reason — the
 * panel titles are signposts, not headlines, and should not compete with the document names below
 * them.
 *
 * **The title arrives as a word, not as a dictionary key** (task 143). Three of the four panels are
 * client components and the fourth is rendered on the server, so the two ways of reaching the
 * translator meet here — and a component that took a key would have to choose one of them and shut
 * the other half of the application out. Each panel translates its own heading and passes the
 * result, which is the same rule the shell already applies to anything rendered from both sides.
 */
export function SidePanel({
  title,
  action,
  children,
  testId,
}: {
  title: string;
  /** A control that belongs to the section — «Add», usually. Optional. */
  action?: ReactNode;
  children: ReactNode;
  testId: string;
}) {
  return (
    <section
      className="border-border-subtle flex shrink-0 flex-col gap-2 rounded-lg border p-3"
      data-testid={testId}
    >
      <div className="flex min-h-6 items-center justify-between gap-2">
        <h2 className="text-label text-foreground-muted tracking-widest uppercase">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}
