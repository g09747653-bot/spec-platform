import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  SIDEBAR_DEFAULT_WIDTH,
  SIDEBAR_MAX_WIDTH,
  SIDEBAR_MIN_WIDTH,
  UI_STATE_KEYS,
  clampSidebarWidth,
  persistedValue,
  resetUiStateCache,
  sidebarCollapsedValue,
  sidebarWidthValue,
} from './ui-state';

/**
 * The device-state module (task 141).
 *
 * Two things are worth asserting and both were defects the milestone opened with: that a stored
 * value which would produce an unusable layout is *not* trusted, and that a collapsed sidebar is
 * remembered at all.
 */
function fakeStorage(): Storage {
  const map = new Map<string, string>();

  return {
    get length() {
      return map.size;
    },
    clear: () => {
      map.clear();
    },
    getItem: (key: string) => map.get(key) ?? null,
    key: (index: number) => [...map.keys()][index] ?? null,
    removeItem: (key: string) => {
      map.delete(key);
    },
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
  };
}

beforeEach(() => {
  vi.stubGlobal('window', {
    localStorage: fakeStorage(),
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  });
  resetUiStateCache();
});

describe('the stored sidebar width', () => {
  it('is the default when nothing is stored', () => {
    expect(sidebarWidthValue.snapshot()).toBe(SIDEBAR_DEFAULT_WIDTH);
  });

  it('refuses a width that would starve the conversation, however it got there', () => {
    // The value the customer's session actually had: dragged to the old maximum.
    window.localStorage.setItem(UI_STATE_KEYS.sidebarWidth, '5600');
    resetUiStateCache();
    expect(sidebarWidthValue.snapshot()).toBe(SIDEBAR_MAX_WIDTH);

    window.localStorage.setItem(UI_STATE_KEYS.sidebarWidth, '12');
    resetUiStateCache();
    expect(sidebarWidthValue.snapshot()).toBe(SIDEBAR_MIN_WIDTH);

    window.localStorage.setItem(UI_STATE_KEYS.sidebarWidth, 'not a number');
    resetUiStateCache();
    expect(sidebarWidthValue.snapshot()).toBe(SIDEBAR_DEFAULT_WIDTH);
  });

  it('clamps on the way out as well as on the way in', () => {
    sidebarWidthValue.set(9_000);
    expect(window.localStorage.getItem(UI_STATE_KEYS.sidebarWidth)).toBe(String(SIDEBAR_MAX_WIDTH));
    expect(clampSidebarWidth(Number.NaN)).toBe(SIDEBAR_DEFAULT_WIDTH);
  });

  it('renders on the server what the client renders on its first paint', () => {
    window.localStorage.setItem(UI_STATE_KEYS.sidebarWidth, '400');
    resetUiStateCache();

    expect(sidebarWidthValue.serverSnapshot()).toBe(SIDEBAR_DEFAULT_WIDTH);
  });
});

describe('the stored collapse state', () => {
  it('starts expanded and survives being set', () => {
    expect(sidebarCollapsedValue.snapshot()).toBe(false);

    sidebarCollapsedValue.set(true);
    expect(sidebarCollapsedValue.snapshot()).toBe(true);

    // What a reload does: a fresh read of the same device.
    resetUiStateCache();
    expect(sidebarCollapsedValue.snapshot()).toBe(true);
  });
});

describe('persistedValue', () => {
  it('notifies subscribers, and stops when they unsubscribe', () => {
    const value = persistedValue<string>({
      key: UI_STATE_KEYS.viewerView,
      fallback: 'preview',
      parse: (stored) => stored ?? 'preview',
      serialize: (next) => next,
    });

    let calls = 0;
    const stop = value.subscribe(() => {
      calls += 1;
    });

    value.set('raw');
    expect(calls).toBe(1);
    expect(value.snapshot()).toBe('raw');

    stop();
    value.set('diff');
    expect(calls).toBe(1);
  });

  it('survives storage being unavailable rather than taking the page with it', () => {
    vi.stubGlobal('window', {
      localStorage: {
        getItem: () => {
          throw new Error('storage disabled');
        },
        setItem: () => {
          throw new Error('storage disabled');
        },
      },
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    });
    resetUiStateCache();

    expect(sidebarWidthValue.snapshot()).toBe(SIDEBAR_DEFAULT_WIDTH);
    expect(() => {
      sidebarWidthValue.set(320);
    }).not.toThrow();
    // Applied for this visit even though it could not be written down.
    expect(sidebarWidthValue.snapshot()).toBe(320);
  });
});
