/**
 * The deterministic revision note for the stub provider (task 113 on the test double).
 *
 * One paragraph, in the shape the reference product's writer produces: what is being folded in, and
 * one call the writer is making on its own (Эталон §1.3). It names the count rather than the points
 * so that the sentence is the same whichever subset the user ticked — an end-to-end assertion on it
 * is then about the *mechanism* rather than about which checkbox a fixture happened to choose.
 */
export function stubRevisionNoteDocument(points: number): string {
  return [
    `I am folding in the ${String(points)} ${points === 1 ? 'point' : 'points'} you ticked and`,
    'leaving the rest of the document as it stands. One thing the points did not settle: where the',
    'wording could be read two ways I have taken the narrower reading, so nothing new is promised.',
  ].join(' ');
}

/**
 * Whether an assembled prompt is asking for a revision note.
 *
 * Recognised by a phrase the `revision.note.v1` system template renders verbatim — the same trick
 * `looksLikeReviewPrompt` uses, and for the same reason: the stub is selected by configuration, not
 * by a test flag, so it has only the prompt to go on.
 */
export function looksLikeRevisionNotePrompt(prompt: string): boolean {
  return prompt.includes('which open questions you are settling yourself');
}

/** How many points the note prompt listed, so the stub paragraph can count them back. */
export function pointCountFromNotePrompt(prompt: string): number {
  const block = /The points the user ticked[^\n]*\n\n([\s\S]*?)\n\nThe document as it stands/.exec(
    prompt,
  );

  return (block?.[1] ?? '').split('\n').filter((line) => line.startsWith('- ')).length;
}
