/**
 * The composer's two menus, as data (task 121; Эталон §1.5).
 *
 * Pure functions over the text in the box and what the session currently offers, so what the menus
 * show is decided by the same logic in every browser and can be asserted without one. The rules they
 * encode are small but easy to get subtly wrong by hand — where a token starts, when a menu should
 * close, what "the current position refuses this" means — and each of them is a place a menu could
 * lie about what pressing an entry would do.
 */

/** One thing a slash command can do. Each maps 1:1 onto a control the page already renders. */
export const SLASH_COMMANDS = [
  {
    id: 'ask',
    label: '/ask',
    description: 'Ask another round of questions',
    /** The test id of the control this dispatches to — the *same* control, not a parallel path. */
    control: 'ask-round',
  },
  { id: 'proceed', label: '/proceed', description: 'Move to the next step', control: 'proceed' },
  {
    id: 'generate',
    label: '/generate',
    description: 'Draft the document for this step',
    control: 'generate-spec',
  },
  { id: 'approve', label: '/approve', description: 'Approve the draft', control: 'approve-spec' },
  {
    id: 'request-changes',
    label: '/request-changes',
    description: 'Send the document back with the points you ticked',
    control: 'review-request-changes',
  },
  {
    id: 'accept',
    label: '/accept',
    description: 'Accept the review and move on',
    control: 'review-accept',
  },
  {
    id: 'export',
    label: '/export',
    description: 'Download the bundle',
    control: 'export-download',
  },
] as const;

export type SlashCommand = (typeof SLASH_COMMANDS)[number];

/**
 * The slash token being typed, or `null`.
 *
 * A command is only a command at the **start** of the message: `/proceed` opens the menu, and
 * «see /docs for the format» does not. Anything after the first whitespace ends it, so a menu never
 * hangs over a sentence that merely began with a slash.
 */
export function slashQuery(value: string): string | null {
  if (!value.startsWith('/')) return null;

  const token = value.slice(1);
  if (/\s/.test(token)) return null;

  return token;
}

/** The commands matching what has been typed so far, in declaration order. */
export function matchingCommands(query: string): SlashCommand[] {
  const needle = query.toLowerCase();

  return SLASH_COMMANDS.filter((command) => command.id.startsWith(needle));
}

/** A file or attachment an `@` reference can name. */
export interface ReferenceTarget {
  /** `spec:<specFileId>` or `attachment:<id>` — what travels with the message. */
  id: string;
  /** What the user types and reads: the file's name. */
  name: string;
  kind: 'spec' | 'attachment';
  /** Present for a bundle file with no revision yet — offered, and honest about being empty. */
  empty?: boolean;
}

/**
 * The `@` token under the cursor, or `null`.
 *
 * Anchored to the last `@` that begins a word, so «email me @ constitution.md» does not open a menu
 * and «see @constitution.md and @requirements.md» matches the second one while it is being typed.
 */
export function referenceQuery(value: string): { query: string; start: number } | null {
  const at = value.lastIndexOf('@');
  if (at === -1) return null;
  if (at > 0 && !/\s/.test(value[at - 1] ?? '')) return null;

  const token = value.slice(at + 1);
  if (/\s/.test(token)) return null;

  return { query: token, start: at };
}

/** The targets matching an `@` token, by case-insensitive substring of the name. */
export function matchingReferences(
  targets: readonly ReferenceTarget[],
  query: string,
): ReferenceTarget[] {
  const needle = query.toLowerCase();

  return targets.filter((target) => target.name.toLowerCase().includes(needle));
}

/** Replaces the `@` token being typed with the chosen name, leaving the cursor after it. */
export function applyReference(value: string, start: number, name: string): string {
  return `${value.slice(0, start)}@${name} `;
}

/**
 * The reference ids a message names, resolved against what the session actually has.
 *
 * The **names** in the text are how a person writes a reference; the **ids** are what the server
 * needs. Resolving here rather than on the server keeps the message itself plain text — the server
 * receives ids it can check ownership on, and a name that matches nothing simply produces no id,
 * which is what makes a dangling reference a visible notice rather than a silent lookup failure.
 */
export function referencedIds(
  value: string,
  targets: readonly ReferenceTarget[],
): { ids: string[]; unknown: string[] } {
  const names = [...value.matchAll(/(?:^|\s)@([^\s]+)/g)].map((match) => match[1] ?? '');
  const ids: string[] = [];
  const unknown: string[] = [];

  for (const name of names) {
    const target = targets.find((candidate) => candidate.name.toLowerCase() === name.toLowerCase());

    if (target === undefined) unknown.push(name);
    else if (!ids.includes(target.id)) ids.push(target.id);
  }

  return { ids, unknown };
}
