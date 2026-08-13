/**
 * Deliberate violation (task 39 AC-2): a heading list restated in a prompt asset.
 *
 * This is the exact failure mode P3 names — "inline in a prompt file" — and the one that would go
 * unnoticed longest, because a prompt that lists the sections it wants *works*, right up until the
 * schema changes and the prompt does not.
 *
 * Linted only by `pnpm test:boundaries`.
 */
export const RESTATED = [
  '## Overview',
  '## User Roles',
  '## Functional Requirements',
  '## Non-Functional Requirements',
].join('\n');
