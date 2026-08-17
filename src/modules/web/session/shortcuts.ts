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
  /** What a person presses, as it should be printed. */
  keys: string;
  label: string;
  /** Where it applies, so the list does not promise a viewer key on a page with no viewer. */
  scope: 'Anywhere' | 'Session' | 'Document viewer';
}

export const SHORTCUTS: readonly Shortcut[] = [
  { id: 'shortcuts', keys: '?', label: 'Show this list', scope: 'Anywhere' },
  { id: 'toggle-sidebar', keys: 'B', label: 'Collapse or expand the sidebar', scope: 'Session' },
  { id: 'focus-composer', keys: 'C', label: 'Jump to the message box', scope: 'Session' },
  { id: 'slash', keys: '/', label: 'Open the command menu', scope: 'Session' },
  { id: 'open-viewer', keys: 'V', label: 'Open the newest document', scope: 'Session' },
  { id: 'view-outline', keys: '1', label: 'Outline', scope: 'Document viewer' },
  { id: 'view-preview', keys: '2', label: 'Preview', scope: 'Document viewer' },
  { id: 'view-raw', keys: '3', label: 'Raw', scope: 'Document viewer' },
  { id: 'view-diff', keys: '4', label: 'Diff', scope: 'Document viewer' },
  { id: 'close', keys: 'Esc', label: 'Close the viewer or this list', scope: 'Anywhere' },
  { id: 'send', keys: 'Ctrl/⌘ + Enter', label: 'Send the message', scope: 'Session' },
];

export type ShortcutId = (typeof SHORTCUTS)[number]['id'];

/** What a key press looks like once the parts we care about are separated from the event. */
export interface KeyPress {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  /** Whether the caret is in something that accepts text. */
  typing: boolean;
}

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

  switch (press.key) {
    case '?':
      return 'shortcuts';
    case 'b':
    case 'B':
      return 'toggle-sidebar';
    case 'c':
    case 'C':
      return 'focus-composer';
    case '/':
      return 'slash';
    case 'v':
    case 'V':
      return 'open-viewer';
    case '1':
      return 'view-outline';
    case '2':
      return 'view-preview';
    case '3':
      return 'view-raw';
    case '4':
      return 'view-diff';
    default:
      return null;
  }
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
