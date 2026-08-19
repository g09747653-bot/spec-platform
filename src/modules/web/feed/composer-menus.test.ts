import { describe, expect, it } from 'vitest';

import { LOCALES } from '../i18n/phrase';
import { translator } from '../i18n/translate';

import {
  applyReference,
  matchingCommands,
  matchingReferences,
  referenceQuery,
  referencedIds,
  slashQuery,
  SLASH_COMMANDS,
  type ReferenceTarget,
} from './composer-menus';

/**
 * Task 121 — the composer's two menus.
 *
 * The interesting claims are all about **when a menu is not open**. A menu that appears whenever a
 * slash or an at-sign occurs anywhere in a sentence is a menu that gets in the way of writing, and
 * the failure is not visible from the happy path — so the negatives are asserted first.
 */
describe('slash commands', () => {
  it('opens only at the start of the message', () => {
    expect(slashQuery('/pro')).toBe('pro');
    expect(slashQuery('/')).toBe('');

    expect(slashQuery('see /docs for the format')).toBeNull();
    expect(slashQuery('/proceed now')).toBeNull();
    expect(slashQuery('what about approvals?')).toBeNull();
  });

  it('narrows as the command is typed, and offers everything on a bare slash', () => {
    expect(matchingCommands('')).toHaveLength(SLASH_COMMANDS.length);
    expect(matchingCommands('a').map((command) => command.id)).toEqual([
      'ask',
      'approve',
      'accept',
    ]);
    expect(matchingCommands('appr').map((command) => command.id)).toEqual(['approve']);
    expect(matchingCommands('zzz')).toEqual([]);
  });

  /*
   * Every command names a control the page renders. This is the acceptance criterion "slash
   * dispatches are byte-equivalent to button dispatches" stated where it can be checked cheaply: the
   * command carries a test id, and the surface presses *that node*. A command whose control was
   * renamed would fail here rather than silently stop working.
   */
  it('names a control for every command, and no two share one', () => {
    const controls = SLASH_COMMANDS.map((command) => command.control);

    expect(controls.every((control) => control.length > 0)).toBe(true);
    expect(new Set(controls).size).toBe(controls.length);
  });

  /**
   * The label is typed and the description is read (task 143).
   *
   * `/proceed` is what a person types and what `slashQuery` matches on, so it is an identifier and
   * stays the same in every language; the line underneath is the only copy in this table, and it is
   * a key. `satisfies` already makes a key that does not exist a compile error — what it cannot see
   * is a key that exists and is *wrong*, and the way that happens here is a copy-paste: two entries
   * pointing at one description is a menu telling the reader that two commands do the same thing.
   *
   * Asserted in both languages because that is where the cost of the mistake lands. A missing
   * Russian half is a type error; a Russian half quietly left as a duplicate of its neighbour's is
   * not, and this menu is eight lines of near-identical shape read at a glance.
   */
  it('describes every command distinctly, in both languages', () => {
    for (const locale of LOCALES) {
      const t = translator(locale);
      const described = SLASH_COMMANDS.map((command) => t(command.description));

      for (const [index, text] of described.entries()) {
        expect(text.trim(), `${SLASH_COMMANDS[index]?.id ?? ''} in ${locale}`).not.toBe('');
      }

      expect(new Set(described).size, `two commands share a description in ${locale}`).toBe(
        described.length,
      );
    }
  });

  /** The typed half: a slash command is a thing a person types, so it is never translated. */
  it('keeps the command itself an identifier', () => {
    for (const command of SLASH_COMMANDS) {
      expect(command.label, command.id).toBe(`/${command.id}`);
    }
  });
});

describe('@ references', () => {
  const targets: ReferenceTarget[] = [
    { id: 'spec:1', name: 'constitution.md', kind: 'spec' },
    { id: 'spec:2', name: 'requirements.md', kind: 'spec' },
    { id: 'attachment:9', name: 'notes.pdf', kind: 'attachment' },
  ];

  it('anchors to an at-sign that begins a word', () => {
    expect(referenceQuery('tighten @req')).toEqual({ query: 'req', start: 8 });
    expect(referenceQuery('@')).toEqual({ query: '', start: 0 });

    expect(referenceQuery('email me @ constitution.md')).toBeNull();
    expect(referenceQuery('user@example.test')).toBeNull();
    expect(referenceQuery('no reference here')).toBeNull();
  });

  it('matches by substring, so a partial name finds the file', () => {
    expect(matchingReferences(targets, 'req').map((target) => target.name)).toEqual([
      'requirements.md',
    ]);
    expect(matchingReferences(targets, '.md')).toHaveLength(2);
    expect(matchingReferences(targets, 'PDF').map((target) => target.name)).toEqual(['notes.pdf']);
  });

  it('replaces the token being typed and leaves room for the next word', () => {
    expect(applyReference('tighten @req', 8, 'requirements.md')).toBe('tighten @requirements.md ');
  });

  it('resolves the names a message used into ids, and reports the ones it could not', () => {
    const resolved = referencedIds(
      'compare @constitution.md with @requirements.md and @missing.md',
      targets,
    );

    expect(resolved.ids).toEqual(['spec:1', 'spec:2']);
    expect(resolved.unknown).toEqual(['missing.md']);
  });

  it('names each document once, however many times it is mentioned', () => {
    expect(referencedIds('@notes.pdf and again @notes.pdf', targets).ids).toEqual(['attachment:9']);
  });

  it('ignores an at-sign inside a word, so an email address is not a reference', () => {
    expect(referencedIds('write to owner@example.test', targets)).toEqual({
      ids: [],
      unknown: [],
    });
  });
});
