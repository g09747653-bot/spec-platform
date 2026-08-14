import { describe, expect, it, vi } from 'vitest';

import { fileNamesForMode, isExportMode } from '../model/export';

import type { QualityPort } from './quality-port';
import { refuseIfStale, resolveExportMode, revisionOriginForMode } from './resolve-mode';

/**
 * Task 72 — mode resolution, as pure functions.
 *
 * The whole point of separating these three from the query is that the rules of constitution A6 are
 * decidable without a database, and so are testable without one. Everything here runs on literals.
 */
describe('export mode resolution (task 72)', () => {
  /** A port that records whether it was consulted — the assertion surface for AC-3. */
  const spyPort = (stale: boolean) => {
    const isStale = vi.fn(() => Promise.resolve(stale));
    return { port: { isStale } satisfies QualityPort, isStale };
  };

  describe('which mode applies', () => {
    it('forces default when no Quality capability is registered (AC-3)', () => {
      expect(resolveExportMode('quality', null)).toBe('default');
      expect(resolveExportMode('default', null)).toBe('default');
    });

    it('honours the declared mode when a capability is registered', () => {
      const { port } = spyPort(false);

      expect(resolveExportMode('quality', port)).toBe('quality');
      expect(resolveExportMode('default', port)).toBe('default');
    });

    /*
     * A6, first bullet, stated as a test: default mode is default mode *even on a session where
     * enrichment has run*. Nothing about the session reaches this function — that is the guarantee.
     */
    it('is a function of the request and the installation, and of nothing else', () => {
      const { port } = spyPort(true);

      expect(resolveExportMode('default', port)).toBe('default');
    });
  });

  describe('which revisions a mode resolves to', () => {
    it('pins default mode to pre-enrichment revisions, unconditionally (AC-1)', () => {
      expect(revisionOriginForMode('default')).toBe('parity');
    });

    it('lets quality mode take the newest revision of either origin', () => {
      expect(revisionOriginForMode('quality')).toBe('any');
    });
  });

  describe('which files a mode may contain (AC-2)', () => {
    it('is exactly the parity four in default mode (constitution P3)', () => {
      expect(fileNamesForMode('default')).toEqual([
        'constitution.md',
        'requirements.md',
        'solution.md',
        'tasks.md',
      ]);
    });

    it('adds quality.md after tasks.md in quality mode, and nothing else', () => {
      expect(fileNamesForMode('quality')).toEqual([
        'constitution.md',
        'requirements.md',
        'solution.md',
        'tasks.md',
        'quality.md',
      ]);
    });
  });

  describe('the staleness question', () => {
    /*
     * Task 72's acceptance criterion is "issue no staleness query", not "resolve to default". Those
     * differ: a version that asked and then ignored the answer would satisfy the second and fail the
     * first — and would call into a module that, in the parity build, does not exist.
     */
    it('is never asked when no capability is registered', async () => {
      await expect(refuseIfStale('quality', 'project-1', null)).resolves.toBeNull();
      await expect(refuseIfStale('default', 'project-1', null)).resolves.toBeNull();
    });

    it('is never asked for a default-mode export, even with a capability registered', async () => {
      const { port, isStale } = spyPort(true);

      await expect(refuseIfStale('default', 'project-1', port)).resolves.toBeNull();
      expect(isStale).not.toHaveBeenCalled();
    });

    it('refuses a quality-mode export whose enrichment is stale (A6)', async () => {
      const { port, isStale } = spyPort(true);

      await expect(refuseIfStale('quality', 'project-1', port)).resolves.toBe('EXPORT_STALE');
      expect(isStale).toHaveBeenCalledWith('project-1');
    });

    it('allows a quality-mode export whose enrichment is current', async () => {
      const { port, isStale } = spyPort(false);

      await expect(refuseIfStale('quality', 'project-1', port)).resolves.toBeNull();
      expect(isStale).toHaveBeenCalledOnce();
    });
  });

  describe('the mode a request may name', () => {
    it('recognises the two published modes and nothing else', () => {
      expect(isExportMode('default')).toBe(true);
      expect(isExportMode('quality')).toBe(true);
      expect(isExportMode('parity')).toBe(false);
      expect(isExportMode('')).toBe(false);
    });
  });
});
