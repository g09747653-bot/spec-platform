import { type PhraseKey } from '../i18n/dictionary';

/**
 * The four views over a document, and the words for them (task 122; task 143).
 *
 * **Split out of `document-viewer.tsx` because that file now reads the request.** Printing copy on
 * the server means importing `next/headers`, and a module that does cannot appear anywhere in a
 * client component's graph — the docked pane is a client component and needs this union. The tabs
 * are the one thing the two halves of the viewer genuinely share, so they are what moves.
 *
 * **The label is a lookup, not the union member.** Both tab strips used to print the token itself
 * under a CSS `capitalize`, which is a machine identifier doing the work of a word. It survived
 * English by luck — each token happened to be its own noun — and the first Russian label would have
 * produced Title Case, which this interface does not use (Эталон §1.3, §7.1). The token keeps its
 * place in `data-view` and `data-testid`, where it addresses a test rather than a reader.
 */

export const VIEWS = ['outline', 'preview', 'raw', 'diff'] as const;

export type ViewerView = (typeof VIEWS)[number];

export const isViewerView = (value: string | undefined): value is ViewerView =>
  VIEWS.some((view) => view === value);

/** Keyed by the union, so a fifth view is a compile error here rather than a blank tab. */
export const VIEW_LABELS: Readonly<Record<ViewerView, PhraseKey>> = {
  outline: 'common.view-outline',
  preview: 'common.view-preview',
  raw: 'common.view-raw',
  diff: 'common.view-diff',
};
