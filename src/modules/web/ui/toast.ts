/**
 * Toasts (task 125; Эталон §1.5 — sonner-style notifications).
 *
 * A module-level store rather than a context, for the reason contexts exist to avoid: the things
 * that raise a toast — archiving a chat in a list, copying a file in the viewer, downloading a
 * bundle from a panel — have no ancestor in common except the shell, and threading a provider
 * through every one of them buys nothing over a store they can all import.
 *
 * Pure: no timers, no DOM, no React. Dismissal-by-timeout is the viewport's business, because a
 * timer is a React lifetime concern and this is a list.
 */

export type ToastTone = 'info' | 'success' | 'danger';

export interface Toast {
  id: string;
  message: string;
  tone: ToastTone;
}

/** How long a toast stays before the viewport dismisses it. */
export const TOAST_DURATION_MS = 5_000;

/** Above this, the oldest is dropped: a stack taller than the screen announces nothing. */
export const MAX_VISIBLE_TOASTS = 3;

const listeners = new Set<() => void>();

let toasts: readonly Toast[] = [];
let counter = 0;

function publish(next: readonly Toast[]): void {
  toasts = next;
  for (const listener of listeners) listener();
}

/** Raises a toast and returns its id, so a caller can dismiss it early. */
export function showToast(message: string, tone: ToastTone = 'info'): string {
  counter += 1;
  const id = `toast-${String(counter)}`;

  publish([...toasts, { id, message, tone }].slice(-MAX_VISIBLE_TOASTS));

  return id;
}

export function dismissToast(id: string): void {
  const next = toasts.filter((toast) => toast.id !== id);
  if (next.length !== toasts.length) publish(next);
}

export function toastSnapshot(): readonly Toast[] {
  return toasts;
}

/** Stable empty list: a new array per server render would loop `useSyncExternalStore`. */
const NONE: readonly Toast[] = [];

export function toastServerSnapshot(): readonly Toast[] {
  return NONE;
}

export function subscribeToasts(listener: () => void): () => void {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

/** Test seam. Nothing in the application resets the store. */
export function resetToastsForTest(): void {
  toasts = [];
  counter = 0;
  listeners.clear();
}
