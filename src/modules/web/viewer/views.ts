import { type PhraseKey } from '../i18n/dictionary';

/**
 * The four views over a document, and the words for them (task 122; task 143).
 *
 * **Split out of `document-viewer.tsx` because that file now reads the request.** Printing copy on
 * the server means importing `next/headers`, and a module that does cannot appear anywhere in a
 * client component's graph — the overlay is a client component and needs this union. The tabs
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

/**
 * The three that are ways of *reading the document*, which the overlay's switcher offers (task 147).
 *
 * The customer's video shows the outline as a panel dropped from its own button over the document,
 * not as a fourth pane replacing it — so «which of the four is showing» stopped being one question.
 * The union stays four members wide because the stored preference, the `1`–`4` keys and `data-view`
 * all name the outline among them; what splits off here is the smaller question the segmented
 * control asks, and having it in the type is what stops a fourth segment from appearing beside
 * Preview, Raw and Diff by accident.
 */
export const DOCUMENT_VIEWS = ['preview', 'raw', 'diff'] as const;

export type DocumentView = (typeof DOCUMENT_VIEWS)[number];

export const isDocumentView = (view: ViewerView): view is DocumentView => view !== 'outline';

export const isViewerView = (value: string | undefined): value is ViewerView =>
  VIEWS.some((view) => view === value);

/** Keyed by the union, so a fifth view is a compile error here rather than a blank tab. */
export const VIEW_LABELS: Readonly<Record<ViewerView, PhraseKey>> = {
  outline: 'common.view-outline',
  preview: 'common.view-preview',
  raw: 'common.view-raw',
  diff: 'common.view-diff',
};
