import { describe, expect, it } from 'vitest';

import { SHORTCUTS, isTypingTarget, shortcutFor } from './shortcuts';

/**
 * The keyboard vocabulary (task 141).
 *
 * The mapping is pure precisely so this file can exist: "does typing a `b` into the composer
 * collapse the sidebar" is a question about a function, not something to be discovered in a browser
 * by someone who happened to type a word containing that letter.
 *
 * A press now carries two things — the character a layout produced and the key it came from — and
 * the helper below supplies the second from a US-QWERTY table so the cases that are about *meaning*
 * stay readable. The cases that are about *layout* pass a `code` of their own.
 */
const QWERTY: Readonly<Record<string, string>> = {
  b: 'KeyB',
  B: 'KeyB',
  c: 'KeyC',
  C: 'KeyC',
  v: 'KeyV',
  V: 'KeyV',
  '/': 'Slash',
  '?': 'Slash',
  '1': 'Digit1',
  '2': 'Digit2',
  '3': 'Digit3',
  '4': 'Digit4',
  Escape: 'Escape',
  Enter: 'Enter',
};

const press = (key: string, over: Partial<Parameters<typeof shortcutFor>[0]> = {}) =>
  shortcutFor({
    key,
    code: QWERTY[key] ?? '',
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    typing: false,
    ...over,
  });

describe('keyboard shortcuts', () => {
  it('binds a plain letter only when the caret is not in a field', () => {
    expect(press('b')).toBe('toggle-sidebar');
    expect(press('b', { typing: true })).toBeNull();
    expect(press('v')).toBe('open-viewer');
    expect(press('v', { typing: true })).toBeNull();
  });

  it('is case-insensitive, so caps lock does not silently disable it', () => {
    expect(press('B')).toBe('toggle-sidebar');
    expect(press('V')).toBe('open-viewer');
    expect(press('C')).toBe('focus-composer');
  });

  it('lets Escape through even while typing — it is the way out of a field', () => {
    expect(press('Escape', { typing: true })).toBe('close');
    expect(press('Escape')).toBe('close');
  });

  it('sends on the modifier chord, with the caret in the box', () => {
    expect(press('Enter', { ctrlKey: true, typing: true })).toBe('send');
    expect(press('Enter', { metaKey: true, typing: true })).toBe('send');
    // A bare Enter is a newline in the message, and must stay one.
    expect(press('Enter', { typing: true })).toBeNull();
  });

  it('claims nothing else that carries a modifier', () => {
    expect(press('b', { ctrlKey: true })).toBeNull();
    expect(press('1', { metaKey: true })).toBeNull();
    // Alt is the compose key on several layouts; taking it would eat characters.
    expect(press('b', { altKey: true })).toBeNull();
  });

  it('maps the four number keys onto the four viewer views', () => {
    expect(press('1')).toBe('view-outline');
    expect(press('2')).toBe('view-preview');
    expect(press('3')).toBe('view-raw');
    expect(press('4')).toBe('view-diff');
  });

  it('documents every binding it performs, and performs every binding it documents', () => {
    const documented = new Set(SHORTCUTS.map((shortcut) => shortcut.id));
    const bound = new Set(
      [
        press('?'),
        press('b'),
        press('c'),
        press('/'),
        press('v'),
        press('1'),
        press('2'),
        press('3'),
        press('4'),
        press('Escape'),
        press('Enter', { ctrlKey: true }),
      ].filter((id): id is string => id !== null),
    );

    expect([...bound].sort()).toEqual([...documented].sort());
  });
});

/**
 * The layout the list is being translated for (task 143; voice standard §7.2).
 *
 * On ЙЦУКЕН the key engraved `B` reports «и», `V` reports «м» and `C` reports «с», and `/` is not on
 * the keyboard at all — so a dispatcher reading the produced character bound nothing, while the
 * in-app list went on printing `B`. These are the presses a Russian-speaking user actually makes.
 */
describe('a Cyrillic layout', () => {
  const cyrillic = (key: string, code: string) =>
    shortcutFor({ key, code, ctrlKey: false, metaKey: false, altKey: false, typing: false });

  it('binds the letter keys by their position, not by the letter they produce', () => {
    expect(cyrillic('и', 'KeyB')).toBe('toggle-sidebar');
    expect(cyrillic('с', 'KeyC')).toBe('focus-composer');
    expect(cyrillic('м', 'KeyV')).toBe('open-viewer');
  });

  /** The key printed `/` in the list types a full stop here; the list is still telling the truth. */
  it('binds the command menu to the key the list names', () => {
    expect(cyrillic('.', 'Slash')).toBe('slash');
  });

  it('still ignores a letter typed into a field', () => {
    expect(
      shortcutFor({
        key: 'и',
        code: 'KeyB',
        ctrlKey: false,
        metaKey: false,
        altKey: false,
        typing: true,
      }),
    ).toBeNull();
  });

  /**
   * `?` is Shift+7 here and Shift+/ on QWERTY: one character, two positions, so this one shortcut
   * is read from the character — and reading it first is what keeps Shift+/ off the command menu.
   */
  it('opens this list from the character, wherever the character lives', () => {
    expect(cyrillic('?', 'Digit7')).toBe('shortcuts');
    expect(press('?')).toBe('shortcuts');
  });

  it('still counts the viewer digits, which both layouts share', () => {
    expect(cyrillic('1', 'Digit1')).toBe('view-outline');
    expect(cyrillic('4', 'Digit4')).toBe('view-diff');
  });
});

describe('isTypingTarget', () => {
  it('recognises the elements that swallow letters', () => {
    for (const tagName of ['INPUT', 'TEXTAREA', 'SELECT']) {
      expect(isTypingTarget({ tagName } as unknown as EventTarget)).toBe(true);
    }

    expect(
      isTypingTarget({ tagName: 'DIV', isContentEditable: true } as unknown as EventTarget),
    ).toBe(true);
  });

  it('does not treat an ordinary element, or nothing at all, as a field', () => {
    expect(isTypingTarget({ tagName: 'BUTTON' } as unknown as EventTarget)).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });
});
