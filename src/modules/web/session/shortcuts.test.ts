import { describe, expect, it } from 'vitest';

import { SHORTCUTS, isTypingTarget, shortcutFor } from './shortcuts';

/**
 * The keyboard vocabulary (task 141).
 *
 * The mapping is pure precisely so this file can exist: "does typing a `b` into the composer
 * collapse the sidebar" is a question about a function, not something to be discovered in a browser
 * by someone who happened to type a word containing that letter.
 */
const press = (key: string, over: Partial<Parameters<typeof shortcutFor>[0]> = {}) =>
  shortcutFor({ key, ctrlKey: false, metaKey: false, altKey: false, typing: false, ...over });

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
