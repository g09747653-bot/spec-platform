/**
 * The heading tree of a markdown document, and the anchors that make it navigable (task 122).
 *
 * Pure, and tested on its own, because the interesting part is not "find the headings" — it is what
 * happens when two of them are called the same thing. Our documents do that constantly: every stage
 * of a spec bundle has an «Acceptance Criteria», and a table of contents whose entries all scroll to
 * the first one is a table of contents that is wrong in the ordinary case rather than the rare one.
 */

export interface OutlineHeading {
  /** ATX level: 1 for `#`, 2 for `##`, and so on. */
  level: number;
  text: string;
  /** Unique within the document — what the Preview pane's element carries and the link points at. */
  anchor: string;
  /** 0-based line in the source, so Raw can be scrolled to the same place. */
  line: number;
}

/** A fenced block, so a `#` inside example markdown is not read as a heading. */
const FENCE = /^\s{0,3}(?:```|~~~)/;

const ATX = /^(#{1,6})\s+(.*?)\s*#*\s*$/;

/**
 * Slugifies a heading the way an anchor should read: lowercase, words joined by hyphens, everything
 * else dropped. A heading of nothing but punctuation still needs an anchor, so it falls back to
 * `section`, and the disambiguator below makes even that unique.
 */
export function slugify(text: string): string {
  const slug = text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '');

  return slug === '' ? 'section' : slug;
}

/**
 * The document's headings, in order, each with a unique anchor.
 *
 * Duplicates are disambiguated by **occurrence**, `-2`, `-3`, exactly as GitHub does — so the second
 * «Acceptance Criteria» is `acceptance-criteria-2` and clicking it lands there rather than at the
 * first. The suffix is applied to the later occurrence, never to the first, so an anchor that was
 * correct before a duplicate appeared stays correct after it.
 */
export function outlineOf(markdown: string): OutlineHeading[] {
  const headings: OutlineHeading[] = [];
  const seen = new Map<string, number>();
  let fenced = false;

  markdown.split('\n').forEach((raw, index) => {
    if (FENCE.test(raw)) {
      fenced = !fenced;
      return;
    }
    if (fenced) return;

    const match = ATX.exec(raw);
    if (match === null) return;

    const level = (match[1] ?? '').length;
    const text = (match[2] ?? '').trim();
    if (text === '') return;

    const base = slugify(text);
    const count = (seen.get(base) ?? 0) + 1;
    seen.set(base, count);

    headings.push({
      level,
      text,
      anchor: count === 1 ? base : `${base}-${String(count)}`,
      line: index,
    });
  });

  return headings;
}
