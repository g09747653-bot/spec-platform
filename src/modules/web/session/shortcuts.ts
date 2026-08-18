import type { PhraseKey } from '../i18n/dictionary';

/**
 * Keyboard shortcuts — the vocabulary, and the rule for when a key press is meant for us (task 141).
 *
 * Pure: no React, no DOM. The list below is the single source of what this application binds, and
 * both the handler that acts on a key and the in-app list that teaches it read *this* — so a
 * shortcut cannot exist without being documented, and the printed list cannot describe a binding
 * that was removed.
 *
 * **Single letters, not modifier chords.** A desktop wrapper will one day own its accelerators, but
 * in a browser every promising chord is taken: `Ctrl+E` and `Ctrl+K` go to the address bar, `Ctrl+J`
 * to downloads, `Ctrl+1…9` to tabs, and none of them can be taken back by `preventDefault`. Plain
 * letters have no such owner as long as they are ignored while the caret is in a field, which is
 * exactly what `isTypingTarget` decides. `Ctrl/Cmd+Enter` is the one chord, because it is the one
 * that has to work *while* typing, and it is the send convention everywhere.
 */

export interface Shortcut {
  id: string;
  /**
   * What a person presses, as it should be printed.
   *
   * Not copy: `B` is the engraving on a key, and the voice standard §3 forbids translating or
   * transliterating it. What the row *describes* is copy, and lives in `phrase`.
   */
  keys: string;
  /** The dictionary entry that says what this does, in whichever language the chrome speaks. */
  phrase: PhraseKey;
  /**
   * Where it applies, so the list does not promise a viewer key on a page with no viewer.
   *
   * A grouping token, not a heading: the words the heading prints are
   * `session.shortcuts.scope-*`, and changing a value here renames a key rather than the text a
   * reader sees.
   */
  scope: 'Anywhere' | 'Session' | 'Document viewer';
}

export const SHORTCUTS: readonly Shortcut[] = [
  { id: 'shortcuts', keys: '?', phrase: 'session.shortcuts.show-list', scope: 'Anywhere' },
  {
    id: 'toggle-sidebar',
    keys: 'B',
    phrase: 'session.shortcuts.toggle-sidebar',
    scope: 'Session',
  },
  {
    id: 'focus-composer',
    keys: 'C',
    phrase: 'session.shortcuts.focus-composer',
    scope: 'Session',
  },
  { id: 'slash', keys: '/', phrase: 'session.shortcuts.slash', scope: 'Session' },
  { id: 'open-viewer', keys: 'V', phrase: 'session.shortcuts.open-viewer', scope: 'Session' },
  {
    id: 'view-outline',
    keys: '1',
    phrase: 'common.view-outline',
    scope: 'Document viewer',
  },
  {
    id: 'view-preview',
    keys: '2',
    phrase: 'common.view-preview',
    scope: 'Document viewer',
  },
  { id: 'view-raw', keys: '3', phrase: 'common.view-raw', scope: 'Document viewer' },
  { id: 'view-diff', keys: '4', phrase: 'common.view-diff', scope: 'Document viewer' },
  { id: 'close', keys: 'Esc', phrase: 'session.shortcuts.close', scope: 'Anywhere' },
  { id: 'send', keys: 'Ctrl/⌘ + Enter', phrase: 'session.shortcuts.send', scope: 'Session' },
];

export type ShortcutId = (typeof SHORTCUTS)[number]['id'];

/** What a key press looks like once the parts we care about are separated from the event. */
export interface KeyPress {
  /** The character the layout produced — «b» on QWERTY, «и» on ЙЦУКЕН for the same key. */
  key: string;
  /** Which physical key it was — `KeyB` for both of those. */
  code: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  /** Whether the caret is in something that accepts text. */
  typing: boolean;
}

/**
 * The physical keys the letter and digit shortcuts live on (task 143; voice standard §7.2).
 *
 * **Matching on the produced character shipped four dead shortcuts.** `case 'v'` is true only while
 * the layout is Latin: on ЙЦУКЕН the key engraved `V` reports «м», `B` reports «и», `C` reports «с»,
 * and `/` cannot be typed at all — so `toggle-sidebar`, `focus-composer`, `open-viewer` and `slash`
 * did nothing for the users this deployment is being translated for, while the in-app list went on
 * promising them. Keys are not translated (§3); what had to change is the reading of them.
 *
 * `code` names the key by its position, which is what a printed `B` means and what a user pressing
 * it expects. Numpad digits are listed beside the row digits because matching on the character used
 * to accept them and a translation is not the place to withdraw a binding.
 */
const BY_CODE: Readonly<Record<string, ShortcutId>> = {
  KeyB: 'toggle-sidebar',
  KeyC: 'focus-composer',
  KeyV: 'open-viewer',
  Slash: 'slash',
  Digit1: 'view-outline',
  Digit2: 'view-preview',
  Digit3: 'view-raw',
  Digit4: 'view-diff',
  Numpad1: 'view-outline',
  Numpad2: 'view-preview',
  Numpad3: 'view-raw',
  Numpad4: 'view-diff',
};

/**
 * Which shortcut a key press means, or `null`.
 *
 * Pure so it can be unit-tested without a browser, and so "does typing an X in the composer collapse
 * the sidebar" is a question with a written answer rather than an observed one.
 */
export function shortcutFor(press: KeyPress): ShortcutId | null {
  if (press.altKey) return null;

  const chord = press.ctrlKey || press.metaKey;

  if (chord) return press.key === 'Enter' ? 'send' : null;

  // Escape is the one plain key that means the same thing with the caret in a field: get me out.
  if (press.key === 'Escape') return 'close';
  if (press.typing) return null;

  /*
   * `?` is the character and not the key, and it has to be read before the table: it is Shift and
   * the `Slash` key on QWERTY but Shift and `Digit7` on ЙЦУКЕН, so the position tells us nothing
   * while the character tells us everything. Reading it first is also what keeps Shift+`/` opening
   * this list rather than the command menu.
   */
  if (press.key === '?') return 'shortcuts';

  return BY_CODE[press.code] ?? null;
}

/**
 * Whether an element accepts typed text.
 *
 * `contentEditable` is included because a rich-text field one day would otherwise silently start
 * eating letters into shortcuts; `select` is included because typing in a closed `<select>` jumps to
 * an option, which is typing by any useful definition.
 */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (target === null || !(typeof target === 'object') || !('tagName' in target)) return false;

  const element = target as { tagName?: unknown; isContentEditable?: unknown };
  const tag = typeof element.tagName === 'string' ? element.tagName.toLowerCase() : '';

  return (
    tag === 'input' || tag === 'textarea' || tag === 'select' || element.isContentEditable === true
  );
}

/** The dialog's open state, as a store — the header button and the `?` key both reach it. */
const listeners = new Set<() => void>();
let open = false;

export function shortcutsOpen(): boolean {
  return open;
}

/** Stable for the server, which never has the list open. */
export function shortcutsServerSnapshot(): boolean {
  return false;
}

export function setShortcutsOpen(next: boolean): void {
  if (open === next) return;
  open = next;
  for (const listener of listeners) listener();
}

export function subscribeShortcuts(listener: () => void): () => void {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

/** Test seam. Nothing in the application resets the store. */
export function resetShortcutsForTest(): void {
  open = false;
  listeners.clear();
}
