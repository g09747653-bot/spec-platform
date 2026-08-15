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
 */
export function stubReviewDocument(specType = 'specification'): string {
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
