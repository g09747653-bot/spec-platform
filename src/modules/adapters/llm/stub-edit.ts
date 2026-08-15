/**
 * The deterministic cross-file edit answer for the stub provider (task 118 on the test double).
 *
 * It has to be genuinely *selective*, because the interesting property of an edit is which files it
 * touches: a stub that rewrote every referenced document would make the atomic multi-file apply and
 * a four-times-repeated single-file apply indistinguishable, and the acceptance criterion is about
 * the difference.
 *
 * So the rule is a plain one, stated here rather than reasoned: **a file is edited when the request
 * names it, and every file is edited when the request names none.** That gives an e2e walk both
 * shapes — «change requirements.md only» and «tighten the whole bundle» — without the stub having to
 * understand anything.
 *
 * Like every stub here it keys off plain strings: an adapter may not import a core module (A1).
 */

/** Whether an assembled prompt is asking for an edit, by a phrase the asset renders verbatim. */
export function looksLikeEditPrompt(prompt: string): boolean {
  return prompt.includes('The bundle files this edit may touch:');
}

/** The instruction quoted inside the prompt's request markers. */
export function instructionFromEditPrompt(prompt: string): string {
  return /<<<REQUEST\n([\s\S]*?)\nREQUEST/.exec(prompt)?.[1]?.trim() ?? '';
}

/** Every `<<<FILE name … FILE name` block the prompt embedded, in the order it embedded them. */
export function documentsFromEditPrompt(prompt: string): { fileName: string; content: string }[] {
  return [...prompt.matchAll(/<<<FILE ([^\n]+)\n([\s\S]*?)\nFILE \1(?:\n|$)/g)].map((match) => ({
    fileName: (match[1] ?? '').trim(),
    content: match[2] ?? '',
  }));
}

/**
 * The stub's answer: the JSON contract of `edit.propose.v1`.
 *
 * The change itself is one appended line naming the request, which is enough for a diff to be
 * non-empty and for the applied revision to be recognisably different from its predecessor — and
 * small enough that a structural check still passes, so an accepted edit does not fail for a reason
 * the test did not intend.
 */
export function stubEditDocument(prompt: string): string {
  const instruction = instructionFromEditPrompt(prompt);
  const documents = documentsFromEditPrompt(prompt);
  const named = documents.filter((document) => instruction.includes(document.fileName));
  const touched = named.length > 0 ? named : documents;

  return JSON.stringify({
    summary: `Applied "${instruction}" to ${String(touched.length)} document(s).`,
    files: touched.map((document) => ({
      fileName: document.fileName,
      content: `${document.content}\n\n<!-- edit: ${instruction} -->\n`,
      rationale: `The request affects ${document.fileName}.`,
    })),
  });
}
