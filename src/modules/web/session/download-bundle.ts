'use client';

import { z } from 'zod';

/**
 * Downloading the bundle — one implementation, two buttons (task 126).
 *
 * The completion panel's Download and the export panel's Download must produce the same archive
 * byte for byte, and the way to make that true is for there to be one of them. Extracted from
 * `export-panel.tsx`, where it had been since task 22, the moment a second caller appeared: two
 * copies of "which endpoint, which mode, which manifest header" is two answers to what is in the ZIP,
 * and they would differ the first time export mode mattered.
 */

/** The manifest, as the export endpoint reports it. Parsed, because headers are a boundary. */
const FileList = z
  .string()
  .nullable()
  .transform((raw) =>
    (raw ?? '')
      .split(',')
      .map((name) => name.trim())
      .filter((name) => name !== ''),
  );

const ErrorBody = z.object({
  error: z.object({ code: z.string(), message: z.string() }),
});

export interface ExportManifest {
  mode: string;
  included: string[];
  omitted: string[];
}

export type DownloadOutcome =
  { ok: true; manifest: ExportManifest } | { ok: false; message: string };

export function readManifest(response: Response): ExportManifest {
  return {
    mode: response.headers.get('X-Spec-Export-Mode') ?? 'default',
    included: FileList.parse(response.headers.get('X-Spec-Export-Included')),
    omitted: FileList.parse(response.headers.get('X-Spec-Export-Omitted')),
  };
}

/**
 * Hands the archive to the browser.
 *
 * An object URL rather than a navigation, because the bytes are already in hand: the response had to
 * be read to learn what is in it, and downloading it a second time would be a second export — a
 * second `ExportRecord`, and a second chance for the two answers to differ.
 */
export function saveArchive(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');

  anchor.href = url;
  anchor.download = fileName;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();

  // Freed on the next tick: revoking synchronously races the browser's read of the URL.
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 0);
}

export async function downloadBundle(projectId: string, mode: string): Promise<DownloadOutcome> {
  try {
    const response = await fetch(`/api/projects/${projectId}/export?mode=${mode}`, {
      cache: 'no-store',
    });

    if (!response.ok) {
      const parsed = ErrorBody.safeParse(await response.json());

      return {
        ok: false,
        message: parsed.success ? parsed.data.error.message : 'The export could not be produced.',
      };
    }

    const manifest = readManifest(response);
    saveArchive(await response.blob(), `${projectId}-specs.zip`);

    return { ok: true, manifest };
  } catch {
    return {
      ok: false,
      message: 'The download did not start. Check your connection and try again.',
    };
  }
}
