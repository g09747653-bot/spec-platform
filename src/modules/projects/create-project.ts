import { z } from 'zod';

import { isMethodologyId } from '@/modules/methodologies';

import { AUDIENCE_PROFILES, DEFAULT_AUDIENCE_PROFILE } from './audience';

/** The picker's default: let the classification choose (task 117). */
export const AUTO_METHODOLOGY = 'auto';

/**
 * Starting a session from a prompt (FR-003; task 15).
 *
 * The rules live here rather than in the route handler so both sides of FR-003 AC-2 — the browser's
 * check and the server's — are the same rule, and so the naming behaviour is testable without HTTP.
 */

/** Longest prompt accepted. Matches the chat message ceiling in solution.md's schema section. */
export const MAX_PROMPT_LENGTH = 8000;

/**
 * FR-003 AC-2: an empty or whitespace-only prompt is rejected. The trim happens before the length
 * check, so `"   "` fails as empty rather than passing as three characters, and the stored value never
 * carries the user's trailing newline.
 */
export const CreateProjectRequest = z.object({
  prompt: z
    .string()
    .trim()
    .min(1, 'Describe your idea in a sentence or two before starting.')
    .max(MAX_PROMPT_LENGTH, `Keep the prompt under ${String(MAX_PROMPT_LENGTH)} characters.`),
  /**
   * Who the interview will be talking to (У-5; task 106).
   *
   * Defaulted rather than required: the form offers the choice, and a client that omits it — an
   * older page still open in a tab, a direct call — gets the plain register, which is the safe one.
   */
  audience: z.enum(AUDIENCE_PROFILES).default(DEFAULT_AUDIENCE_PROFILE),
  /**
   * The workflow to walk, or `auto` to have it chosen (task 117; Эталон §1.4).
   *
   * `auto` is the default for the same reason the audience profile has one: a client that omits the
   * field gets the behaviour a user who did not choose would want. Validation is against the
   * registry rather than a literal union, so adding a configuration does not mean editing a schema
   * — and an id this build does not ship is a rejected request rather than a session that walks a
   * graph nobody can name.
   */
  methodology: z
    .string()
    .default(AUTO_METHODOLOGY)
    .refine((value) => value === AUTO_METHODOLOGY || isMethodologyId(value), {
      message: 'Unknown workflow.',
    }),
});

export type CreateProjectInput = z.infer<typeof CreateProjectRequest>;

const FALLBACK_NAME = 'Untitled project';
const MAX_NAME_LENGTH = 60;

/**
 * Names the project after the prompt that started it.
 *
 * FR-002 AC-1 requires the list to show a name, and task 15's form asks only for a prompt, so the name
 * is derived rather than demanded — one fewer field between an idea and a session. Renaming is FR-002
 * AC-3 and arrives with its own task; nothing here depends on the name being stable.
 */
export function deriveProjectName(prompt: string): string {
  const firstLine = prompt.split('\n').find((line) => line.trim() !== '') ?? '';
  const collapsed = firstLine.replace(/\s+/g, ' ').trim();

  if (collapsed === '') return FALLBACK_NAME;
  if (collapsed.length <= MAX_NAME_LENGTH) return collapsed;

  // Cut on a word boundary when there is one, so the name does not end mid-word.
  const clipped = collapsed.slice(0, MAX_NAME_LENGTH);
  const lastSpace = clipped.lastIndexOf(' ');
  const trimmed = lastSpace > MAX_NAME_LENGTH / 2 ? clipped.slice(0, lastSpace) : clipped;

  return `${trimmed.trimEnd()}…`;
}
