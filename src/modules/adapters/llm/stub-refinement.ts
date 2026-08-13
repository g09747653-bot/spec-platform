/**
 * The deterministic refinement answer for the stub provider (task 59 on the test double).
 *
 * It has to do three things the fixed documents elsewhere cannot, because the interesting paths of
 * FR-011 are all about *which* answer comes back:
 *
 * - an ordinary request yields a proposal — the document with one line appended;
 * - a request to remove a section actually removes it, so the required-section refusal of AC-8 is
 *   exercised against a proposal that genuinely deletes a heading rather than against a fixture;
 * - a vague request yields a clarification, so AC-9 has a path through the real code.
 *
 * The vagueness rule is a **word list**, not a judgement: the stub stands in for a model, and a stub
 * that tried to reason would be a second implementation of the thing under test. `better`, `improve`
 * and `nicer` are the canonical under-specified asks.
 *
 * Like every stub here it keys off plain strings — an adapter may not import a core module (A1).
 */
const VAGUE_WORDS = ['better', 'improve', 'nicer', 'somehow', 'or something'];

/** Whether an assembled prompt is asking for a refinement, by a phrase the asset renders verbatim. */
export function looksLikeRefinementPrompt(prompt: string): boolean {
  return prompt.includes('{"kind":"proposal","content"');
}

/** The instruction quoted inside the prompt's request markers. */
export function instructionFromRefinementPrompt(prompt: string): string {
  return /<<<REQUEST\n([\s\S]*?)\nREQUEST/.exec(prompt)?.[1]?.trim() ?? '';
}

/** The document the prompt embedded, which the proposal is a modification of. */
export function documentFromRefinementPrompt(prompt: string): string {
  const match = /document:\n\n([\s\S]*?)\n\nThe request, between the markers/.exec(prompt);

  return match?.[1] ?? '';
}

/** Drops the section under `heading` — everything from that heading to the next of equal-or-higher level. */
function withoutSection(document: string, heading: string): string {
  const lines = document.split('\n');
  const target = heading.trim().toLowerCase();

  const start = lines.findIndex((line) => {
    const found = /^\s{0,3}(#{1,6})\s+(.*?)\s*$/.exec(line);
    return found !== null && (found[2] ?? '').trim().toLowerCase() === target;
  });
  if (start === -1) return document;

  const level = (/^\s{0,3}(#{1,6})/.exec(lines[start] ?? '')?.[1] ?? '#').length;

  let end = start + 1;
  while (end < lines.length) {
    const found = /^\s{0,3}(#{1,6})\s+/.exec(lines[end] ?? '');
    if (found !== null && (found[1] ?? '').length <= level) break;
    end += 1;
  }

  return [...lines.slice(0, start), ...lines.slice(end)].join('\n').replace(/\n{3,}/g, '\n\n');
}

/** The stub model's answer to a refinement request — JSON matching the refinement contract. */
export function stubRefinementDocument(prompt: string): string {
  const instruction = instructionFromRefinementPrompt(prompt);
  const document = documentFromRefinementPrompt(prompt);
  const lowered = instruction.toLowerCase();

  if (VAGUE_WORDS.some((word) => lowered.includes(word))) {
    return JSON.stringify({
      kind: 'clarification',
      question: 'Which section should change, and what should it say instead?',
    });
  }

  const removal = /(?:remove|delete|drop)\s+the\s+(.+?)\s+section/i.exec(instruction);
  if (removal !== null) {
    return JSON.stringify({
      kind: 'proposal',
      content: withoutSection(document, removal[1] ?? ''),
    });
  }

  return JSON.stringify({
    kind: 'proposal',
    content: `${document.replace(/\s+$/, '')}\n\n- Added by the refinement: ${instruction}\n`,
  });
}
