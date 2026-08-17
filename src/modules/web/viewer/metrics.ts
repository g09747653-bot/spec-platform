/**
 * How big a document is, in the three units a person asks about (task 138).
 *
 * The customer's request was for the viewer header to say what it is showing — lines, words, the
 * revision — the way the reference product does. The numbers therefore have to be the *same* numbers
 * a shell would print about the exported file, or the header is decoration:
 *
 * - **words** is `wc -w`: runs of non-whitespace, exactly.
 * - **lines** is the number of lines a reader counts, which equals `wc -l` for any file that ends
 *   with a newline (every exported document does) and is one greater for one that does not, because
 *   `wc -l` counts newline *characters* and a final line without one still has to be numbered in the
 *   Raw pane. Stated here rather than left to be discovered: the Raw gutter and this count must agree
 *   or one of them is lying.
 *
 * Pure, so both the pane and its test read the same function over the same bytes.
 */
export interface DocumentMetrics {
  lines: number;
  words: number;
  characters: number;
}

export function documentMetrics(content: string): DocumentMetrics {
  return {
    lines: lineCount(content),
    words: content.trim() === '' ? 0 : content.trim().split(/\s+/u).length,
    characters: content.length,
  };
}

/** The lines the Raw pane numbers. Empty content has none. */
export function lineCount(content: string): number {
  if (content === '') return 0;

  return content.replace(/\n$/u, '').split('\n').length;
}

/** `wc -l` — newline characters. Kept beside `lineCount` so the difference is written down once. */
export function newlineCount(content: string): number {
  return content.split('\n').length - 1;
}
