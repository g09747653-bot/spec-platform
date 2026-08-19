'use client';

import { useEffect, useSyncExternalStore } from 'react';

import { useT } from '../i18n/locale-context';
import { cn } from '../lib/cn';

import {
  dismissToast,
  subscribeToasts,
  toastServerSnapshot,
  toastSnapshot,
  TOAST_DURATION_MS,
  type Toast,
} from './toast';

/**
 * Where toasts appear (task 125).
 *
 * Rendered once, by the shell. Two things make it accessible rather than merely visible:
 *
 * - the region is a **live region** (`aria-live="polite"`, `role="status"`), so a message announces
 *   itself to a screen reader without stealing focus — which matters because every toast here
 *   reports something the user *already did*, and none of them is a question;
 * - each toast keeps a **dismiss control**, so the message can be got rid of before its timeout and
 *   is never the only thing between the user and what is under it.
 *
 * The container is always in the DOM. A live region that is inserted at the same moment as its first
 * message is a region assistive technology was not watching yet, and the announcement is lost.
 */
export function ToastViewport() {
  const toasts = useSyncExternalStore(subscribeToasts, toastSnapshot, toastServerSnapshot);

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="false"
      data-testid="toast-viewport"
      className="pointer-events-none fixed inset-x-0 bottom-4 z-40 flex flex-col items-center gap-2 px-4"
    >
      {toasts.map((toast) => (
        <ToastRow key={toast.id} toast={toast} />
      ))}
    </div>
  );
}

const TONE_CLASS: Record<Toast['tone'], string> = {
  info: 'border-border-subtle bg-surface text-foreground',
  success: 'border-success-ink/40 bg-success-soft text-success-ink',
  danger: 'border-danger-ink/40 bg-danger-soft text-danger-ink',
};

function ToastRow({ toast }: { toast: Toast }) {
  const t = useT();
  const { id } = toast;

  useEffect(() => {
    const handle = setTimeout(() => {
      dismissToast(id);
    }, TOAST_DURATION_MS);

    return () => {
      clearTimeout(handle);
    };
  }, [id]);

  return (
    <div
      data-testid="toast"
      data-tone={toast.tone}
      // Task 143: which event this is, for a test that must not read the sentence to know.
      data-toast-kind={toast.kind}
      className={cn(
        'pointer-events-auto flex max-w-[32rem] items-start gap-3 rounded-md border px-4 py-2 shadow-sm',
        TONE_CLASS[toast.tone],
      )}
    >
      <span className="text-caption">{toast.message}</span>
      <button
        type="button"
        data-testid="toast-dismiss"
        aria-label={t('shell.toast.dismiss')}
        className="text-caption shrink-0 opacity-70 hover:opacity-100"
        onClick={() => {
          dismissToast(id);
        }}
      >
        ✕
      </button>
    </div>
  );
}
