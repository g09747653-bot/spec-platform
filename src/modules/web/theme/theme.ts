import { UI_STATE_KEYS } from '../state/ui-state';

/**
 * Theme vocabulary (task 124; Эталон §1.5 — dark/light through client-side storage).
 *
 * The pure half lives here so the toggle, the pre-hydration script and the tests all read the same
 * key and the same attribute name. A second spelling of `'spec-platform-theme'` anywhere would be a
 * theme that persists in one place and is read from another.
 */

export const THEMES = ['light', 'dark'] as const;

export type Theme = (typeof THEMES)[number];

/**
 * `localStorage` key. Client-side by design: the theme is a device preference, not account data.
 *
 * Taken from the device-state inventory (task 141) rather than spelled here: the theme is one of
 * the four things this application remembers per device, and a desktop wrapper has to be able to
 * find all four in one place. The spelling itself is unchanged — see the note on `UI_STATE_KEYS`.
 */
export const THEME_STORAGE_KEY = UI_STATE_KEYS.theme;

/** Attribute on `<html>`; `brand.css` keys the dark palette off `:root[data-theme='dark']`. */
export const THEME_ATTRIBUTE = 'data-theme';

/**
 * The theme the server renders when it cannot know better.
 *
 * The document always ships with an explicit attribute rather than an absent one, so the CSS never
 * has to guess and the inline script has something to correct.
 */
export const SERVER_DEFAULT_THEME: Theme = 'light';

export function isTheme(value: unknown): value is Theme {
  return typeof value === 'string' && THEMES.includes(value as Theme);
}

export function otherTheme(theme: Theme): Theme {
  return theme === 'dark' ? 'light' : 'dark';
}

/**
 * Resolves the theme to apply from the two inputs available in the browser.
 *
 * A stored choice always wins — someone who picked light on a dark-mode machine meant it. With no
 * stored choice we follow the operating system, which is the behaviour a first visit should have.
 */
export function resolveTheme(stored: unknown, systemPrefersDark: boolean): Theme {
  if (isTheme(stored)) return stored;
  return systemPrefersDark ? 'dark' : 'light';
}

/**
 * The pre-hydration script, as source text.
 *
 * It runs synchronously while the browser parses `<head>`, before the first paint, which is the
 * only way to apply a client-side preference without a flash of the server's default
 * (Next.js — "How to prevent flash before hydration"). Kept as one expression with a `try` around
 * it: a browser with storage disabled must fall through to the default, not throw in `<head>`.
 */
export function themeScriptSource(): string {
  return (
    '(function(){try{' +
    `var s=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});` +
    "var d=window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches;" +
    `var t=(s===${JSON.stringify(THEMES[0])}||s===${JSON.stringify(THEMES[1])})?s:(d?'dark':'light');` +
    `document.documentElement.setAttribute(${JSON.stringify(THEME_ATTRIBUTE)},t);` +
    '}catch(e){}})()'
  );
}
