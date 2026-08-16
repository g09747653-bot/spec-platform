/**
 * The handoff prompt (task 126; Эталон §5.1 — «экспорт ZIP → положить в `.specs/` → скормить агенту»).
 *
 * What the product is *for* is a bundle a coding agent can act on without being rewritten
 * (constitution P4), and the last step of that is the sentence the user pastes into the agent. This
 * builds it, from the bundle in front of them: its name, its methodology, and the **actual approved
 * revisions** of its files. A prompt naming files that are not there, or revisions nobody approved,
 * would be the one part of the handoff the product got wrong.
 *
 * It lives in `specs` rather than in `prompts` on purpose. The `prompts` module is the registry of
 * assets *we send to a model* — assembled, variable-checked, and validated at boot against the
 * section schema. This text is never sent anywhere by us: it is an artifact derived from the bundle,
 * like the export manifest, and it belongs beside them.
 *
 * Pure, so what it says is a test rather than a screenshot.
 */

export interface HandoffFile {
  /** As the bundle names it — `constitution.md`, `plan.md` — from the methodology's plan. */
  fileName: string;
  /** The approved revision the export would resolve to. */
  revisionNumber: number;
}

export interface HandoffBundle {
  bundleName: string;
  /** «MySpec · Greenfield · V1», joined by the caller from the config's own parts. */
  methodologyLabel: string;
  files: readonly HandoffFile[];
  /** Files the plan promises that have no approved revision yet. */
  omittedFiles?: readonly string[];
}

/** Where the exported bundle is meant to land in a repository. */
export const BUNDLE_DIRECTORY = '.specs/';

export function buildHandoffPrompt(bundle: HandoffBundle): string {
  const { bundleName, methodologyLabel, files } = bundle;
  const omitted = bundle.omittedFiles ?? [];

  const inventory =
    files.length === 0
      ? 'The bundle has no approved files yet, so there is nothing to hand over.'
      : files
          .map(
            (file, index) =>
              `${String(index + 1)}. ${file.fileName} — approved revision ${String(file.revisionNumber)}`,
          )
          .join('\n');

  const missing =
    omitted.length === 0
      ? ''
      : `\nNot in the bundle yet: ${omitted.join(', ')}. Treat anything that would depend on them as an open question, and ask.\n`;

  return [
    `Build the project specified by the bundle "${bundleName}".`,
    '',
    `The bundle was written with the ${methodologyLabel} workflow. Download it as a ZIP and unpack it into \`${BUNDLE_DIRECTORY}\` at the root of the repository. Read every file before writing any code, in this order:`,
    '',
    inventory,
    missing,
    'How to work from it:',
    '',
    '- The bundle is the specification. Implement what it states, and do not invent requirements it does not.',
    '- Identifiers are stable. Refer to FR/NFR/DR/IR numbers and task numbers as written; never renumber them.',
    '- Work through the task list in order, honouring the dependencies each task declares.',
    '- The constitution outranks the other files. Where two of them disagree, follow the constitution and say so.',
    '- Where the bundle is genuinely silent, ask rather than assume — a wrong assumption is more expensive than a question.',
    '- Tests are part of each task, not a phase after it.',
    '',
    `When you are done, state which requirement identifiers you implemented and which remain open.`,
  ].join('\n');
}
