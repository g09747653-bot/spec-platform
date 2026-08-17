'use client';

import { useSyncExternalStore } from 'react';

import type { PersistedValue } from './ui-state';

/**
 * Reads a persisted preference and returns a setter (task 141).
 *
 * The whole hook is three arguments to `useSyncExternalStore`, and that is the point: components
 * that remember something do it through here, so the list of what this device stores is the list in
 * `ui-state.ts` and nowhere else.
 */
export function useUiState<T>(value: PersistedValue<T>): [T, (next: T) => void] {
  const current = useSyncExternalStore(value.subscribe, value.snapshot, value.serverSnapshot);

  return [current, value.set];
}
