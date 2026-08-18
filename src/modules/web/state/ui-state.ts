/**
 * Every piece of interface state this device remembers, in one module (task 141).
 *
 * **Why one module.** The shell is meant to survive being wrapped in a desktop application later,
 * and the single thing such a wrapper has to replace is *where preferences live* — `localStorage`
 * in a browser, a settings file or a keychain-backed store on a desktop. That substitution is a
 * one-file change only while there is one file: a sidebar that reads `localStorage` directly, a
 * theme that reads it in an inline script, and a viewer that reads it in a component are three
 * ports, and the third one is always the one that gets missed. So every stored key is declared in
 * `UI_STATE_KEYS` below and every read and write goes through `persistedValue`.
 *
 * **Why an external store rather than state plus an effect.** The value exists before React does —
 * the theme is applied by a script in `<head>`, and the sidebar's width is known at first paint.
 * `useSyncExternalStore` models exactly that: a snapshot the browser can answer at any moment and a
 * subscription for when it changes. Mirroring it into `useState` would make a second source of
 * truth and need an effect to keep it in step, which is the pattern D-164 removed from the theme.
 *
 * **Cross-tab for free.** The `storage` event fires in *other* documents of the same origin, so a
 * width dragged in one tab lands in the next one without a poll. A desktop store would emit its own
 * change event into the same subscription.
 */

/**
 * The device-local inventory. One entry per remembered preference; nothing else may name a key.
 *
 * The theme's key keeps its original spelling rather than being renamed into the `spec-platform:`
 * namespace: it is written by the pre-hydration script in every user's browser already, and a
 * rename would silently reset the theme of everyone who had chosen one. The point of this table is
 * that the spelling is written once, not that it is uniform.
 */
export const UI_STATE_KEYS = {
  theme: 'spec-platform-theme',
  sidebarWidth: 'spec-platform:sidebar-width',
  sidebarCollapsed: 'spec-platform:sidebar-collapsed',
  viewerView: 'spec-platform:viewer-view',
  /*
   * The chrome language (task 143) — declared here like every other preference, and stored somewhere
   * else: it is a **cookie**, because the server has to know it before it renders a single word.
   * That is the whole of D-214, argued in `i18n/locale.ts`. The spelling drops the colon on purpose:
   * a cookie name is an RFC 6265 token and `:` is not a token character, so browsers tolerate it but
   * nothing between us and the browser is obliged to. It follows the theme's hyphen instead, which is
   * exactly the licence this table's own note gives — the point is that the spelling is written once.
   */
  locale: 'spec-platform-locale',
} as const;

export type UiStateKey = (typeof UI_STATE_KEYS)[keyof typeof UI_STATE_KEYS];

/**
 * A value that persists on this device, shaped for `useSyncExternalStore`.
 *
 * `serverSnapshot` is deliberately the fallback and not the stored value: the server has no device
 * to read, so the only value it can render is the one the client's *first* paint will also render.
 * Rendering anything else would be a hydration mismatch by construction (the lesson of D-28).
 */
export interface PersistedValue<T> {
  readonly key: UiStateKey;
  subscribe: (listener: () => void) => () => void;
  snapshot: () => T;
  serverSnapshot: () => T;
  set: (next: T) => void;
}

interface PersistedValueOptions<T> {
  key: UiStateKey;
  fallback: T;
  /** Turns whatever is stored (or nothing) into a value. Must never throw. */
  parse: (stored: string | null) => T;
  serialize: (value: T) => string;
}

/** Listeners are per key, so two components watching the sidebar width share one subscription. */
const listeners = new Map<string, Set<() => void>>();
/** Read-through cache: `snapshot` must be referentially stable between changes, or React loops. */
const cache = new Map<string, unknown>();

let watchingStorage = false;

function notify(key: string): void {
  for (const listener of listeners.get(key) ?? []) listener();
}

/**
 * One `storage` listener for the whole module, attached on first subscription.
 *
 * Another tab's write invalidates the cache and wakes every subscriber of that key. `newValue` is
 * ignored on purpose — re-reading through `parse` keeps one code path for "what does the stored
 * text mean", instead of a second, subtly different one for the cross-tab case.
 */
function watchStorage(): void {
  if (watchingStorage || typeof window === 'undefined') return;
  watchingStorage = true;

  window.addEventListener('storage', (event) => {
    if (event.key === null) {
      cache.clear();
      for (const key of listeners.keys()) notify(key);
      return;
    }

    if (!listeners.has(event.key)) return;
    cache.delete(event.key);
    notify(event.key);
  });
}

export function persistedValue<T>({
  key,
  fallback,
  parse,
  serialize,
}: PersistedValueOptions<T>): PersistedValue<T> {
  return {
    key,

    subscribe(listener) {
      watchStorage();
      const set = listeners.get(key) ?? new Set();
      set.add(listener);
      listeners.set(key, set);

      return () => {
        set.delete(listener);
      };
    },

    snapshot() {
      if (!cache.has(key)) cache.set(key, parse(readRaw(key)));

      return cache.get(key) as T;
    },

    serverSnapshot: () => fallback,

    set(next) {
      cache.set(key, next);
      writeRaw(key, serialize(next));
      notify(key);
    },
  };
}

/**
 * The two functions that touch the device, and the only ones.
 *
 * Both swallow: storage can be disabled, full, or partitioned, and none of those is a reason for a
 * preference to take the page down with it. A read that fails is "no preference stored", which is
 * a state the application already has to handle.
 */
function readRaw(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeRaw(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* A preference that cannot be stored is still applied for this visit. */
  }
}

/** Test seam: drops the read-through cache so a fresh `localStorage` is observed. */
export function resetUiStateCache(): void {
  cache.clear();
}

/**
 * Sidebar width, in CSS pixels.
 *
 * The clamp lives with the value rather than in the component, because "what widths are legal" is a
 * property of the stored preference: a hand-edited `localStorage` entry, or one written by an older
 * build with a wider maximum, must not be able to produce a layout the user cannot recover from —
 * which is precisely the defect this milestone opened with.
 */
export const SIDEBAR_DEFAULT_WIDTH = 300;
export const SIDEBAR_MIN_WIDTH = 220;
export const SIDEBAR_MAX_WIDTH = 480;

export function clampSidebarWidth(value: number): number {
  if (!Number.isFinite(value)) return SIDEBAR_DEFAULT_WIDTH;

  return Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, Math.round(value)));
}

export const sidebarWidthValue = persistedValue<number>({
  key: UI_STATE_KEYS.sidebarWidth,
  fallback: SIDEBAR_DEFAULT_WIDTH,
  parse: (stored) => clampSidebarWidth(Number(stored ?? SIDEBAR_DEFAULT_WIDTH)),
  serialize: (value) => String(clampSidebarWidth(value)),
});

/**
 * The custom property the sidebar's width is actually painted from.
 *
 * **Why a CSS variable and not the React value.** The stored width is known to the browser before
 * React exists, and the server cannot know it at all — so a pane whose width came from state
 * rendered at the default and jumped to the stored value once hydration finished. On a fast engine
 * that is a frame; on WebKit it was visible, and a measurement taken in between reported the wrong
 * width truthfully. This is the same problem the theme has, solved the same way (D-164): a
 * synchronous script in `<head>` writes the value before the first paint, and the element's style
 * is the variable rather than a number, so server and client render identical markup.
 */
export const SIDEBAR_WIDTH_PROPERTY = '--sidebar-width';

/** Stores the width and paints it, in that order. The only way the sidebar's width changes. */
export function setSidebarWidth(next: number): void {
  const width = clampSidebarWidth(next);
  sidebarWidthValue.set(width);
  paintSidebarWidth(width);
}

function paintSidebarWidth(width: number): void {
  try {
    document.documentElement.style.setProperty(SIDEBAR_WIDTH_PROPERTY, `${String(width)}px`);
  } catch {
    /* No document (a test importing the pure half). The stored value is still the truth. */
  }
}

/**
 * The pre-paint script, as source text.
 *
 * Kept as one expression with a `try` around it, like the theme's: a browser with storage disabled
 * must fall through to the stylesheet's default, not throw while `<head>` is being parsed. The
 * clamp is repeated here rather than imported because this string runs before any module does — and
 * the bounds are interpolated from the constants above, so there is still one place to change them.
 *
 * **The guard asks the string, not the number, and the first version asked the number** (found by
 * the M12п live walk). `localStorage.getItem` answers `null` when nothing is stored; `Number(null)`
 * is `0`, and `isFinite(0)` is true — so «nothing stored» walked straight past the guard, the clamp
 * lifted zero to the minimum, and the script pinned `--sidebar-width: 220px` before the first paint
 * of every first visit. The stylesheet's declared 300 was overridden by a script whose whole purpose
 * is to do nothing when there is nothing to say, and no test caught it because every test seeded a
 * width before reloading. A stored value still wins, exactly as before.
 */
export function uiStateScriptSource(): string {
  return (
    '(function(){try{' +
    `var s=localStorage.getItem(${JSON.stringify(UI_STATE_KEYS.sidebarWidth)});` +
    `if(s===null||s==='')return;` +
    `var w=Number(s);` +
    `if(!isFinite(w)||w<=0)return;` +
    `w=Math.min(${String(SIDEBAR_MAX_WIDTH)},Math.max(${String(SIDEBAR_MIN_WIDTH)},Math.round(w)));` +
    `document.documentElement.style.setProperty(${JSON.stringify(SIDEBAR_WIDTH_PROPERTY)},w+'px');` +
    '}catch(e){}})()'
  );
}

/**
 * Whether the sidebar is collapsed.
 *
 * Stored, because a collapse that a reload undoes is not a preference — and because the customer's
 * report of the collapse being irreversible was, in part, exactly this: the only way back was a
 * reload, and a reload put it back whether or not that is what the person wanted.
 */
export const sidebarCollapsedValue = persistedValue<boolean>({
  key: UI_STATE_KEYS.sidebarCollapsed,
  fallback: false,
  parse: (stored) => stored === 'true',
  serialize: (value) => String(value),
});

/** The viewer pane's last view, so opening a document twice opens it the way it was left. */
export const viewerViewValue = persistedValue<string>({
  key: UI_STATE_KEYS.viewerView,
  fallback: 'preview',
  parse: (stored) => stored ?? 'preview',
  serialize: (value) => value,
});
