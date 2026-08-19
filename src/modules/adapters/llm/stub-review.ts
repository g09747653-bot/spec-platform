/**
 * The deterministic review document for the stub provider (task 54 on the test double).
 *
 * Like the interview stubs, this stands in for a well-behaved model: the JSON matches
 * `ReviewArtifact` exactly, so the repair and rejection paths stay the business of unit tests with
 * deliberately corrupted drafts. And like them it keys off plain strings — an adapter may not import
 * a core module (constitution A1), so nothing here knows what a `CoreSpecType` is.
 *
 * Two blocking items and one advisory item, deliberately: FR-010 AC-7's filter is only meaningful
 * when there is more than one item to choose between, and the ReviewBoard renders two lists.
 *
 * **A re-review passes** (`revised`), and that is a correction rather than a convenience (task 145).
 * A stub that raises the same two blocking findings about a document rewritten to apply them is not
 * standing in for a well-behaved model — it is standing in for one that cannot read. It also made
 * `verdict: 'pass'` unreachable from every automated path in the repository, so the terminating half
 * of the revision cycle had never once been walked: every suite that entered the loop left it by
 * accepting a board that still said the document was broken. The advisory finding survives the
 * rewrite because taste is not something a rewrite settles, and a board with nothing on it would
 * stop exercising the two lists this double exists to produce.
 */
export function stubReviewDocument(specType = 'specification', revised = false): string {
  if (revised) {
    return JSON.stringify(
      {
        verdict: 'pass',
        summary: `The rewritten ${specType} applies the points it was sent back for; what is left is a matter of taste.`,
        mustFix: [],
        recommendations: [
          {
            id: 'rec-example',
            sectionPath: 'Notes',
            title: 'The list would read better with an example',
            body: 'The section would read more clearly with a worked example.',
            suggestion: 'Add one short example beneath the list.',
            confidence: 6,
          },
        ],
      },
      null,
      2,
    );
  }

  return JSON.stringify(
    {
      verdict: 'needs_revision',
      summary: `The ${specType} covers the ground it should, but two points would leave a coding agent guessing and one section would read better with an example.`,
      mustFix: [
        {
          id: 'mf-untestable-criterion',
          sectionPath: 'Purpose — Outcomes',
          title: 'An outcome with no way to tell whether it was reached',
          body: `The ${specType} states an outcome with no way to tell whether it was reached.`,
          suggestion: 'Restate it as a criterion an automated test could assert.',
          confidence: 9,
        },
        {
          id: 'mf-unnamed-actor',
          sectionPath: 'Notes',
          title: 'A responsibility with no owner',
          body: 'A responsibility is described without naming who holds it.',
          suggestion: 'Name the module that owns the behaviour.',
          confidence: 8,
        },
      ],
      recommendations: [
        {
          id: 'rec-example',
          sectionPath: 'Notes',
          title: 'The list would read better with an example',
          body: 'The section would read more clearly with a worked example.',
          suggestion: 'Add one short example beneath the list.',
          confidence: 6,
        },
      ],
    },
    null,
    2,
  );
}

/**
 * Whether an assembled prompt is asking for a review.
 *
 * Recognised by a phrase the `review.board.v2` system template renders verbatim — the same trick
 * `documentFromPrompt` uses to spot a section list, and for the same reason: the stub is selected by
 * configuration, not by a test flag, so it has only the prompt to go on. A wording change that broke
 * this would break the stub review test in the same commit.
 */
export function looksLikeReviewPrompt(prompt: string): boolean {
  return prompt.includes('"verdict": "pass"|"needs_revision"');
}

/** The spec type named in a review prompt, for a document that mentions the file it reviewed. */
export function specTypeFromReviewPrompt(prompt: string): string {
  return /Review the (\S+) document/.exec(prompt)?.[1] ?? 'specification';
}

/**
 * Whether the review being asked for is a **re**-review.
 *
 * Recognised by the opening sentence `verificationBlock` renders verbatim when — and only when — the
 * caller passed points to verify (`prompts/assets/review.ts`). A first review renders that block as
 * the empty string, so the two cases are told apart by the same fact the prompt itself is built
 * from, not by counting anything.
 */
export function looksLikeRereviewPrompt(prompt: string): boolean {
  return prompt.includes('This document has been revised.');
}
