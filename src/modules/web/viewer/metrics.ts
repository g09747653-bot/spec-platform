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

/**
 * The document as the lines the Raw pane paints, **each carrying its own newline** (task 147).
 *
 * The wrap the reference does — a long line continuing on the next visual line without a number —
 * needs one element per logical line, so that a number can be attached to the line rather than to a
 * row of a parallel gutter. That element is where the danger is: `viewer-raw`'s `textContent` is
 * compared with the stored bytes, so the pieces have to *be* the bytes. Hence the newline travels
 * with the line it ends rather than being dropped by the split and added back by the stylesheet:
 * `linesOf(content).join('') === content` for every input, which is asserted in `metrics.test.ts`
 * over the five cases that can differ — empty, no trailing newline, trailing newline, a blank line
 * in the middle, and CRLF (whose `\r` stays inside its line, where the file has it).
 *
 * A file that ends with a newline has no empty last line: the trailing `\n` terminates the last
 * line, it does not begin another. That is the same rule `lineCount` has always applied, which is
 * why `lineCount` is now this function's length — one answer to «how many lines», so the header's
 * count and the numbers down the gutter cannot disagree.
 */
export function linesOf(content: string): string[] {
  const parts = content.split('\n');
  const terminated = parts.at(-1) === '';
  const lines = terminated ? parts.slice(0, -1) : parts;

  return lines.map((line, index) =>
    !terminated && index === lines.length - 1 ? line : `${line}\n`,
  );
}

/** The lines the Raw pane numbers. Empty content has none. */
export function lineCount(content: string): number {
  return linesOf(content).length;
}

/** `wc -l` — newline characters. Kept beside `lineCount` so the difference is written down once. */
export function newlineCount(content: string): number {
  return content.split('\n').length - 1;
}
