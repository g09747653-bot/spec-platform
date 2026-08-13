import type { ResearchAdapter } from '@/modules/adapters/research';
import type { CoreSpecType } from '@/modules/specs/model/spec-files';

import type { ContextResearch } from '../context-assembler';

/**
 * The research a generation performs before it writes anything (task 70; FR-019).
 *
 * **It runs automatically and is never configured by the user** (AC-1/AC-3). The query is derived
 * deterministically from what the session already holds — the grounding prompt and the stage being
 * written — rather than from a model call: a model asked "what should I search for?" is a second
 * round-trip, a second failure mode and a second thing to test, for a query that the stage name and
 * the user's own words already describe.
 *
 * **Nothing here can fail a stage** (AC-4). The adapter resolves every error to an empty result, and
 * this returns an empty list in exactly the same shape, so the caller has no error path to get wrong.
 *
 * What comes back is *data*, and task 71 is what guarantees it stays data: every page is placed
 * inside a labelled untrusted block by the assembler, never as instructions (AC-5; NFR-009 AC-1).
 */

/** What each stage is trying to learn. Short, and about the document, not about the product. */
const STAGE_FOCUS: Readonly<Record<CoreSpecType, string>> = {
  constitution: 'engineering principles and constraints',
  requirements: 'feature expectations and acceptance criteria',
  solution: 'current libraries, frameworks and architecture practices',
  tasks: 'implementation sequencing and delivery risks',
};

/** How many of the search hits are actually fetched. The budget is spent reading, not listing. */
const PAGES_TO_READ = 2;

export function researchQuery(specType: CoreSpecType, initialPrompt: string): string {
  // The prompt is the user's own text and can be any length; a query is a query.
  const subject = initialPrompt.trim().replace(/\s+/g, ' ').slice(0, 160);

  return `${subject} — ${STAGE_FOCUS[specType]}`;
}

export interface ResearchOutcome {
  /** Pages read, in the order the search returned them. Empty whenever anything went wrong. */
  pages: readonly ContextResearch[];
}

export async function performResearch(
  research: ResearchAdapter,
  input: { specType: CoreSpecType; initialPrompt: string },
): Promise<ResearchOutcome> {
  const hits = await research.search(researchQuery(input.specType, input.initialPrompt));
  const pages: ContextResearch[] = [];

  for (const hit of hits.slice(0, PAGES_TO_READ)) {
    const page = await research.fetch(hit.url);

    // A page that came back empty is a page that failed. Listing its URL with no content would
    // spend context saying "we looked at this and learned nothing".
    if (page.text.trim() === '') continue;

    pages.push({
      url: hit.url,
      title: hit.title,
      text: page.text,
      truncated: page.truncated,
    });
  }

  return { pages };
}
