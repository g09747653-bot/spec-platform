import {
  defineSectionList,
  stripTemplateAnnotation,
  type SectionList,
} from '@/modules/specs/validate-structure';

import { VENDORED_TEMPLATES, type VendoredTemplateId } from './vendored';

/**
 * A methodology document's required sections, read out of its template (task 116).
 *
 * The section list of a foreign methodology is **parsed from the vendored file**, never typed out
 * beside it. Two reasons, and the second is the one that matters:
 *
 * 1. A hand-copied list is a second spelling of the upstream template — the same duplication
 *    constitution P3 forbids for the parity baseline, applied one level out. `pnpm` regenerates the
 *    template module from the markdown, the markdown is the upstream bytes, and the headings are read
 *    from those bytes; there is nowhere for a stale copy to hide.
 * 2. Writing the headings out as string literals would be typing `'Success Criteria'` and
 *    `'Core Principles'` into our own source — both of which *are* baseline headings — and the lint
 *    rule that guards P3 would (correctly) refuse the file. Parsing sidesteps that by never naming
 *    them.
 *
 * **What counts as a required heading.** A template mixes fixed sections with scaffolding a filler is
 * meant to replace, and only the fixed ones can be asserted. A level-2 heading is required when it
 * survives three tests: it carries no `[PLACEHOLDER]`, no HTML comment, and no ordinal — no digit and
 * no single-letter stand-in like the `N` of spec-kit's «Phase N». `## Phase 1: Setup` is a real
 * heading of a real document, but the number of phases is the change's business, not the
 * methodology's, so requiring it would fail documents that are perfectly well-formed.
 *
 * Annotations like `*(mandatory)*` are stripped — by `stripTemplateAnnotation`, which the structural
 * check imports too. Sharing that one function is not tidiness: while the rule lived here alone, the
 * extractor removed the annotation and the check demanded the bare heading, so a document that
 * reproduced the vendored template *exactly* — annotation and all, which is what spec-kit's own
 * output looks like — was rejected for a suffix the template prescribes. What the writer is shown
 * and what the writer is judged by have to be the same list.
 */

const ATX_LEVEL_2 = /^ {0,3}##[ \t]+(.+?)[ \t]*$/;
const PLACEHOLDER = /\[[^\]]*\]/;
const HTML_COMMENT = /<!--[\s\S]*?-->/g;
const ORDINAL = /(^|\s)(\d+|[A-Z])(\.|:|\)|\b)/;

/** The stable level-2 headings of a template, in document order. May be empty. */
export function stableHeadings(template: string): string[] {
  const headings: string[] = [];

  for (const line of template.split('\n')) {
    const match = ATX_LEVEL_2.exec(line);
    if (match === null) continue;

    const raw = match[1] ?? '';
    if (HTML_COMMENT.test(raw)) {
      HTML_COMMENT.lastIndex = 0;
      continue;
    }
    HTML_COMMENT.lastIndex = 0;

    const text = stripTemplateAnnotation(raw);

    if (text === '' || PLACEHOLDER.test(text) || ORDINAL.test(text)) continue;
    if (!headings.includes(text)) headings.push(text);
  }

  return headings;
}

/**
 * The template's required sections, or `null` when it prescribes none.
 *
 * `null` is a real answer, not a failure: OpenSpec's `tasks.md` is a list of numbered task groups
 * whose names belong to the change being proposed. A document with no fixed headings gets no
 * structural assertion, and the template still reaches the writer as the shape to follow.
 */
export function templateSections(id: VendoredTemplateId): SectionList | null {
  const headings = stableHeadings(VENDORED_TEMPLATES[id]);
  if (headings.length === 0) return null;

  return defineSectionList(headings.map((heading) => ({ level: 2, heading })));
}

/** The template text itself — what the prompt shows the writer as the shape to fill in. */
export function templateText(id: VendoredTemplateId): string {
  return VENDORED_TEMPLATES[id];
}
