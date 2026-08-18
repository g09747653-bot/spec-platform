import { runInNewContext } from 'node:vm';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  SIDEBAR_DEFAULT_WIDTH,
  SIDEBAR_MAX_WIDTH,
  SIDEBAR_MIN_WIDTH,
  SIDEBAR_WIDTH_PROPERTY,
  UI_STATE_KEYS,
  clampSidebarWidth,
  persistedValue,
  resetUiStateCache,
  sidebarCollapsedValue,
  sidebarWidthValue,
  uiStateScriptSource,
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

/**
 * The pre-paint script, run rather than read (found by the M12п live walk).
 *
 * The script exists to stop a stored width arriving a frame late (D-198), and the walk measured the
 * cost of the way it was written: on a session with nothing stored, the sidebar was 220 px — the
 * clamp's minimum — where the stylesheet declares 300. `Number(null)` is `0` and `isFinite(0)` is
 * true, so the guard let «nothing stored» through and the clamp lifted it to the floor.
 *
 * It survived round 1 because every test that touched this path wrote a width into storage before
 * reloading, so the first-visit branch — the one every new user takes — was the only one nobody ran.
 * These run the source itself, in a sandbox with just the two globals it reaches for.
 */
describe('the pre-paint sidebar script', () => {
  const runWith = (stored: string | null): ReturnType<typeof vi.fn> => {
    const setProperty = vi.fn();

    runInNewContext(uiStateScriptSource(), {
      localStorage: {
        getItem: (key: string) => (key === UI_STATE_KEYS.sidebarWidth ? stored : null),
      },
      document: { documentElement: { style: { setProperty } } },
    });

    return setProperty;
  };

  it('says nothing on a first visit, so the stylesheet default stands', () => {
    expect(runWith(null)).not.toHaveBeenCalled();
    expect(runWith('')).not.toHaveBeenCalled();
  });

  it('paints a stored width before the first paint', () => {
    expect(runWith('350')).toHaveBeenCalledWith(SIDEBAR_WIDTH_PROPERTY, '350px');
  });

  it('clamps a stored width that would produce an unusable layout', () => {
    expect(runWith('5600')).toHaveBeenCalledWith(
      SIDEBAR_WIDTH_PROPERTY,
      `${String(SIDEBAR_MAX_WIDTH)}px`,
    );
    expect(runWith('40')).toHaveBeenCalledWith(
      SIDEBAR_WIDTH_PROPERTY,
      `${String(SIDEBAR_MIN_WIDTH)}px`,
    );
  });

  it('ignores a stored value that is not a width', () => {
    expect(runWith('as wide as possible')).not.toHaveBeenCalled();
    expect(runWith('0')).not.toHaveBeenCalled();
    expect(runWith('-200')).not.toHaveBeenCalled();
  });
});
