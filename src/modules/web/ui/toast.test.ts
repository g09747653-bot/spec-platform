import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  dismissToast,
  MAX_VISIBLE_TOASTS,
  resetToastsForTest,
  showToast,
  subscribeToasts,
  toastServerSnapshot,
  toastSnapshot,
} from './toast';

describe('the toast store', () => {
  beforeEach(() => {
    resetToastsForTest();
  });

  it('raises a toast and notifies', () => {
    const listener = vi.fn();
    subscribeToasts(listener);

    const id = showToast('Chat archived.', 'success');

    expect(listener).toHaveBeenCalledTimes(1);
    expect(toastSnapshot()).toEqual([{ id, message: 'Chat archived.', tone: 'success' }]);
  });

  it('defaults to the neutral tone', () => {
    showToast('Something happened.');

    expect(toastSnapshot()[0]?.tone).toBe('info');
  });

  it('keeps ids unique so two identical messages are two toasts', () => {
    const first = showToast('Copied.');
    const second = showToast('Copied.');

    expect(first).not.toBe(second);
    expect(toastSnapshot()).toHaveLength(2);
  });

  it('drops the oldest past the visible limit', () => {
    for (let index = 0; index <= MAX_VISIBLE_TOASTS; index += 1) {
      showToast(`message ${String(index)}`);
    }

    const messages = toastSnapshot().map((toast) => toast.message);
    expect(messages).toHaveLength(MAX_VISIBLE_TOASTS);
    expect(messages).not.toContain('message 0');
  });

  it('dismisses by id, and dismissing an unknown id notifies nobody', () => {
    const id = showToast('Downloaded.');
    const listener = vi.fn();
    subscribeToasts(listener);

    dismissToast('toast-does-not-exist');
    expect(listener).not.toHaveBeenCalled();

    dismissToast(id);
    expect(toastSnapshot()).toEqual([]);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  /*
   * `useSyncExternalStore` compares snapshots by identity and re-renders when they differ. A server
   * snapshot that built a fresh array each call would differ from itself on every render, which is
   * an infinite loop rather than a subtle inefficiency.
   */
  it('returns a stable empty snapshot on the server', () => {
    expect(toastServerSnapshot()).toBe(toastServerSnapshot());
    expect(toastServerSnapshot()).toEqual([]);
  });
});
