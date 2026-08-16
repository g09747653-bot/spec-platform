'use client';

import { useLayoutEffect, useSyncExternalStore } from 'react';

import { cn } from '../lib/cn';
import {
  isTheme,
  otherTheme,
  resolveTheme,
  SERVER_DEFAULT_THEME,
  THEME_ATTRIBUTE,
  THEME_STORAGE_KEY,
  type Theme,
} from './theme';

/**
 * The applied theme is not React state — it lives on `<html>`, where the pre-hydration script put
 * it before React existed, and in `localStorage`. Modelling it as an external store is what that
 * actually is: `useSyncExternalStore` reads the attribute, and anything that changes the attribute
 * (this toggle, another tab) notifies. Mirroring it into `useState` would create a second source of
 * truth that has to be kept in step with the first.
 */
const listeners = new Set<() => void>();

function notify() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);

  // Another tab changed the preference: apply it here too, then re-read.
  const onStorage = (event: StorageEvent) => {
    if (event.key !== THEME_STORAGE_KEY) return;
    applyTheme(resolveTheme(event.newValue, prefersDark()));
  };
  window.addEventListener('storage', onStorage);

  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

function appliedTheme(): Theme {
  const attribute = document.documentElement.getAttribute(THEME_ATTRIBUTE);
  return isTheme(attribute) ? attribute : SERVER_DEFAULT_THEME;
}

function applyTheme(theme: Theme): void {
  if (document.documentElement.getAttribute(THEME_ATTRIBUTE) === theme) return;
  document.documentElement.setAttribute(THEME_ATTRIBUTE, theme);
  notify();
}

function readStoredTheme(): Theme | null {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    return isTheme(stored) ? stored : null;
  } catch {
    return null;
  }
}

function prefersDark(): boolean {
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

/**
 * The light/dark switch (task 124).
 *
 * The layout effect covers a case the pre-hydration script alone does not: React's Strict Mode
 * remounts in development and resets `<html>` to the attributes it manages from JSX, discarding the
 * one the script set. Re-applying before paint makes development behave like production rather than
 * silently ignoring the stored preference (Next.js — "Preventing flash before hydration").
 */
export function ThemeToggle({ className }: { className?: string }) {
  const theme = useSyncExternalStore(subscribe, appliedTheme, () => SERVER_DEFAULT_THEME);

  useLayoutEffect(() => {
    applyTheme(resolveTheme(readStoredTheme(), prefersDark()));
  }, []);

  const next = otherTheme(theme);

  function toggle() {
    applyTheme(next);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Storage can be denied (private mode, blocked cookies). The theme still applies to this
      // page; only the persistence is lost, and that does not deserve an error surface.
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      data-testid="theme-toggle"
      data-theme-state={theme}
      aria-label={`Switch to ${next} theme`}
      title={`Switch to ${next} theme`}
      className={cn(
        'border-border-subtle text-foreground-muted hover:bg-surface-muted hover:text-foreground inline-flex h-8 w-8 items-center justify-center rounded-md border transition-colors',
        className,
      )}
    >
      {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}

function SunIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
    >
      <circle cx="12" cy="12" r="4" />
      <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6L17 7M7 17l-1.4 1.4" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z" />
    </svg>
  );
}
